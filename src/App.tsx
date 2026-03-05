import { useCallback, useState } from 'react';
import { useModelPreload } from './hooks/useModelPreload';
import { motion } from 'framer-motion';
import { Header } from './components/Header';
import { FileUploader } from './components/FileUploader';
import { ProcessingStatus } from './components/ProcessingStatus';
import { StemPlayer } from './components/StemPlayer';
import { ExportSection } from './components/ExportSection';
import { NotationTab } from './components/NotationTab';
import type { MidiTrackData } from './types/audio.types';
import { useAudioProcessor } from './hooks/useAudioProcessor';
import { useGtpExport } from './hooks/useGtpExport';

type TabId = 'converter' | 'notation';

function App() {
  useModelPreload();
  const [activeTab, setActiveTab] = useState<TabId>('converter');
  const { state, processAudio, processStemsFromFiles, reset } =
    useAudioProcessor();
  const { exportMidi, exportSingleTrack } = useGtpExport();

  const handleFileSelect = useCallback(
    (file: File) => {
      processAudio(file);
    },
    [processAudio]
  );

  const baseFilename =
    state.audioFile?.file.name.replace(/\.[^.]+$/, '') ?? 'converted';

  const handleExportAll = useCallback(() => {
    if (state.midiTracks) {
      exportMidi(state.midiTracks, `${baseFilename}.mid`);
    }
  }, [state.midiTracks, baseFilename, exportMidi]);

  const handleExportTrack = useCallback(
    (track: MidiTrackData, filename: string) => {
      exportSingleTrack(track, filename);
    },
    [exportSingleTrack]
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] font-sans">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-12"
        >
          <div className="text-center">
            <h2 className="text-4xl font-extrabold tracking-tight md:text-6xl">
              <span className="bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
                Загрузи трек —
              </span>
              <br />
              <span className="text-[#E0E0E0]">получи ноты</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-xl text-[#A0A0A0]">
              Загрузи MP3, WAV или FLAC. Мы разделим его на инструменты и
              конвертируем в MIDI для Guitar Pro.
            </p>
          </div>

          <div className="flex gap-2 border-b border-[#2A2A2A]">
            <button
              onClick={() => setActiveTab('converter')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'converter'
                  ? 'border-b-2 border-[#8A2BE2] text-[#E0E0E0]'
                  : 'text-[#A0A0A0] hover:text-[#E0E0E0]'
              }`}
            >
              Конвертер
            </button>
            <button
              onClick={() => setActiveTab('notation')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'notation'
                  ? 'border-b-2 border-[#8A2BE2] text-[#E0E0E0]'
                  : 'text-[#A0A0A0] hover:text-[#E0E0E0]'
              }`}
            >
              Нотная запись
            </button>
          </div>

          {activeTab === 'converter' && (
            <>
              <FileUploader
                onFileSelect={handleFileSelect}
                onStemsSelect={processStemsFromFiles}
                disabled={
                  state.status === 'loading-model' ||
                  state.status === 'separating' ||
                  state.status === 'converting'
                }
              />

              <ProcessingStatus
                status={state.status}
                progress={state.progress}
                downloadProgress={state.downloadProgress}
                error={state.error}
                separationWarning={state.separationWarning}
                usedFallback={state.usedFallback}
              />

              {state.stems && state.audioFile && (
                <StemPlayer
                  stems={state.stems}
                  duration={state.audioFile.duration}
                />
              )}

              {state.stems && state.midiTracks && (
                <ExportSection
                  stems={state.stems}
                  tracks={state.midiTracks}
                  baseFilename={baseFilename}
                  onExportAllMidi={handleExportAll}
                  onExportTrackMidi={handleExportTrack}
                />
              )}
            </>
          )}

          {activeTab === 'notation' && (
            <NotationTab convertedTracks={state.midiTracks ?? null} />
          )}

          {activeTab === 'converter' && state.status !== 'idle' && (
            <div className="flex justify-center">
              <button
                onClick={reset}
                className="rounded-full border border-[#2A2A2A] px-8 py-3 font-medium text-[#A0A0A0] transition-all hover:border-[#3A3A3A] hover:text-[#E0E0E0]"
              >
                Начать заново
              </button>
            </div>
          )}
        </motion.section>
      </main>
    </div>
  );
}

export default App;
