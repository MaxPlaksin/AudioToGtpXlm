/**
 * Проигрыватель нотной записи — iframe со standalone AlphaTab
 * AlphaTab не поддерживает импорт MIDI, поэтому MIDI конвертируется в MusicXML
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { MidiTrackData } from '../types/audio.types';
import {
  midiTrackDataToMusicXml,
  midiBufferToMusicXml,
} from '../utils/midiToMusicXml';

const MIDI_EXT = /\.(mid|midi)$/i;

interface AlphaTabPlayerProps {
  file?: File | null;
  tracks?: MidiTrackData[] | null;
}

export function AlphaTabPlayer({ file, tracks }: AlphaTabPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const urlRef = useRef<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source = file ?? (tracks && tracks.length > 0 ? 'tracks' : null);

  useEffect(() => {
    if (!source) return;

    setError(null);
    let cancelled = false;

    const run = async () => {
      try {
        let blob: Blob;
        if (file) {
          if (MIDI_EXT.test(file.name)) {
            const buf = await file.arrayBuffer();
            const xml = await midiBufferToMusicXml(buf);
            blob = new Blob([xml], { type: 'application/xml' });
          } else {
            blob = file;
          }
        } else if (tracks && tracks.length > 0) {
          const xml = midiTrackDataToMusicXml(tracks, 120);
          blob = new Blob([xml], { type: 'application/xml' });
        } else {
          return;
        }

        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setObjectUrl(url);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Ошибка загрузки');
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      const prev = urlRef.current;
      urlRef.current = null;
      if (prev) URL.revokeObjectURL(prev);
      setObjectUrl(null);
    };
  }, [source, file, tracks]);

  if (!source || !objectUrl) return null;

  const base = import.meta.env.BASE_URL;
  const playerUrl = `${base}alphatab-player.html?file=${encodeURIComponent(objectUrl)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full min-h-[calc(100vh-220px)] overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#111111]"
    >
      <iframe
        ref={iframeRef}
        src={playerUrl}
        title="Нотная запись"
        className="h-full min-h-[500px] w-full border-0"
        sandbox="allow-scripts allow-same-origin"
      />
      {error && (
        <p className="p-4 text-sm text-red-400">{error}</p>
      )}
    </motion.div>
  );
}
