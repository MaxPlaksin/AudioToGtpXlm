/**
 * Вкладка «Конвертация в MIDI» — загрузка stems и конвертация в MIDI
 */

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { ProcessingStatus } from './ProcessingStatus';
import { ExportSection } from './ExportSection';
import type { MidiTrackData } from '../types/audio.types';
import { useAudioSeparation } from '../hooks/useAudioSeparation';
import { useMidiConversion } from '../hooks/useMidiConversion';
import { useGtpExport } from '../hooks/useGtpExport';

export function ConversionTab() {
  const [baseFilename, setBaseFilename] = useState('converted');
  const separation = useAudioSeparation();
  const midiConversion = useMidiConversion();
  const { exportMidi, exportSingleTrack } = useGtpExport();

  const stems = separation.stems;
  const tracks = midiConversion.tracks;
  const isLoading = separation.isLoading || midiConversion.isLoading;
  const error = separation.error ?? midiConversion.error;

  const handleStemsSelect = useCallback(
    async (files: File[]) => {
      const name = files[0]?.name?.replace(/\.[^.]+$/, '') ?? 'converted';
      setBaseFilename(name);
      const loaded = await separation.loadStemsFromFiles(files);
      if (loaded) {
        const converted = await midiConversion.convert(loaded);
        return converted;
      }
      return null;
    },
    [separation, midiConversion]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length >= 2) {
        handleStemsSelect(files);
      }
      e.target.value = '';
    },
    [handleStemsSelect]
  );

  const handleExportAll = useCallback(() => {
    if (tracks) {
      exportMidi(tracks, `${baseFilename}.mid`);
    }
  }, [tracks, baseFilename, exportMidi]);

  const handleExportTrack = useCallback(
    (track: MidiTrackData, filename: string) => {
      exportSingleTrack(track, filename);
    },
    [exportSingleTrack]
  );

  const reset = useCallback(() => {
    separation.reset();
    midiConversion.reset();
  }, [separation, midiConversion]);

  const status = isLoading
    ? separation.isLoading
      ? 'separating'
      : 'converting'
    : stems && tracks
      ? 'ready'
      : 'idle';

  const progress = separation.isLoading ? separation.progress : midiConversion.progress;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div
        className={`rounded-2xl border-2 border-dashed p-12 transition-all duration-300 border-[#2A2A2A] bg-[#111111] hover:border-[#3A3A3A] ${isLoading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          type="file"
          accept=".wav,audio/wav"
          multiple
          onChange={handleInputChange}
          className="hidden"
          id="stems-upload"
        />
        <label
          htmlFor="stems-upload"
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
              Загрузите готовые stems (WAV)
            </p>
            <p className="mt-1 text-[#A0A0A0]">
              Минимум 2 файла: vocals, drums, bass, other и т.д.
            </p>
            <p className="mt-2 text-sm text-[#A0A0A0]">
              Или сначала разделите трек во вкладке «Разделение на дорожки»
            </p>
          </div>
        </label>
      </div>

      <ProcessingStatus
        status={status}
        progress={progress}
        downloadProgress={separation.downloadProgress}
        error={error ?? undefined}
      />

      {stems && tracks && (
        <ExportSection
          stems={stems}
          tracks={tracks}
          baseFilename={baseFilename}
          onExportAllMidi={handleExportAll}
          onExportTrackMidi={handleExportTrack}
        />
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
