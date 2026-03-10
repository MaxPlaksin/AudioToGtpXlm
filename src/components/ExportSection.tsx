import { motion } from 'framer-motion';
import type { AudioStems, MidiTrackData, StemType } from '../types/audio.types';
import { STEM_LABELS } from '../types/audio.types';
import { audioBufferToWavBlob } from '../utils/audioBuffer';

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

interface ExportSectionProps {
  stems: AudioStems;
  tracks: MidiTrackData[];
  baseFilename: string;
  onExportGtp: () => Promise<unknown>;
  onExportMidi: () => void;
  gtpError?: string | null;
}

export function ExportSection({
  stems,
  tracks,
  baseFilename,
  onExportGtp,
  onExportMidi,
  gtpError,
}: ExportSectionProps) {
  const stemKeys = (['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'] as StemType[]).filter(
    (k) => stems[k]
  );

  const exportStemWav = (name: StemType) => {
    const buffer = stems[name];
    if (!buffer) return;
    const blob = audioBufferToWavBlob(buffer);
    downloadBlob(blob, `${baseFilename}-${name}.wav`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8"
    >
      <h3 className="mb-6 text-xl font-bold text-[#E0E0E0]">
        Выгрузка файлов
      </h3>

      <div className="space-y-6">
        <div>
          <h4 className="mb-3 font-medium text-[#A0A0A0]">Дорожки (WAV)</h4>
          <div className="flex flex-wrap gap-2">
            {stemKeys.map((name) => (
              <button
                key={name}
                onClick={() => exportStemWav(name)}
                className="rounded-lg border border-[#2A2A2A] px-4 py-2 text-sm font-medium text-[#E0E0E0] transition-colors hover:border-[#8A2BE2] hover:text-[#8A2BE2]"
              >
                {STEM_LABELS[name]} (.wav)
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-3 font-medium text-[#A0A0A0]">Нотная запись</h4>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onExportGtp}
              disabled={!tracks?.length}
              className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-6 py-2.5 font-semibold text-white transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              Скачать GTP (.gp5)
            </button>
            <button
              onClick={onExportMidi}
              disabled={!tracks?.length}
              className="rounded-lg border border-[#2A2A2A] px-4 py-2.5 font-medium text-[#E0E0E0] transition-colors hover:border-[#8A2BE2] hover:text-[#8A2BE2]"
            >
              MIDI
            </button>
          </div>
          {gtpError && (
            <p className="mt-2 text-sm text-amber-400">
              {gtpError}. Используйте MIDI и импортируйте в Guitar Pro: Файл → Импорт → MIDI
            </p>
          )}
          <p className="mt-2 text-sm text-[#A0A0A0]">
            GTP — нативный формат Guitar Pro. MIDI — универсальный, импорт: Файл → Импорт → MIDI
          </p>
        </div>
      </div>
    </motion.div>
  );
}
