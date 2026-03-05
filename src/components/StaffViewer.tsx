import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { MidiTrackData } from '../types/audio.types';
import { STEM_LABELS } from '../types/audio.types';

const STAFF_LINE_SPACING = 8;
const NOTE_RADIUS = 6;
const PIXELS_PER_SECOND = 100;
const TRACK_HEIGHT = 80;
const MIN_NOTE_WIDTH = 6;

function midiToStaffY(midiNote: number): number {
  const staffCenterY = 40;
  const middleC = 60;
  return staffCenterY - (midiNote - middleC) * (STAFF_LINE_SPACING / 2);
}

interface StaffViewerProps {
  tracks: MidiTrackData[];
  onTracksChange?: (tracks: MidiTrackData[]) => void;
}

export function StaffViewer({ tracks: initialTracks, onTracksChange }: StaffViewerProps) {
  const [tracks, setTracks] = useState<MidiTrackData[]>(initialTracks);
  const [selectedNote, setSelectedNote] = useState<{
    trackIdx: number;
    noteIdx: number;
  } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number>(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadPercent, setPlayheadPercent] = useState(0);

  useEffect(() => {
    setTracks(initialTracks);
  }, [initialTracks]);

  useEffect(() => {
    onTracksChange?.(tracks);
  }, [tracks, onTracksChange]);

  const deleteSelectedNote = useCallback(() => {
    if (!selectedNote) return;
    const { trackIdx, noteIdx } = selectedNote;
    setTracks((prev) => {
      const next = [...prev];
      const track = { ...next[trackIdx] };
      track.notes = track.notes.filter((_, i) => i !== noteIdx);
      next[trackIdx] = track;
      return next;
    });
    setSelectedNote(null);
  }, [selectedNote]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedNote();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedNote]);

  const allNotes = tracks.flatMap((t, ti) =>
    t.notes.map((n, ni) => ({ ...n, instrument: t.instrument, trackIdx: ti, noteIdx: ni }))
  );
  const maxTime =
    allNotes.length > 0 ? Math.max(...allNotes.map((n) => n.endTime)) : 0;
  const width = Math.max(800, maxTime * PIXELS_PER_SECOND + 80);
  const height = tracks.length * TRACK_HEIGHT;

  const playAll = useCallback(() => {
    if (allNotes.length === 0) return;

    const ctx = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = ctx;
    const startAt = ctx.currentTime;
    const totalDuration = maxTime + 0.5;

    allNotes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440 * Math.pow(2, (note.pitch - 69) / 12);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.12 * (note.velocity / 127), startAt + note.startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + note.endTime);
      osc.start(startAt + note.startTime);
      osc.stop(startAt + note.endTime + 0.02);
    });

    setIsPlaying(true);
    setCurrentTime(0);

    const startWallTime = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - startWallTime) / 1000;
      if (elapsed >= totalDuration) {
        setCurrentTime(totalDuration);
        setPlayheadPercent(100);
        setIsPlaying(false);
        cancelAnimationFrame(animationRef.current);
        return;
      }
      setCurrentTime(elapsed);
      setPlayheadPercent((elapsed / maxTime) * 100);
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
  }, [allNotes, maxTime]);

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(animationRef.current);
    setIsPlaying(false);
    setCurrentTime(0);
    setPlayheadPercent(0);
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  const isNotePlaying = (startTime: number, endTime: number) =>
    isPlaying && currentTime >= startTime && currentTime <= endTime;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-xl font-bold text-[#E0E0E0]">
          Нотный стан (piano-roll)
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={isPlaying ? stopPlayback : playAll}
            disabled={allNotes.length === 0}
            className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-8 py-3 font-semibold text-white transition-all duration-300 hover:scale-105 disabled:opacity-50"
          >
            {isPlaying ? '⏹ Стоп' : '▶ Воспроизвести'}
          </button>
          {selectedNote && (
            <button
              onClick={deleteSelectedNote}
              className="rounded-lg border border-red-500/50 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
            >
              Удалить ноту (Del)
            </button>
          )}
        </div>
      </div>
      <p className="mb-3 text-sm text-[#A0A0A0]">
        Клик по ноте — выделение. Del/Backspace — удалить. Выделенные ноты применяются при экспорте MIDI.
      </p>

      <div className="relative overflow-x-auto overflow-y-auto rounded-xl bg-[#0A0A0A]"
        style={{ maxHeight: 400 }}
      >
        <svg width={width} height={height} className="min-w-full">
          <line
            x1={20 + currentTime * PIXELS_PER_SECOND}
            y1={0}
            x2={20 + currentTime * PIXELS_PER_SECOND}
            y2={height}
            stroke="#8A2BE2"
            strokeWidth={2}
            strokeDasharray="4 4"
            opacity={isPlaying ? 1 : 0.6}
          />

          {tracks.map((track, trackIdx) => {
            const baseY = trackIdx * TRACK_HEIGHT;
            const notes = track.notes
              .slice(0, 256)
              .sort((a, b) => a.startTime - b.startTime);

            return (
              <g key={track.instrument}>
                <rect
                  x={0}
                  y={baseY}
                  width={width}
                  height={TRACK_HEIGHT}
                  fill={trackIdx % 2 === 0 ? '#0A0A0A' : '#111111'}
                />
                {[0, 1, 2, 3, 4].map((i) => (
                  <line
                    key={i}
                    x1={0}
                    y1={baseY + 20 + i * STAFF_LINE_SPACING * 2}
                    x2={width}
                    y2={baseY + 20 + i * STAFF_LINE_SPACING * 2}
                    stroke="#2A2A2A"
                    strokeWidth={1}
                  />
                ))}
                <text
                  x={8}
                  y={baseY + 14}
                  className="fill-[#A0A0A0]"
                  style={{ fontSize: 10 }}
                >
                  {STEM_LABELS[track.instrument] ?? track.instrument}
                </text>
                {notes.map((note, noteIdx) => {
                  const x = 20 + note.startTime * PIXELS_PER_SECOND;
                  const y = baseY + 20 + midiToStaffY(note.pitch);
                  const w = Math.max(
                    (note.endTime - note.startTime) * PIXELS_PER_SECOND,
                    MIN_NOTE_WIDTH
                  );
                  const playing = isNotePlaying(note.startTime, note.endTime);
                  const selected =
                    selectedNote?.trackIdx === trackIdx &&
                    selectedNote?.noteIdx === noteIdx;

                  return (
                    <g
                      key={`${track.instrument}-${noteIdx}`}
                      onClick={() => setSelectedNote({ trackIdx, noteIdx })}
                      style={{ cursor: 'pointer' }}
                    >
                      <rect
                        x={x}
                        y={y - NOTE_RADIUS}
                        width={w}
                        height={NOTE_RADIUS * 2}
                        rx={NOTE_RADIUS}
                        fill={selected ? '#3B82F6' : playing ? '#3B82F6' : '#8A2BE2'}
                        stroke={selected ? '#60A5FA' : playing ? '#60A5FA' : '#A855F7'}
                        strokeWidth={selected ? 3 : playing ? 2 : 1}
                        className="transition-colors duration-75"
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex items-center gap-4 text-sm text-[#A0A0A0]">
        <span>
          {currentTime.toFixed(1)} / {maxTime.toFixed(1)} сек
        </span>
        <div className="h-1 flex-1 max-w-xs overflow-hidden rounded-full bg-[#2A2A2A]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082]"
            initial={false}
            animate={{ width: `${Math.min(playheadPercent, 100)}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      </div>
    </motion.div>
  );
}
