/**
 * Утилиты для работы с MIDI.
 * Формат как в GP: первая дорожка — метаданные (темп, размер, тональность), далее по одной дорожке на инструмент.
 */

import MidiWriter from 'midi-writer-js';
import type { MidiTrackData } from '../types/audio.types';

const STEM_TO_PROGRAM: Record<string, number> = {
  vocals: 52,
  drums: 0,
  bass: 33,
  guitar: 25,
  piano: 0,
  other: 0,
};

const TICKS_PER_BEAT = 480;
const SECONDS_PER_MINUTE = 60;

function secondsToTicks(seconds: number, tempo: number): number {
  return Math.round((seconds / SECONDS_PER_MINUTE) * tempo * TICKS_PER_BEAT);
}

function midiNoteToName(midiNote: number): string {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  return `${notes[midiNote % 12]}${octave}`;
}

/**
 * Создаёт multi-track MIDI: первая дорожка — conductor (темп, размер, тональность), остальные — инструменты.
 */
export function createMultiTrackMidi(
  tracks: MidiTrackData[],
  tempo: number = 120,
  keySignature: string | null = null
): Blob {
  const conductorTrack = new MidiWriter.Track();
  conductorTrack.addTrackName('');
  conductorTrack.setTempo(tempo);
  conductorTrack.setTimeSignature(4, 4);
  if (keySignature && keySignature.trim()) {
    try {
      (conductorTrack as unknown as { setKeySignature: (sf: string, mi?: number) => void }).setKeySignature(keySignature.trim());
    } catch {
      // ignore invalid key
    }
  }

  const midiTracks: MidiWriter.Track[] = [conductorTrack];

  for (const trackData of tracks) {
    const track = new MidiWriter.Track();
    track.addTrackName(trackData.instrument);
    track.addInstrumentName(trackData.instrument);

    const program =
      trackData.program ?? STEM_TO_PROGRAM[trackData.instrument] ?? 0;
    track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: program }));

    const sortedNotes = [...trackData.notes].sort(
      (a, b) => a.startTime - b.startTime
    );
    let currentTick = 0;

    for (const note of sortedNotes) {
      const startTick = secondsToTicks(note.startTime, tempo);
      const durationTicks = Math.max(
        1,
        secondsToTicks(note.endTime - note.startTime, tempo)
      );
      const waitTicks = Math.max(0, startTick - currentTick);

      const noteName = midiNoteToName(note.pitch);
      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: noteName,
          duration: `T${durationTicks}`,
          velocity: Math.round((note.velocity / 127) * 100),
          ...(waitTicks > 0 && { wait: `T${waitTicks}` }),
        } as never)
      );
      currentTick = startTick + durationTicks;
    }

    midiTracks.push(track);
  }

  const writer = new MidiWriter.Writer(midiTracks);
  const uint8 = writer.buildFile();
  return new Blob([new Uint8Array(uint8)], { type: 'audio/midi' });
}

/**
 * Создаёт single-track MIDI для одной дорожки (с conductor-дорожкой).
 */
export function createSingleTrackMidi(
  track: MidiTrackData,
  tempo: number = 120,
  keySignature: string | null = null
): Blob {
  return createMultiTrackMidi([track], tempo, keySignature);
}

/**
 * Скачивает Blob как файл
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
