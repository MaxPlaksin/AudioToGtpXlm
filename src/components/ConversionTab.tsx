/**
 * Вкладка «Конвертация в MIDI» — слева разбор на дорожки, справа одна дорожка, темп из трека
 */

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { ProcessingStatus } from './ProcessingStatus';
import { ExportSection } from './ExportSection';
import type { AudioStems, MidiTrackData } from '../types/audio.types';
import { useAudioSeparation } from '../hooks/useAudioSeparation';
import { useMidiConversion } from '../hooks/useMidiConversion';
import { useGtpExport } from '../hooks/useGtpExport';
import { fileToAudioBuffer } from '../utils/audioBuffer';
import { AlphaTabPlayer } from './AlphaTabPlayer';

const AUDIO_EXT = /\.(wav|mp3|flac|m4a)$/i;
const AUDIO_ACCEPT = '.wav,.mp3,.flac,.m4a,audio/wav,audio/mpeg,audio/flac,audio/mp4';
const DEFAULT_TEMPO = 120;
const MIN_TEMPO = 20;
const MAX_TEMPO = 300;

async function detectBpmFromFile(file: File): Promise<{ bpm: number; key: string | null }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/detect-bpm', { method: 'POST', body: form });
  if (!res.ok) return { bpm: DEFAULT_TEMPO, key: null };
  const data = await res.json().catch(() => ({}));
  const bpm = typeof data.bpm === 'number' && data.bpm > 0 ? data.bpm : DEFAULT_TEMPO;
  const key = typeof data.key === 'string' ? data.key : null;
  return { bpm, key };
}

