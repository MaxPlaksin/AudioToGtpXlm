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
  onExportAllMidi: () => void;
  onExportTrackMidi: (track: MidiTrackData, filename: string) => void;
}

export function ExportSection({
  stems,
  tracks,
  baseFilename,
  onExportAllMidi,
  onExportTrackMidi,
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
          <h4 className="mb-3 font-medium text-[#A0A0A0]">MIDI</h4>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onExportAllMidi}
              className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-6 py-2.5 font-semibold text-white transition-all duration-300 hover:scale-105"
            >
              Всё в одном файле
            </button>
            {tracks.map((track) => (
              <button
                key={track.instrument}
                onClick={() => onExportTrackMidi(track, `${baseFilename}-${track.instrument}.mid`)}
                className="rounded-lg border border-[#2A2A2A] px-4 py-2 text-sm font-medium text-[#E0E0E0] transition-colors hover:border-[#8A2BE2] hover:text-[#8A2BE2]"
              >
                {STEM_LABELS[track.instrument]} (.mid)
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-[#A0A0A0]">
          Импортируйте MIDI в Guitar Pro: Файл → Импорт → MIDI
        </p>
      </div>
    </motion.div>
  );
}
