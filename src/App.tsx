import { useState } from 'react';
import { useModelPreload } from './hooks/useModelPreload';
import { motion } from 'framer-motion';
import { Header } from './components/Header';
import { SeparationTab } from './components/SeparationTab';
import { ConversionTab } from './components/ConversionTab';
import { NotationTab } from './components/NotationTab';
import { LibraryTab } from './components/LibraryTab';

type TabId = 'separation' | 'conversion' | 'notation' | 'library';

function App() {
  useModelPreload();
  const [activeTab, setActiveTab] = useState<TabId>('separation');

  return (
    <div className="min-h-screen bg-[#0A0A0A] font-sans">
      <Header />

      <main>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative w-full min-h-[320px] overflow-hidden md:min-h-[380px]"
        >
          <video
            src={`${import.meta.env.BASE_URL}header-bg.mp4`}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0 bg-[#0A0A0A]/70 backdrop-blur-[2px]"
            aria-hidden
          />
          <div className="relative z-10 flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center md:min-h-[380px] md:py-16">
            <h2 className="text-4xl font-extrabold tracking-tight md:text-6xl">
              <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent drop-shadow-sm">
                Загрузи трек —
              </span>
              <br />
              <span className="text-[#E0E0E0] drop-shadow-sm">получи ноты</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-xl text-[#E0E0E0]/90 drop-shadow-sm">
              Загрузи MP3, WAV или FLAC. Раздели на дорожки, конвертируй в MIDI
              или открой ноты в проигрывателе.
            </p>
          </div>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-7xl space-y-12 px-4 py-16 md:px-6"
        >
          <div className="flex flex-wrap gap-2 border-b border-[#2A2A2A]">
            {[
              { id: 'separation' as const, label: 'Разделение на дорожки' },
              { id: 'conversion' as const, label: 'Конвертация в MIDI' },
              { id: 'notation' as const, label: 'Открыть ноты' },
              { id: 'library' as const, label: 'Библиотека' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === id
                    ? 'border-b-2 border-[#8A2BE2] text-[#E0E0E0]'
                    : 'text-[#A0A0A0] hover:text-[#E0E0E0]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'separation' && <SeparationTab />}
          {activeTab === 'conversion' && <ConversionTab />}
          {activeTab === 'notation' && (
            <NotationTab convertedTracks={null} />
          )}
          {activeTab === 'library' && <LibraryTab />}
        </motion.section>
      </main>
    </div>
  );
}

export default App;
