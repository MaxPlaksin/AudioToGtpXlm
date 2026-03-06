/**
 * Хук для разделения аудио на инструменты (demucs-web)
 * Модель автоматически скачивается с Hugging Face и кэшируется в IndexedDB
 */

import { useCallback, useRef, useState } from 'react';
import type { AudioStems } from '../types/audio.types';
import { fileToAudioBuffer, resampleTo44100Stereo } from '../utils/audioBuffer';
import {
  getCachedModel,
  cacheModel,
  DEMUCS_MODEL_KEY,
} from '../utils/modelCache';
import { validateStemSeparation } from '../utils/stemValidation';

export interface UseAudioSeparationResult {
  stems: AudioStems | null;
  isLoading: boolean;
  progress: number;
  downloadProgress: number;
  error: string | null;
  separationWarning: string | null;
  usedFallback: boolean;
  separate: (file: File) => Promise<AudioStems | null>;
  loadStemsFromFiles: (files: File[]) => Promise<AudioStems | null>;
  reset: () => void;
}

const MODEL_URL_REMOTE =
  'https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx';
const MODEL_URL_LOCAL = '/models/htdemucs_embedded.onnx';
const BACKEND_URL = '/api';

async function decodeBase64WavToBuffer(base64: string): Promise<AudioBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ctx = new AudioContext();
  return ctx.decodeAudioData(bytes.buffer);
}

async function safeJson<T>(response: Response, fallback: T): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

