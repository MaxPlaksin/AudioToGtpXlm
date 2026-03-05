/**
 * Хук для экспорта в GTP / MIDI
 */

import { useCallback } from 'react';
import type { MidiTrackData } from '../types/audio.types';
import {
  createMultiTrackMidi,
  createSingleTrackMidi,
  downloadBlob,
} from '../utils/midiUtils';

const DEFAULT_TEMPO = 120;

export interface UseGtpExportResult {
  exportMidi: (
    tracks: MidiTrackData[],
    filename?: string,
    tempo?: number
  ) => void;
  exportSingleTrack: (
    track: MidiTrackData,
    filename?: string,
    tempo?: number
  ) => void;
  exportToGtp: (
    tracks: MidiTrackData[],
    tempo?: number
  ) => Promise<Blob | null>;
}

export function useGtpExport(): UseGtpExportResult {
  const exportMidi = useCallback(
    (
      tracks: MidiTrackData[],
      filename = 'converted.mid',
      tempo = DEFAULT_TEMPO
    ) => {
      const blob = createMultiTrackMidi(tracks, tempo);
      downloadBlob(blob, filename);
    },
    []
  );

  const exportSingleTrack = useCallback(
    (
      track: MidiTrackData,
      filename?: string,
      tempo = DEFAULT_TEMPO
    ) => {
      const name = filename ?? `${track.instrument}.mid`;
      const blob = createSingleTrackMidi(track, tempo);
      downloadBlob(blob, name);
    },
    []
  );

  const exportToGtp = useCallback(
    async (
      tracks: MidiTrackData[],
      tempo = DEFAULT_TEMPO
    ): Promise<Blob | null> => {
      try {
        const response = await fetch('/api/convert-to-gtp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracks, tempo }),
        });

        if (!response.ok) {
          return null;
        }

        return response.blob();
      } catch {
        return null;
      }
    },
    []
  );

  return { exportMidi, exportSingleTrack, exportToGtp };
}
