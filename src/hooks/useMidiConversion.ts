/**
 * Хук для конвертации аудио в MIDI.
 * Поддерживает два режима: сервер (sound-to-midi) и клиент (Basic Pitch).
 */

import { useCallback, useState } from 'react';
import type { AudioStems, MidiTrackData, StemType } from '../types/audio.types';
import { STEM_ORDER } from '../types/audio.types';
import { audioBufferToWavBase64, resampleToMono22050 } from '../utils/audioBuffer';

const getBasicPitchModelUrl = (): string => {
  const base =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/';
  const path = base.endsWith('/') ? `${base}models/basic-pitch/model.json` : `${base}/models/basic-pitch/model.json`;
  return path;
};

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

export interface ConvertOptions {
  /** true = все 6 дорожек в порядке STEM_ORDER (пустые при отсутствии стема), false = только дорожки с данными (1 для моно) */
  multiTrack?: boolean;
  /** true = конвертация на сервере через sound-to-midi (PyPI), false = Basic Pitch в браузере */
  useServerMidi?: boolean;
}

export interface UseMidiConversionResult {
  tracks: MidiTrackData[] | null;
  isLoading: boolean;
  progress: number;
  error: string | null;
  convert: (stems: AudioStems, options?: ConvertOptions) => Promise<MidiTrackData[] | null>;
  reset: () => void;
}

export function useMidiConversion(): UseMidiConversionResult {
  const [tracks, setTracks] = useState<MidiTrackData[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const convert = useCallback(
    async (stems: AudioStems, options?: ConvertOptions): Promise<MidiTrackData[] | null> => {
      const multiTrack = options?.multiTrack ?? true;
      const useServerMidi = options?.useServerMidi ?? true;
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

      if (useServerMidi) {
        try {
          setProgress(10);
          const stemsPayload: Record<string, string> = {};
          const withBuffer = stemEntries.filter(([, b]) => b) as [StemType, AudioBuffer][];
          for (let i = 0; i < withBuffer.length; i++) {
            const [instrument, buffer] = withBuffer[i];
            stemsPayload[instrument] = await audioBufferToWavBase64(buffer);
            setProgress(10 + Math.round((i + 1) / withBuffer.length * 80));
          }
          if (Object.keys(stemsPayload).length === 0) {
            setError('Нет аудио для конвертации');
            setIsLoading(false);
            return null;
          }
          const res = await fetch('/api/convert-to-midi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stems: stemsPayload, multiTrack }),
          });
          if (res.status === 503 || res.status === 500) {
            setError(null);
            return convert(stems, { ...options, useServerMidi: false });
          }
          if (!res.ok) {
            const text = await res.text();
            let msg = text;
            try {
              const j = JSON.parse(text) as { detail?: string };
              if (j.detail) msg = j.detail;
            } catch {
              /* use text as is */
            }
            throw new Error(msg || `Ошибка ${res.status}`);
          }
          const data = await res.json();
          const tracksData = (data.tracks || []) as MidiTrackData[];
          setTracks(tracksData);
          setProgress(100);
          setIsLoading(false);
          return tracksData;
        } catch (err) {
          console.warn('Server MIDI conversion failed, falling back to Basic Pitch:', err);
          setError(null);
          return convert(stems, { ...options, useServerMidi: false });
        }
      }

      try {
        const {
          BasicPitch,
          noteFramesToTime,
          addPitchBendsToNoteEvents,
          outputToNotesPoly,
        } = await import('@spotify/basic-pitch');

        const basicPitch = new BasicPitch(getBasicPitchModelUrl());

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

        const finalTracks = multiTrack
          ? (() => {
              const byInstrument = new Map(resultTracks.map((t) => [t.instrument, t]));
              return STEM_ORDER.map((instrument) => byInstrument.get(instrument) ?? { instrument, notes: [] });
            })()
          : resultTracks;
        setTracks(finalTracks);
        setProgress(100);
        return finalTracks;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Ошибка конвертации в MIDI';
        setError(message);
        console.error('MIDI conversion error:', err);

        const withData = stemEntries
          .filter(([, buf]) => buf)
          .map(([instrument]) => ({ instrument, notes: [] } as MidiTrackData));
        const emptyTracks = multiTrack
          ? (() => {
              const byInstrument = new Map(withData.map((t) => [t.instrument, t]));
              return STEM_ORDER.map((instrument) => byInstrument.get(instrument) ?? { instrument, notes: [] });
            })()
          : withData;
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