export function ConversionTab() {
  const [baseFilename, setBaseFilename] = useState('converted');
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const [detectedKey, setDetectedKey] = useState<string | null>(null);
  const [manualTempo, setManualTempo] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const separation = useAudioSeparation();
  const midiConversion = useMidiConversion();
  const { exportMidi, exportGtp, gtpError } = useGtpExport();

  const stems = separation.stems;
  const tracks = midiConversion.tracks;
  const isLoading = separation.isLoading || midiConversion.isLoading;
  const error = separation.error ?? midiConversion.error ?? uploadError;

  const handleStemsSelect = useCallback(
    async (files: File[]) => {
      const name = files[0]?.name?.replace(/\.[^.]+$/, '') ?? 'converted';
      setBaseFilename(name);
      setDetectedBpm(null);
      setDetectedKey(null);
      const loaded = await separation.loadStemsFromFiles(files);
      if (loaded) {
        const converted = await midiConversion.convert(loaded, { multiTrack: true });
        return converted;
      }
      return null;
    },
    [separation, midiConversion]
  );

  const handleSplitFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      setManualTempo(null);
      const name = file.name?.replace(/\.[^.]+$/, '') ?? 'converted';
      setBaseFilename(name);
      try {
        const { bpm, key } = await detectBpmFromFile(file);
        setDetectedBpm(bpm);
        setDetectedKey(key);
      } catch {
        setDetectedBpm(null);
        setDetectedKey(null);
      }
      let stemsResult: AudioStems | null = null;
      try {
        stemsResult = await separation.separate(file);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : 'Ошибка разделения');
        return null;
      }
      if (!stemsResult) {
        try {
          const buffer = await fileToAudioBuffer(file);
          stemsResult = { original: buffer, other: buffer };
          separation.setStemsFromProject(stemsResult);
        } catch (e) {
          setUploadError(e instanceof Error ? e.message : 'Не удалось декодировать аудио');
          return null;
        }
      }
      const converted = await midiConversion.convert(stemsResult, { multiTrack: true });
      return converted;
    },
    [separation, midiConversion]
  );

  const handleSingleTrackFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      setManualTempo(null);
      const name = file.name?.replace(/\.[^.]+$/, '') ?? 'converted';
      setBaseFilename(name);
      try {
        const { bpm, key } = await detectBpmFromFile(file);
        setDetectedBpm(bpm);
        setDetectedKey(key);
      } catch {
        setDetectedBpm(null);
        setDetectedKey(null);
      }
      let buffer: AudioBuffer;
      try {
        buffer = await fileToAudioBuffer(file);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : 'Не удалось декодировать аудио (поддерживаются MP3, WAV, FLAC, M4A)');
        return null;
      }
      const stemsResult = { original: buffer, other: buffer };
      separation.setStemsFromProject(stemsResult);
      const converted = await midiConversion.convert(stemsResult, { multiTrack: false });
      return converted;
    },
    [separation, midiConversion]
  );

  const tempo = Math.min(
    MAX_TEMPO,
    Math.max(MIN_TEMPO, manualTempo ?? detectedBpm ?? DEFAULT_TEMPO)
  );
  /** Темп для раскладки нот (без ручного переопределения), чтобы смена темпа меняла только скорость воспроизведения. */
  const layoutTempo = detectedBpm ?? DEFAULT_TEMPO;

  const keySignature = detectedKey ?? null;

  const handleTempoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') {
      setManualTempo(null);
      return;
    }
    const value = Number(raw);
    if (!Number.isNaN(value)) {
      setManualTempo(Math.round(value));
    }
  }, []);

  const handleExportGtp = useCallback(async () => {
    if (tracks) await exportGtp(tracks, `${baseFilename}.gp5`, tempo, keySignature);
  }, [tracks, baseFilename, tempo, keySignature, exportGtp]);

  const handleExportMidi = useCallback(() => {
    if (tracks) exportMidi(tracks, `${baseFilename}.mid`, tempo, keySignature);
  }, [tracks, baseFilename, tempo, keySignature, exportMidi]);

  const reset = useCallback(() => {
    separation.reset();
    midiConversion.reset();
    setDetectedBpm(null);
    setDetectedKey(null);
    setManualTempo(null);
    setUploadError(null);
  }, [separation, midiConversion]);

  const status = isLoading
    ? separation.isLoading
      ? 'separating'
      : 'converting'
    : stems && tracks
      ? 'ready'
      : 'idle';

  const progress = separation.isLoading ? separation.progress : midiConversion.progress;

  const cardBaseClass = 'flex min-h-[240px] flex-col rounded-2xl border border-[#2A2A2A] bg-[#111111] overflow-hidden';
  const labelBaseClass = `flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-[#2A2A2A] p-6 transition-all duration-300 hover:border-[#3A3A3A] ${isLoading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className={cardBaseClass}>
          <input
            type="file"
            accept={AUDIO_ACCEPT}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && AUDIO_EXT.test(f.name)) handleSplitFile(f);
              e.target.value = '';
            }}
            className="hidden"
            id="upload-split"
          />
          <label htmlFor="upload-split" className={`flex min-h-0 flex-1 flex-col ${labelBaseClass}`}>
            <h3 className="text-base font-semibold text-[#E0E0E0]">Разобрать на дорожки</h3>
            <p className="text-center text-sm text-[#A0A0A0]">
              Мультитрек: один файл → определение темпа и тональности → разделение на вокал, ударные, бас и т.д. → распознавание нот → MIDI по каждой дорожке
            </p>
            <div className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] p-3">
              <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            </div>
            <span className="text-center text-sm font-medium text-[#E0E0E0]">Загрузить MP3/WAV</span>
          </label>
        </div>

        <div className={cardBaseClass}>
          <input
            type="file"
            accept={AUDIO_ACCEPT}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && AUDIO_EXT.test(f.name)) handleSingleTrackFile(f);
              e.target.value = '';
            }}
            className="hidden"
            id="upload-single"
          />
          <label htmlFor="upload-single" className={`flex min-h-0 flex-1 flex-col ${labelBaseClass}`}>
            <h3 className="text-base font-semibold text-[#E0E0E0]">Одна дорожка</h3>
            <p className="text-center text-sm text-[#A0A0A0]">
              Монотрек: микс или готовая дорожка с предыдущего шага → определение темпа и тональности → распознавание нот → одна MIDI-дорожка
            </p>
            <div className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] p-3">
              <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <span className="text-center text-sm font-medium text-[#E0E0E0]">Загрузить MP3/WAV</span>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4">
        <p className="mb-2 text-sm text-[#A0A0A0]">Или загрузить готовые stems (2+ WAV):</p>
        <input
          type="file"
          accept=".wav,audio/wav"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length >= 2) handleStemsSelect(files);
            e.target.value = '';
          }}
          className="hidden"
          id="upload-stems"
        />
        <label
          htmlFor="upload-stems"
          className={`inline-block rounded-lg border border-[#2A2A2A] px-4 py-2 text-sm text-[#E0E0E0] transition-colors hover:border-[#8A2BE2] ${isLoading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
        >
          Выбрать файлы stems…
        </label>
      </div>

      <ProcessingStatus
        status={status}
        progress={progress}
        downloadProgress={separation.downloadProgress}
        error={error ?? undefined}
      />

      {detectedBpm != null && (
        <p className="text-sm text-[#A0A0A0]">
          Темп: <span className="font-medium text-[#E0E0E0]">{Math.round(detectedBpm)} BPM</span>
          {detectedKey && (
            <> · Тональность: <span className="font-medium text-[#E0E0E0]">{detectedKey}</span></>
          )}
        </p>
      )}

      {stems && tracks && (
        <>
          <ExportSection
            stems={stems}
            tracks={tracks}
            baseFilename={baseFilename}
            onExportGtp={handleExportGtp}
            onExportMidi={handleExportMidi}
            gtpError={gtpError}
          />
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <h3 className="text-lg font-semibold text-[#E0E0E0]">Проигрыватель</h3>
              <label className="flex items-center gap-2 text-sm text-[#A0A0A0]">
                <span>Темп, BPM:</span>
                <input
                  type="number"
                  min={MIN_TEMPO}
                  max={MAX_TEMPO}
                  step={1}
                  value={tempo}
                  onChange={handleTempoChange}
                  className="w-20 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1.5 text-[#E0E0E0] focus:border-[#8A2BE2] focus:outline-none"
                />
                <span className="text-xs text-[#6A6A6A]">можно изменить вручную</span>
              </label>
            </div>
            <AlphaTabPlayer
              tracks={tracks}
              tempo={tempo}
              layoutTempo={layoutTempo}
              keySignature={keySignature}
            />
          </div>
        </>
      )}

      {status !== 'idle' && (
        <div className="flex justify-center">
          <button
            onClick={reset}
            className="rounded-full border border-[#2A2A2A] px-8 py-3 font-medium text-[#A0A0A0] transition-all hover:border-[#3A3A3A] hover:text-[#E0E0E0]"
          >
            Начать заново
          </button>
        </div>
      )}
    </motion.div>
  );
}
