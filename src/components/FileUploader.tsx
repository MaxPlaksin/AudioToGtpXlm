import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import type { AudioFileUpload } from '../types/audio.types';
import {
  SUPPORTED_AUDIO_FORMATS,
  MAX_FILE_SIZE_BYTES,
} from '../types/audio.types';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  onStemsSelect?: (files: File[]) => void;
  onWaveformReady?: (waveform: number[]) => void;
  disabled?: boolean;
}

export function FileUploader({
  onFileSelect,
  onStemsSelect,
  onWaveformReady,
  disabled = false,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AudioFileUpload | null>(null);
  const [showStemsUpload, setShowStemsUpload] = useState(false);

  const validateFile = useCallback((file: File): string | null => {
    const isValidType = SUPPORTED_AUDIO_FORMATS.some(
      (fmt) => file.type === fmt || file.name.match(/\.(mp3|wav|flac|m4a)$/i)
    );
    if (!isValidType) {
      return 'Поддерживаются только MP3, WAV, FLAC, M4A';
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `Максимальный размер файла: ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ`;
    }
    return null;
  }, []);

  const processFile = useCallback(
    (file: File) => {
      setError(null);
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const ctx = new AudioContext();
        ctx.decodeAudioData(reader.result as ArrayBuffer).then(
          (buffer) => {
            const waveform: number[] = [];
            const data = buffer.getChannelData(0);
            const blockSize = Math.floor(data.length / 512);
            for (let i = 0; i < 512; i++) {
              const start = i * blockSize;
              const slice = data.slice(start, start + blockSize);
              waveform.push(
                slice.length > 0 ? Math.max(...slice.map(Math.abs)) : 0
              );
            }
            setPreview({
              file,
              buffer,
              duration: buffer.duration,
              waveform,
            });
            onWaveformReady?.(waveform);
          },
          () => setError('Не удалось декодировать аудиофайл')
        );
      };
      reader.readAsArrayBuffer(file);
      onFileSelect(file);
    },
    [onFileSelect, onWaveformReady, validateFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [disabled, processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = '';
    },
    [processFile]
  );

  const handleStemsInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length >= 2 && onStemsSelect) {
        onStemsSelect(files);
      } else if (files.length > 0) {
        setError('Нужно минимум 2 файла (vocals.wav, drums.wav, bass.wav, other.wav)');
      }
      e.target.value = '';
    },
    [onStemsSelect]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="w-full"
    >
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`rounded-2xl border-2 border-dashed p-12 transition-all duration-300 ${
          isDragging
            ? 'border-[#8A2BE2] bg-[#1A1A1A]'
            : 'border-[#2A2A2A] bg-[#111111] hover:border-[#3A3A3A]'
        } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          type="file"
          accept=".mp3,.wav,.flac,.m4a,audio/*"
          onChange={handleInputChange}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="flex cursor-pointer flex-col items-center gap-4"
        >
          <div className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] p-4">
            <svg
              className="h-10 w-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-[#E0E0E0]">
              Перетащите файл сюда или нажмите для выбора
            </p>
            <p className="mt-1 text-[#A0A0A0]">
              MP3, WAV, FLAC, M4A — до 100 МБ
            </p>
            {onStemsSelect && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setShowStemsUpload(!showStemsUpload);
                  setError(null);
                }}
                className="mt-2 text-sm text-[#8A2BE2] hover:underline"
              >
                {showStemsUpload ? 'Скрыть' : 'Или загрузить готовые stems'}
              </button>
            )}
          </div>
        </label>

        {showStemsUpload && onStemsSelect && (
          <div className="mt-4 rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-4">
            <p className="mb-2 text-sm text-[#A0A0A0]">
              Выберите 4 WAV-файла (vocals, drums, bass, other) — например из{' '}
              <code className="rounded bg-[#1A1A1A] px-1">python scripts/separate_audio.py track.wav</code>
            </p>
            <input
              type="file"
              accept=".wav,audio/wav"
              multiple
              onChange={handleStemsInputChange}
              className="block w-full text-sm text-[#A0A0A0] file:mr-4 file:rounded file:border-0 file:bg-[#8A2BE2] file:px-4 file:py-2 file:text-white"
            />
          </div>
        )}

        {preview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8"
          >
            <div className="flex items-center gap-4 overflow-hidden rounded-xl bg-[#1A1A1A] p-4">
              <div className="min-w-0 shrink-0">
                <p className="truncate font-medium text-[#E0E0E0]">
                  {preview.file.name}
                </p>
                <p className="text-sm text-[#A0A0A0]">
                  {preview.duration.toFixed(1)} сек
                </p>
              </div>
              {preview.waveform && preview.waveform.length > 0 && (
                <div className="flex min-w-0 max-w-[60%] flex-1 items-center overflow-hidden">
                  <div className="flex h-12 w-full items-end justify-between gap-0.5 overflow-hidden rounded">
                    {preview.waveform.slice(0, 150).map((v, i) => (
                      <div
                        key={i}
                        className="min-w-[2px] flex-1 rounded-sm bg-gradient-to-t from-[#4B0082] to-[#8A2BE2]"
                        style={{
                          height: `${Math.max(2, Math.min(48, v * 45))}px`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-center text-red-400"
          >
            {error}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
