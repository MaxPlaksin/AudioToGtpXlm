import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { AudioStems, StemType } from '../types/audio.types';
import { STEM_LABELS } from '../types/audio.types';
import { audioBufferToWavBlob } from '../utils/audioBuffer';

const DEFAULT_VOLUME = 80; // 0–100%
const SEEK_STEP_SEC = 0.1;
const SEEK_NUDGE_SEC = 5;

interface StemPlayerProps {
  stems: AudioStems;
  duration: number;
  baseFilename?: string;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const s = Math.floor(seconds);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function StemIcon({ stem }: { stem: StemType }) {
  const common = 'h-5 w-5';
  switch (stem) {
    case 'vocals':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'drums':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none">
          <path
            d="M4 8c0-2 4-4 8-4s8 2 8 4-4 4-8 4-8-2-8-4Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M4 8v8c0 2 4 4 8 4s8-2 8-4V8"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M7 5.5 5.5 3M17 5.5 18.5 3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'bass':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none">
          <path
            d="M14 3c2 1 3 3 3 5 0 3-2 5-5 5-2 0-4 1-4 3 0 2 2 4 5 4 4 0 7-3 7-7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M9 10h6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'guitar':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none">
          <path
            d="M14.5 4.5 19.5 9.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M11 7l6 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M10.2 10.2a4 4 0 1 0 3.6 3.6l-2.2-2.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M16 3l5 5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'piano':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none">
          <path
            d="M4 5h16v14H4V5Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M7 5v9M10 5v9M14 5v9M17 5v9"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M7 14h3V9H7v5ZM14 14h3V9h-3v5Z"
            fill="currentColor"
            opacity="0.55"
          />
        </svg>
      );
    case 'other':
    default:
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3v18M3 12h18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M7 7l10 10M17 7 7 17"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.6"
          />
        </svg>
      );
  }
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-5 w-5'}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M12 3v10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8 11l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 20h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StemPlayer({ stems, duration, baseFilename = 'stems' }: StemPlayerProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const sourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const startAtRef = useRef<number | null>(null);
  const offsetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const stemKeys = useMemo(
    () =>
      (['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'] as StemType[]).filter(
        (k) => stems[k]
      ),
    [stems]
  );
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [playing, setPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

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
    gainNodesRef.current.clear();
    sourcesRef.current.clear();
    startAtRef.current = null;
    offsetRef.current = 0;
    setPositionSec(0);
    setPlaying(false);

    return () => {
      sourcesRef.current.forEach((source) => {
        try {
          source.disconnect();
          source.stop();
        } catch {
          /* noop */
        }
      });
      sourcesRef.current.clear();
      gainNodesRef.current.forEach((gain) => {
        try {
          gain.disconnect();
        } catch {
          /* noop */
        }
      });
      gainNodesRef.current.clear();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ctx.close();
      audioContextRef.current = null;
    };
  }, [stems, stemKeys]);

  const updateLoop = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (!startAtRef.current) return;
    const pos = clamp(offsetRef.current + (ctx.currentTime - startAtRef.current), 0, duration);
    setPositionSec(pos);
    if (pos >= duration - 0.01) {
      // auto stop
      startAtRef.current = null;
      offsetRef.current = 0;
      setPlaying(false);
      setPositionSec(duration);
      return;
    }
    rafRef.current = requestAnimationFrame(updateLoop);
  }, [duration]);

  const applyGainValues = useCallback(() => {
    const ctx = audioContextRef.current;
    const now = ctx?.currentTime ?? 0;
    stemKeys.forEach((stem) => {
      const gain = gainNodesRef.current.get(stem);
      if (!gain) return;
      const vol = clamp((volumes[stem] ?? DEFAULT_VOLUME) / 100, 0, 1);
      gain.gain.setValueAtTime(vol, now);
    });
  }, [stemKeys, volumes]);

  const buildSources = useCallback(
    (offsetSeconds: number) => {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      // cleanup previous
      sourcesRef.current.forEach((source) => {
        try {
          source.disconnect();
          source.stop();
        } catch {
          /* noop */
        }
      });
      sourcesRef.current.clear();

      stemKeys.forEach((stem) => {
        const buffer = stems[stem];
        if (!buffer) return;
        const gain = ctx.createGain();
        gain.gain.value = clamp((volumes[stem] ?? DEFAULT_VOLUME) / 100, 0, 1);
        gain.connect(ctx.destination);
        gainNodesRef.current.set(stem, gain);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        source.onended = () => {
          // if this is the last one and we are at end, stop
        };
        sourcesRef.current.set(stem, source);
      });

      applyGainValues();
      offsetRef.current = clamp(offsetSeconds, 0, duration);
      setPositionSec(offsetRef.current);
    },
    [applyGainValues, duration, stemKeys, stems, volumes]
  );

  const play = useCallback(async () => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        /* noop */
      }
    }

    if (sourcesRef.current.size === 0) {
      buildSources(offsetRef.current);
    }

    const now = ctx.currentTime;
    startAtRef.current = now;
    const offset = offsetRef.current;
    sourcesRef.current.forEach((source) => {
      try {
        source.start(now, offset);
      } catch {
        /* noop */
      }
    });
    setPlaying(true);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(updateLoop);
  }, [buildSources, updateLoop]);

  const pause = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (!startAtRef.current) return;

    offsetRef.current = clamp(
      offsetRef.current + (ctx.currentTime - startAtRef.current),
      0,
      duration
    );
    startAtRef.current = null;

    sourcesRef.current.forEach((source) => {
      try {
        source.disconnect();
        source.stop();
      } catch {
        /* noop */
      }
    });
    sourcesRef.current.clear();
    setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, [duration]);

  const stop = useCallback(() => {
    startAtRef.current = null;
    offsetRef.current = 0;
    sourcesRef.current.forEach((source) => {
      try {
        source.disconnect();
        source.stop();
      } catch {
        /* noop */
      }
    });
    sourcesRef.current.clear();
    setPlaying(false);
    setPositionSec(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const seekTo = useCallback(
    (seconds: number) => {
      const next = clamp(seconds, 0, duration);
      offsetRef.current = next;
      setPositionSec(next);
      if (playing) {
        // restart playback from new offset
        startAtRef.current = null;
        sourcesRef.current.forEach((source) => {
          try {
            source.disconnect();
            source.stop();
          } catch {
            /* noop */
          }
        });
        sourcesRef.current.clear();
        void play();
      } else {
        buildSources(next);
      }
    },
    [buildSources, duration, play, playing]
  );

  const setVolume = useCallback((stem: string, valuePercent: number) => {
    const clamped = Math.max(0, Math.min(100, valuePercent));
    setVolumes((v) => ({ ...v, [stem]: clamped }));
    const gain = gainNodesRef.current.get(stem);
    if (gain) {
      gain.gain.setValueAtTime(clamped / 100, audioContextRef.current?.currentTime ?? 0);
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
        const gain = gainNodesRef.current.get(name);
        if (gain && ctx) {
          gain.gain.setValueAtTime(name === stem ? 1 : 0, ctx.currentTime);
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
      const gain = gainNodesRef.current.get(name);
      if (gain && ctx) {
        gain.gain.setValueAtTime(DEFAULT_VOLUME / 100, ctx.currentTime);
      }
    });
  }, [stemKeys]);

  const downloadStem = useCallback(
    (stem: StemType) => {
      const buffer = stems[stem];
      if (!buffer) return;
      const blob = audioBufferToWavBlob(buffer);
      downloadBlob(blob, `${baseFilename}-${stem}.wav`);
    },
    [baseFilename, stems]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8"
    >
      <div className="mb-6 rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => (playing ? pause() : play())}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] text-white transition-all hover:scale-105"
            title={playing ? 'Пауза' : 'Воспроизвести'}
          >
            {playing ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" />
                <rect x="14" y="5" width="4" height="14" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={stop}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#2A2A2A] text-[#A0A0A0] transition-colors hover:border-[#3A3A3A] hover:text-[#E0E0E0]"
            title="Стоп"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={unmuteAll}
            className="rounded-lg border border-[#2A2A2A] px-3 py-2 text-sm font-medium text-[#A0A0A0] transition-colors hover:border-[#3A3A3A] hover:text-[#E0E0E0]"
            title="Все дорожки"
          >
            Все дорожки
          </button>
          <div className="h-8 w-px shrink-0 bg-[#2A2A2A]" />
          <button
            type="button"
            onClick={() => seekTo(positionSec - SEEK_NUDGE_SEC)}
            className="rounded-lg border border-[#2A2A2A] px-3 py-2 text-sm font-medium text-[#A0A0A0] transition-colors hover:border-[#3A3A3A] hover:text-[#E0E0E0]"
            title={`Назад ${SEEK_NUDGE_SEC} с`}
          >
            −{SEEK_NUDGE_SEC}s
          </button>
          <button
            type="button"
            onClick={() => seekTo(positionSec + SEEK_NUDGE_SEC)}
            className="rounded-lg border border-[#2A2A2A] px-3 py-2 text-sm font-medium text-[#A0A0A0] transition-colors hover:border-[#3A3A3A] hover:text-[#E0E0E0]"
            title={`Вперёд ${SEEK_NUDGE_SEC} с`}
          >
            +{SEEK_NUDGE_SEC}s
          </button>
          <div className="min-w-0 flex-1" />
          <div className="font-mono text-sm text-[#A0A0A0]">
            {formatTime(positionSec)} / {formatTime(duration)}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={duration}
            step={SEEK_STEP_SEC}
            value={positionSec}
            onMouseDown={() => setIsSeeking(true)}
            onMouseUp={() => setIsSeeking(false)}
            onTouchStart={() => setIsSeeking(true)}
            onTouchEnd={() => setIsSeeking(false)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setPositionSec(v);
              if (!isSeeking) seekTo(v);
            }}
            onPointerUp={() => seekTo(positionSec)}
            className="h-2 w-full appearance-none rounded-full bg-[#2A2A2A] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#8A2BE2]"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {stemKeys.map((stem) => (
          <div
            key={stem}
            className="flex items-center gap-4 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-4"
          >
            <div className="flex w-[52px] shrink-0 items-center justify-center">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#8A2BE2]/20 text-[#8A2BE2]"
                title={STEM_LABELS[stem]}
              >
                <StemIcon stem={stem} />
              </div>
              <span className="sr-only">{STEM_LABELS[stem]}</span>
            </div>
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadStem(stem)}
                type="button"
                className="rounded-lg border border-emerald-600/30 bg-emerald-500/10 p-2 text-emerald-400 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/15 hover:text-emerald-300"
                title="Скачать WAV"
              >
                <DownloadIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => solo(stem)}
                type="button"
                className="rounded-lg border border-[#2A2A2A] px-3 py-2 text-sm font-medium text-[#8A2BE2] transition-colors hover:border-[#8A2BE2]/50 hover:bg-[#8A2BE2]/15"
                title="Solo"
              >
                Solo
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