async function separateViaBackend(file: File): Promise<AudioStems | null> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/health`);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const health = await safeJson<{ demucs?: boolean }>(res, {});
  if (!health.demucs) return null;

  const form = new FormData();
  form.append('file', file);

  let sepRes: Response;
  try {
    sepRes = await fetch(`${BACKEND_URL}/separate`, {
      method: 'POST',
      body: form,
    });
  } catch (e) {
    throw new Error('Сервер недоступен. Запустите backend: npm run dev');
  }
  if (!sepRes.ok) {
    const err = await safeJson<{ detail?: string }>(sepRes, {});
    throw new Error(err.detail ?? `Backend: ${sepRes.status}`);
  }

  const data = (await safeJson(sepRes, {})) as Record<string, string>;
  const hasStems = Object.keys(data).some((k) => ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'].includes(k));
  if (!hasStems) return null;

  const originalBuf = await fileToAudioBuffer(file);
  const stemsResult: AudioStems = { original: originalBuf };

  for (const name of ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'] as const) {
    const b64 = data[name];
    if (b64) {
      stemsResult[name] = await decodeBase64WavToBuffer(b64);
    }
  }
  return stemsResult;
}

function createAudioBufferFromChannels(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number
): AudioBuffer {
  const ctx = new AudioContext({ sampleRate });
  const buffer = ctx.createBuffer(2, left.length, sampleRate);
  buffer.copyToChannel(new Float32Array(left), 0);
  buffer.copyToChannel(new Float32Array(right), 1);
  return buffer;
}

function createPlaceholderStems(original: AudioBuffer): AudioStems {
  return {
    original,
    vocals: original,
    drums: original,
    bass: original,
    other: original,
    guitar: original,
    piano: original,
  };
}

const STEM_ORDER: (keyof Omit<AudioStems, 'original'>)[] = ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'];
const STEM_PATTERNS: [RegExp, keyof Omit<AudioStems, 'original'>][] = [
  [/vocal|вокал/i, 'vocals'],
  [/drum|ударн|percussion/i, 'drums'],
  [/bass|бас|басс/i, 'bass'],
  [/guitar|гитар/i, 'guitar'],
  [/piano|пиан|keys/i, 'piano'],
  [/other|друг/i, 'other'],
];

function matchStemName(filename: string): keyof Omit<AudioStems, 'original'> | null {
  for (const [re, stem] of STEM_PATTERNS) {
    if (re.test(filename)) return stem;
  }
  return null;
}

export function useAudioSeparation(): UseAudioSeparationResult {
  const [stems, setStems] = useState<AudioStems | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [separationWarning, setSeparationWarning] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const processorRef = useRef<{
    loadModel: (urlOrBuffer: string | ArrayBuffer) => Promise<unknown>;
    separate: (
      left: Float32Array,
      right: Float32Array
    ) => Promise<{
      drums: { left: Float32Array; right: Float32Array };
      bass: { left: Float32Array; right: Float32Array };
      other: { left: Float32Array; right: Float32Array };
      vocals: { left: Float32Array; right: Float32Array };
    }>;
  } | null>(null);

  const separate = useCallback(async (file: File): Promise<AudioStems | null> => {
    setIsLoading(true);
    setProgress(0);
    setDownloadProgress(0);
    setError(null);
    setStems(null);
    setSeparationWarning(null);
    setUsedFallback(false);

    try {
      setProgress(5);
      const backendStems = await separateViaBackend(file);
      if (backendStems) {
        setProgress(100);
        setStems(backendStems);
        setSeparationWarning(null);
        return backendStems;
      }

      setSeparationWarning(
        'Backend Demucs не запущен — используется браузерная модель. Для качественного разделения: npm run setup'
      );

      const audioBuffer = await fileToAudioBuffer(file);
      const resampled = resampleTo44100Stereo(audioBuffer);
      const left = resampled.getChannelData(0);
      const right = resampled.getChannelData(1);

      setProgress(8);

      if (!processorRef.current) {
        const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
        const basePath = base.endsWith('/') ? base : base + '/';
        const origin = typeof location !== 'undefined' ? location.origin : '';
        const ortModule = await import('onnxruntime-web/wasm');
        const ort = ortModule.default;
        ort.env.wasm.wasmPaths = {
          wasm: `${origin}${basePath}onnx-wasm/ort-wasm-simd-threaded.wasm`,
          mjs: `${origin}${basePath}onnx-wasm/ort-wasm-simd-threaded.mjs`,
        };
        const crossOriginIsolated = window.crossOriginIsolated ?? false;
        ort.env.wasm.numThreads = crossOriginIsolated
          ? Math.min(navigator.hardwareConcurrency || 4, 8)
          : 1;

        const demucsModule = await import('demucs-web');

        const { DemucsProcessor } = demucsModule;

        const processor = new DemucsProcessor({
          ort,
          onProgress: ({ progress: p }: { progress: number }) => {
            setProgress(15 + p * 75);
          },
          onDownloadProgress: (loaded: number, total: number) => {
            setDownloadProgress(total > 0 ? (loaded / total) * 100 : 0);
          },
        });

        const cached = await getCachedModel(DEMUCS_MODEL_KEY);
        if (cached) {
          setProgress(12);
          setDownloadProgress(100);
          await processor.loadModel(cached);
        } else {
          setProgress(8);
          let response = await fetch(MODEL_URL_LOCAL);
          if (!response.ok) {
            response = await fetch(MODEL_URL_REMOTE, {
              mode: 'cors',
              credentials: 'omit',
            });
          }
          if (!response.ok) {
            throw new Error(
              `Не удалось загрузить модель (${response.status}). Запустите: ./scripts/download-demucs-model.sh`
            );
          }
          const contentLength = response.headers.get('Content-Length');
          const total = contentLength ? parseInt(contentLength, 10) : 0;
          const reader = response.body?.getReader();
          if (reader && total > 0) {
            const chunks: Uint8Array[] = [];
            let loaded = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              loaded += value.length;
              setDownloadProgress((loaded / total) * 100);
            }
            const combined = new Uint8Array(loaded);
            let offset = 0;
            for (const chunk of chunks) {
              combined.set(chunk, offset);
              offset += chunk.length;
            }
            const buffer = combined.buffer;
            await cacheModel(DEMUCS_MODEL_KEY, buffer);
            await processor.loadModel(buffer);
          } else {
            const buffer = await response.arrayBuffer();
            await cacheModel(DEMUCS_MODEL_KEY, buffer);
            await processor.loadModel(buffer);
          }
        }

        processorRef.current = processor;
      }

      setProgress(15);

      const processor = processorRef.current;
      if (!processor) throw new Error('Процессор не инициализирован');
      const result = await processor.separate(left, right);

      const stemsResult: AudioStems = {
        original: audioBuffer,
        drums: createAudioBufferFromChannels(
          result.drums.left,
          result.drums.right,
          44100
        ),
        bass: createAudioBufferFromChannels(
          result.bass.left,
          result.bass.right,
          44100
        ),
        other: createAudioBufferFromChannels(
          result.other.left,
          result.other.right,
          44100
        ),
        vocals: createAudioBufferFromChannels(
          result.vocals.left,
          result.vocals.right,
          44100
        ),
      };

      const validation = validateStemSeparation(stemsResult);
      setUsedFallback(false);
      if (validation.warning) {
        setSeparationWarning(validation.warning);
      } else {
        setSeparationWarning(null);
      }

      setProgress(100);
      setStems(stemsResult);
      return stemsResult;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Ошибка разделения аудио';
      setError(message);
      setSeparationWarning(null);
      setUsedFallback(true);
      console.error('Audio separation error:', err);

      try {
        const fallbackBuffer = await fileToAudioBuffer(file);
        const fallback = createPlaceholderStems(fallbackBuffer);
        setStems(fallback);
        setProgress(100);
        const isWasmError = /WASM|WebAssembly|magic word|initWasm/i.test(message);
        setError(
          isWasmError
            ? 'Браузерная модель недоступна. Загрузите готовые stems или настройте backend: npm run setup'
            : `${message} Показаны копии оригинала. Загрузите готовые stems или настройте backend.`
        );
        setSeparationWarning(
          'Разделение не сработало. Варианты: 1) Загрузите готовые stems во вкладке «Конвертация в MIDI». 2) Запустите backend: npm run dev и npm run setup'
        );
        return fallback;
      } catch {
        return null;
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadStemsFromFiles = useCallback(
    async (files: File[]): Promise<AudioStems | null> => {
      setIsLoading(true);
      setProgress(0);
      setError(null);
      setSeparationWarning(null);
      setUsedFallback(false);
      setStems(null);

      try {
        const decoded: { stem: keyof Omit<AudioStems, 'original'>; buffer: AudioBuffer }[] = [];
        const ctx = new AudioContext();

        for (const file of files) {
          const stem = matchStemName(file.name);
          if (!stem) continue;
          const buf = await ctx.decodeAudioData(await file.arrayBuffer());
          decoded.push({ stem, buffer: buf });
        }

        if (decoded.length < 2) {
          setError('Нужно минимум 2 файла stems (vocals, drums, bass, other)');
          return null;
        }

        const stemsMap: Partial<Record<keyof Omit<AudioStems, 'original'>, AudioBuffer>> = {};
        for (const stem of STEM_ORDER) {
          const found = decoded.find((d) => d.stem === stem);
          if (found) stemsMap[stem] = found.buffer;
        }
        for (const { stem, buffer } of decoded) {
          if (!stemsMap[stem]) stemsMap[stem] = buffer;
        }

        const maxLen = Math.max(...decoded.map((d) => d.buffer.length));
        const maxRate = Math.max(...decoded.map((d) => d.buffer.sampleRate));
        const mixed = ctx.createBuffer(1, maxLen, maxRate);
        const mixedData = mixed.getChannelData(0);
        mixedData.fill(0);
        for (const { buffer } of decoded) {
          const data = buffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) {
            mixedData[i] += data[i];
          }
        }
        for (let i = 0; i < mixedData.length; i++) {
          mixedData[i] /= decoded.length;
        }

        const stemsResult: AudioStems = {
          original: mixed,
          ...(stemsMap as Omit<AudioStems, 'original'>),
        };

        setStems(stemsResult);
        setProgress(100);
        return stemsResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка загрузки stems';
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setStems(null);
    setProgress(0);
    setDownloadProgress(0);
    setError(null);
    setSeparationWarning(null);
    setUsedFallback(false);
  }, []);

  return {
    stems,
    isLoading,
    progress,
    downloadProgress,
    error,
    separationWarning,
    usedFallback,
    separate,
    loadStemsFromFiles,
    reset,
  };
}
