/**
 * Вкладка «Библиотека» — каталог табов по образцу gtp-tabs.ru
 * Алфавит сверху, список табов по центру
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

const LATIN_LETTERS = '0-9 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'.split(' ');
const CYRILLIC_LETTERS = 'А Б В Г Д Е Ж З И К Л М Н О П Р С Т У Ф Х Ц Ч Ш Щ Э Ю Я'.split(' ');

interface TabEntry {
  id: string;
  artist: string;
  title: string;
  format: string;
  size: string;
  downloads: number;
  rating: number;
}

const MOCK_TABS: TabEntry[] = [
  { id: '1', artist: 'I The Breather', title: '04 12 11', format: 'gp5', size: '76.84 Kb', downloads: 552, rating: 4 },
  { id: '2', artist: 'Metallica', title: 'Nothing Else Matters', format: 'gp5', size: '45.2 Kb', downloads: 12450, rating: 5 },
  { id: '3', artist: 'Nirvana', title: 'Smells Like Teen Spirit', format: 'gp4', size: '32.1 Kb', downloads: 8920, rating: 5 },
  { id: '4', artist: 'AC/DC', title: 'Back In Black', format: 'gp5', size: '58.3 Kb', downloads: 7650, rating: 4 },
  { id: '5', artist: 'Queen', title: 'Bohemian Rhapsody', format: 'gp5', size: '92.1 Kb', downloads: 11200, rating: 5 },
  { id: '6', artist: 'Led Zeppelin', title: 'Stairway To Heaven', format: 'gp5', size: '67.4 Kb', downloads: 9800, rating: 5 },
  { id: '7', artist: 'Pink Floyd', title: 'Comfortably Numb', format: 'gp5', size: '54.2 Kb', downloads: 6540, rating: 4 },
  { id: '8', artist: 'Radiohead', title: 'Creep', format: 'gp4', size: '28.9 Kb', downloads: 5430, rating: 4 },
  { id: '9', artist: 'The Beatles', title: 'Let It Be', format: 'gp5', size: '41.7 Kb', downloads: 8760, rating: 5 },
  { id: '10', artist: 'Green Day', title: 'Basket Case', format: 'gp5', size: '38.5 Kb', downloads: 4320, rating: 4 },
];

export function LibraryTab() {
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tabs] = useState<TabEntry[]>(MOCK_TABS);

  const filteredTabs = tabs.filter((tab) => {
    const firstChar = tab.artist.trim().charAt(0).toUpperCase();
    const isDigit = /^[0-9]/.test(tab.artist);
    const matchesLetter =
      !selectedLetter ||
      (selectedLetter === '0-9' && isDigit) ||
      (selectedLetter !== '0-9' && selectedLetter.length === 1 && firstChar === selectedLetter);
    const matchesSearch =
      !searchQuery ||
      tab.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tab.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLetter && matchesSearch;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8">
        <h3 className="mb-6 text-xl font-bold text-[#E0E0E0]">
          Библиотека табулатур
        </h3>
        <p className="mb-6 text-[#A0A0A0]">
          Выберите букву или найдите табулатуру по названию
        </p>

        <div className="mb-6">
          <p className="mb-3 text-sm font-medium text-[#A0A0A0]">Латиница</p>
          <div className="flex flex-wrap gap-2">
            {LATIN_LETTERS.map((letter) => (
              <button
                key={letter}
                onClick={() => setSelectedLetter(selectedLetter === letter ? null : letter)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedLetter === letter
                    ? 'bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] text-white'
                    : 'border border-[#2A2A2A] text-[#A0A0A0] hover:border-[#8A2BE2] hover:text-[#E0E0E0]'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-3 text-sm font-medium text-[#A0A0A0]">Кириллица</p>
          <div className="flex flex-wrap gap-2">
            {CYRILLIC_LETTERS.map((letter) => (
              <button
                key={letter}
                onClick={() => setSelectedLetter(selectedLetter === letter ? null : letter)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedLetter === letter
                    ? 'bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] text-white'
                    : 'border border-[#2A2A2A] text-[#A0A0A0] hover:border-[#8A2BE2] hover:text-[#E0E0E0]'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Поиск по исполнителю или названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] px-4 py-3 text-[#E0E0E0] placeholder-[#A0A0A0] focus:border-[#8A2BE2] focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          {filteredTabs.length === 0 ? (
            <p className="py-12 text-center text-[#A0A0A0]">
              Табулатуры не найдены. В будущем здесь будет подключена база данных.
            </p>
          ) : (
            filteredTabs.map((tab, idx) => (
              <motion.div
                key={tab.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-4 transition-colors hover:border-[#3A3A3A]"
              >
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-[#E0E0E0]">
                    {tab.artist} — {tab.title}
                  </h4>
                  <div className="mt-1 flex flex-wrap gap-4 text-sm text-[#A0A0A0]">
                    <span>{tab.format.toUpperCase()}</span>
                    <span>{tab.size}</span>
                    <span>Скачиваний: {tab.downloads}</span>
                    <span className="text-[#8A2BE2]">
                      {'★'.repeat(tab.rating)}{'☆'.repeat(5 - tab.rating)}
                    </span>
                  </div>
                </div>
                <button
                  className="shrink-0 rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-6 py-2 font-semibold text-white transition-all duration-300 hover:scale-105"
                  onClick={() => {
                    /* TODO: скачать/открыть таб */
                  }}
                >
                  Скачать
                </button>
              </motion.div>
            ))
          )}
        </div>

        <p className="mt-6 text-sm text-[#A0A0A0]">
          Сейчас отображаются демо-данные. Для полноценной библиотеки потребуется бэкенд и база данных.
        </p>
      </div>
    </motion.div>
  );
}
