import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { AudioStems, StemType } from '../types/audio.types';
import { STEM_LABELS } from '../types/audio.types';

const DEFAULT_VOLUME = 80; // 0–100%

interface StemPlayerProps {
  stems: AudioStems;
  duration: number;
}

export function StemPlayer({ stems }: StemPlayerProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<Map<string, { source: AudioBufferSourceNode; gain: GainNode }>>(new Map());
  const stemKeys = useMemo(
    () =>
      (['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'] as StemType[]).filter(
        (k) => stems[k]
      ),
    [stems]
  );
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setVolumes((prev) => {
      const next = { ...prev };
      stemKeys.forEach((k) => {
        if (next[k] === undefined) next[k] = DEFAULT_VOLUME;
      });
      return next;
    });
  }, [stemKeys.join(',')]);

  useEffect(() => {
    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    stemKeys.forEach((name) => {
      const buffer = stems[name as keyof AudioStems];
      if (buffer) {
        const gain = ctx.createGain();
        gain.gain.value = ((volumes[name] ?? DEFAULT_VOLUME) / 100);
        gain.connect(ctx.destination);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);

        sourcesRef.current.set(name, { source, gain });
      }
    });

    return () => {
      sourcesRef.current.forEach(({ source }) => {
        try {
          source.disconnect();
          source.stop();
        } catch {
          /* noop */
        }
      });
      sourcesRef.current.clear();
      ctx.close();
      audioContextRef.current = null;
    };
  }, [stems, stemKeys]);

  const playAll = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const now = ctx.currentTime;
    sourcesRef.current.forEach(({ source }) => {
      try {
        source.start(now);
      } catch {
        /* already started */
      }
    });
    setPlaying(true);
  }, []);

  const stopAll = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    stemKeys.forEach((name) => {
      const old = sourcesRef.current.get(name);
      if (old) {
        try {
          old.source.disconnect();
          old.source.stop();
        } catch {
          /* noop */
        }
      }
      const buffer = stems[name as keyof AudioStems];
      if (buffer) {
        const gain = ctx.createGain();
        gain.gain.value = (volumes[name] ?? DEFAULT_VOLUME) / 100;
        gain.connect(ctx.destination);

        const newSource = ctx.createBufferSource();
        newSource.buffer = buffer;
        newSource.connect(gain);

        sourcesRef.current.set(name, { source: newSource, gain });
      }
    });
    setPlaying(false);
  }, [stems, stemKeys, volumes]);

  const setVolume = useCallback((stem: string, valuePercent: number) => {
    const clamped = Math.max(0, Math.min(100, valuePercent));
    setVolumes((v) => ({ ...v, [stem]: clamped }));
    const entry = sourcesRef.current.get(stem);
    if (entry) {
      entry.gain.gain.setValueAtTime(clamped / 100, audioContextRef.current?.currentTime ?? 0);
    }
  }, []);

  const solo = useCallback(
    (stem: string) => {
      const newVolumes: Record<string, number> = {};
      stemKeys.forEach((name) => {
        newVolumes[name] = name === stem ? 100 : 0;
      });
      setVolumes(newVolumes);
      const ctx = audioContextRef.current;
      stemKeys.forEach((name) => {
        const entry = sourcesRef.current.get(name);
        if (entry && ctx) {
          entry.gain.gain.setValueAtTime(name === stem ? 1 : 0, ctx.currentTime);
        }
      });
    },
    [stemKeys]
  );

  const unmuteAll = useCallback(() => {
    const newVolumes: Record<string, number> = {};
    stemKeys.forEach((name) => (newVolumes[name] = DEFAULT_VOLUME));
    setVolumes(newVolumes);
    const ctx = audioContextRef.current;
    stemKeys.forEach((name) => {
      const entry = sourcesRef.current.get(name);
      if (entry && ctx) {
        entry.gain.gain.setValueAtTime(DEFAULT_VOLUME / 100, ctx.currentTime);
      }
    });
  }, [stemKeys]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8"
    >
      <h3 className="mb-6 text-xl font-bold text-[#E0E0E0]">
        Плеер (громкость 0–100%)
      </h3>

      <div className="mb-6 flex gap-4">
        <button
          onClick={playing ? stopAll : playAll}
          className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-8 py-3 font-semibold text-white transition-all duration-300 hover:scale-105"
        >
          {playing ? 'Стоп' : 'Воспроизвести'}
        </button>
        <button
          onClick={unmuteAll}
          className="rounded-full border border-[#2A2A2A] px-6 py-3 font-medium text-[#A0A0A0] transition-colors hover:border-[#3A3A3A] hover:text-[#E0E0E0]"
        >
          Все дорожки
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {stemKeys.map((stem) => (
          <div
            key={stem}
            className="flex items-center gap-4 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-4"
          >
            <span className="w-24 shrink-0 font-medium text-[#E0E0E0]">
              {STEM_LABELS[stem]}
            </span>
            <div className="flex flex-1 items-center gap-2">
              <span className="w-8 text-xs text-[#A0A0A0]">0%</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={volumes[stem] ?? DEFAULT_VOLUME}
                onChange={(e) => setVolume(stem, parseInt(e.target.value, 10))}
                className="h-2 flex-1 appearance-none rounded-full bg-[#2A2A2A] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#8A2BE2]"
              />
              <span className="w-10 text-xs text-[#A0A0A0]">
                {volumes[stem] ?? DEFAULT_VOLUME}%
              </span>
            </div>
            <button
              onClick={() => solo(stem)}
              className="rounded px-3 py-1 text-sm font-medium text-[#8A2BE2] transition-colors hover:bg-[#8A2BE2]/20"
            >
              Solo
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
