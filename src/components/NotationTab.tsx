/**
 * Вкладка нотной записи — загрузка GTP/MIDI и просмотр в AlphaTab
 */

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { AlphaTabPlayer } from './AlphaTabPlayer';
import type { MidiTrackData } from '../types/audio.types';

const NOTATION_EXTENSIONS = /\.(gp|gp3|gp4|gp5|gpx|gp7|gtp|mid|midi|xml|musicxml)$/i;
const MIN_TEMPO = 20;
const MAX_TEMPO = 300;
const DEFAULT_TEMPO = 120;

interface NotationTabProps {
  convertedTracks?: MidiTrackData[] | null;
}

export function NotationTab({ convertedTracks }: NotationTabProps) {
  const [notationFile, setNotationFile] = useState<File | null>(null);
  const [tempo, setTempo] = useState(DEFAULT_TEMPO);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [userWantsUpload, setUserWantsUpload] = useState(false);

  const hasFile = notationFile !== null;
  const hasTracks = convertedTracks && convertedTracks.length > 0;
  const showPlayer = hasFile || (hasTracks && !userWantsUpload);

  const validateFile = useCallback((file: File): string | null => {
    if (!NOTATION_EXTENSIONS.test(file.name)) {
      return 'Поддерживаются: .gp, .gp3, .gp4, .gp5, .gpx, .gp7, .gtp, .mid, .midi, .xml';
    }
    if (file.size > 50 * 1024 * 1024) {
      return 'Максимальный размер: 50 МБ';
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const err = validateFile(file);
      if (err) {
        setError(err);
        return;
      }
      setNotationFile(file);
      setUserWantsUpload(false);
    },
    [validateFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
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
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile]
  );

  const clearAndShowUpload = useCallback(() => {
    setNotationFile(null);
    setError(null);
    setUserWantsUpload(true);
  }, []);

  const loadTestFile = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'sample.xml');
      const blob = await res.blob();
      handleFile(new File([blob], 'sample.xml', { type: 'application/xml' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    }
  }, [handleFile]);

  const effectiveTempo = Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, tempo));

  const handleTempoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value.trim());
      if (!Number.isNaN(value)) setTempo(Math.round(value));
    },
    []
  );

  if (showPlayer) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex min-h-[calc(100vh-220px)] flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm text-[#A0A0A0]">
              {hasFile
                ? `Файл: ${notationFile!.name}`
                : 'Показаны треки из конвертера'}
            </p>
            <label className="flex items-center gap-2 text-sm text-[#A0A0A0]">
              <span>Темп, BPM:</span>
              <input
                type="number"
                min={MIN_TEMPO}
                max={MAX_TEMPO}
                step={1}
                value={effectiveTempo}
                onChange={handleTempoChange}
                className="w-20 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1.5 text-[#E0E0E0] focus:border-[#8A2BE2] focus:outline-none"
              />
            </label>
          </div>
          <button
            onClick={clearAndShowUpload}
            type="button"
            className="rounded-lg border border-[#2A2A2A] px-4 py-2 text-sm font-medium text-[#A0A0A0] transition-colors hover:border-[#8A2BE2] hover:text-[#E0E0E0]"
          >
            Загрузить другой файл
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {hasFile ? (
            <AlphaTabPlayer file={notationFile} tempo={effectiveTempo} />
          ) : (
            <AlphaTabPlayer
              tracks={convertedTracks!}
              tempo={effectiveTempo}
            />
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8"
    >
      <h3 className="mb-4 text-xl font-bold text-[#E0E0E0]">
        Нотная запись
      </h3>
      <p className="mb-6 text-[#A0A0A0]">
        Загрузите файл Guitar Pro или MIDI — он отобразится в проигрывателе.
      </p>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-16 transition-all ${
          isDragging
            ? 'border-[#8A2BE2] bg-[#8A2BE2]/10'
            : 'border-[#2A2A2A] hover:border-[#3A3A3A]'
        }`}
      >
        <input
          type="file"
          accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.gtp,.mid,.midi,.xml,.musicxml"
          onChange={handleInputChange}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#8A2BE2]/20">
          <i className="fas fa-music text-2xl text-[#8A2BE2]" />
        </div>
        <p className="mb-2 text-lg font-medium text-[#E0E0E0]">
          Перетащите файл или нажмите для выбора
        </p>
        <p className="mb-4 text-sm text-[#A0A0A0]">
          .gp, .gp3, .gp4, .gp5, .gpx, .gp7, .gtp, .mid, .midi, .xml
        </p>
        <label className="cursor-pointer rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-8 py-3 font-semibold text-white transition-all duration-300 hover:scale-105">
          Выбрать файл
          <input
            type="file"
          accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.gtp,.mid,.midi,.xml,.musicxml"
          onChange={handleInputChange}
          className="hidden"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={loadTestFile}
        className="mt-4 text-sm text-[#A0A0A0] underline hover:text-[#8A2BE2]"
      >
        Тест: загрузить sample.xml
      </button>

      {error && (
        <p className="mt-4 text-sm text-red-400">{error}</p>
      )}

      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
      />
    </motion.div>
  );
}
