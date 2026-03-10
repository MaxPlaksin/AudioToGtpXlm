/**
 * Хук для экспорта в GTP / MIDI
 */

import { useCallback, useState } from 'react';
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
    tempo?: number,
    keySignature?: string | null
  ) => void;
  exportSingleTrack: (
    track: MidiTrackData,
    filename?: string,
    tempo?: number,
    keySignature?: string | null
  ) => void;
  exportToGtp: (
    tracks: MidiTrackData[],
    tempo?: number,
    keySignature?: string | null
  ) => Promise<Blob | null>;
  exportGtp: (
    tracks: MidiTrackData[],
    filename?: string,
    tempo?: number,
    keySignature?: string | null
  ) => Promise<boolean>;
  gtpError: string | null;
}

export function useGtpExport(): UseGtpExportResult {
  const [gtpError, setGtpError] = useState<string | null>(null);

  const exportMidi = useCallback(
    (
      tracks: MidiTrackData[],
      filename = 'converted.mid',
      tempo = DEFAULT_TEMPO,
      keySignature: string | null = null
    ) => {
      const blob = createMultiTrackMidi(tracks, tempo, keySignature);
      downloadBlob(blob, filename);
    },
    []
  );

  const exportSingleTrack = useCallback(
    (
      track: MidiTrackData,
      filename?: string,
      tempo = DEFAULT_TEMPO,
      keySignature: string | null = null
    ) => {
      const name = filename ?? `${track.instrument}.mid`;
      const blob = createSingleTrackMidi(track, tempo, keySignature);
      downloadBlob(blob, name);
    },
    []
  );

  const exportToGtp = useCallback(
    async (
      tracks: MidiTrackData[],
      tempo = DEFAULT_TEMPO,
      keySignature: string | null = null
    ): Promise<Blob | null> => {
      try {
        const body: { tracks: MidiTrackData[]; tempo: number; key?: string } = { tracks, tempo };
        if (keySignature && keySignature.trim()) body.key = keySignature.trim();
        const response = await fetch('/api/convert-to-gtp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          let msg = text;
          try {
            const j = JSON.parse(text) as { detail?: string };
            if (j.detail) msg = j.detail;
          } catch {
            /* use text */
          }
          setGtpError(msg || `Ошибка ${response.status}`);
          return null;
        }

        setGtpError(null);
        return response.blob();
      } catch (e) {
        setGtpError(e instanceof Error ? e.message : 'Сервер недоступен');
        return null;
      }
    },
    []
  );

  const exportGtp = useCallback(
    async (
      tracks: MidiTrackData[],
      filename = 'converted.gp5',
      tempo = DEFAULT_TEMPO,
      keySignature: string | null = null
    ): Promise<boolean> => {
      const blob = await exportToGtp(tracks, tempo, keySignature);
      if (!blob) return false;
      downloadBlob(blob, filename);
      return true;
    },
    [exportToGtp]
  );

  return { exportMidi, exportSingleTrack, exportToGtp, exportGtp, gtpError };
}
