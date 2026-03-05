/**
 * Хук для конвертации аудио в MIDI (Basic Pitch)
 */

import { useCallback, useState } from 'react';
import type { AudioStems, MidiTrackData, StemType } from '../types/audio.types';
import { resampleToMono22050 } from '../utils/audioBuffer';

const BASIC_PITCH_MODEL_URL = '/models/basic-pitch/model.json';

const MIDI_CONFIGS: Record<
  StemType,
  { onsetThresh: number; frameThresh: number; minNoteLen: number }
> = {
  vocals: { onsetThresh: 0.65, frameThresh: 0.35, minNoteLen: 6 },
  drums: { onsetThresh: 0.25, frameThresh: 0.18, minNoteLen: 3 },
  bass: { onsetThresh: 0.45, frameThresh: 0.28, minNoteLen: 8 },
  other: { onsetThresh: 0.45, frameThresh: 0.28, minNoteLen: 5 },
  guitar: { onsetThresh: 0.5, frameThresh: 0.3, minNoteLen: 6 },
  piano: { onsetThresh: 0.5, frameThresh: 0.3, minNoteLen: 5 },
};

export interface UseMidiConversionResult {
  tracks: MidiTrackData[] | null;
  isLoading: boolean;
  progress: number;
  error: string | null;
  convert: (stems: AudioStems) => Promise<MidiTrackData[] | null>;
  reset: () => void;
}

export function useMidiConversion(): UseMidiConversionResult {
  const [tracks, setTracks] = useState<MidiTrackData[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const convert = useCallback(
    async (stems: AudioStems): Promise<MidiTrackData[] | null> => {
      setIsLoading(true);
      setProgress(0);
      setError(null);
      setTracks(null);

      const stemEntries: [StemType, AudioBuffer | undefined][] = [
        ['vocals', stems.vocals],
        ['drums', stems.drums],
        ['bass', stems.bass],
        ['guitar', stems.guitar],
        ['piano', stems.piano],
        ['other', stems.other],
      ];

      try {
        const {
          BasicPitch,
          noteFramesToTime,
          addPitchBendsToNoteEvents,
          outputToNotesPoly,
        } = await import('@spotify/basic-pitch');

        const basicPitch = new BasicPitch(BASIC_PITCH_MODEL_URL);

        const resultTracks: MidiTrackData[] = [];

        const total = stemEntries.filter(([, b]) => b).length;
        let completed = 0;

        for (const [instrument, buffer] of stemEntries) {
          if (!buffer) continue;

          const config = MIDI_CONFIGS[instrument];
          const resampledBuffer = resampleToMono22050(buffer);

          const frames: number[][] = [];
          const onsets: number[][] = [];
          const contours: number[][] = [];

          await basicPitch.evaluateModel(
            resampledBuffer,
            (f: number[][], o: number[][], c: number[][]) => {
              frames.push(...f);
              onsets.push(...o);
              contours.push(...c);
            },
            (p: number) => {
              const stemProgress =
                (completed / total) * 100 + (p / total) * 25;
              setProgress(stemProgress);
            }
          );

          const notes = noteFramesToTime(
            addPitchBendsToNoteEvents(
              contours,
              outputToNotesPoly(
                frames,
                onsets,
                config.onsetThresh,
                config.frameThresh,
                config.minNoteLen
              )
            )
          );

          const midiNotes = notes.map((n) => ({
            pitch: Math.round(n.pitchMidi),
            startTime: n.startTimeSeconds,
            endTime: n.startTimeSeconds + n.durationSeconds,
            velocity: Math.round((n.amplitude ?? 0.8) * 127),
          }));

          resultTracks.push({ instrument, notes: midiNotes });
          completed++;
          setProgress((completed / total) * 100);
        }

        setTracks(resultTracks);
        setProgress(100);
        return resultTracks;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Ошибка конвертации в MIDI';
        setError(message);
        console.error('MIDI conversion error:', err);

        const emptyTracks: MidiTrackData[] = stemEntries
          .filter(([, buf]) => buf)
          .map(([instrument]) => ({ instrument, notes: [] }));
        setTracks(emptyTracks);
        setProgress(100);
        return emptyTracks;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setTracks(null);
    setProgress(0);
    setError(null);
  }, []);

  return { tracks, isLoading, progress, error, convert, reset };
}
