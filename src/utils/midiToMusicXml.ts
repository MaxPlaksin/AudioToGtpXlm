/**
 * Конвертация MIDI в MusicXML для AlphaTab (AlphaTab не поддерживает импорт MIDI)
 */

import { Midi } from '@tonejs/midi';
import type { MidiTrackData, StemType } from '../types/audio.types';

const DIVISIONS = 480;
const TEMPO = 120;
const MEASURE_BEATS = 4;
const MEASURE_DURATION = DIVISIONS * MEASURE_BEATS;

type DivisionEvent = {
  pitch?: number;
  duration: number;
  isRest: boolean;
};

type DivisionNote = {
  pitch: number;
  startDiv: number;
  durationDiv: number;
  velocity: number;
};

type DivisionTrack = {
  instrument: StemType;
  notes: DivisionNote[];
};

export type MidiXmlData = {
  xml: string;
  sourceTempo: number;
};

function midiToStep(midi: number): { step: string; alter?: number; octave: number } {
  const octave = Math.floor(midi / 12) - 1;
  const idx = midi % 12;
  const sharpNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = sharpNames[idx];
  const step = name[0];
  const alter = name.length > 1 ? 1 : undefined;
  return { step, alter, octave };
}

function secondsToDivisions(seconds: number, tempo: number): number {
  return Math.round((seconds / 60) * tempo * DIVISIONS);
}

function ticksToDivisions(ticks: number, ppq: number): number {
  return Math.round((ticks / ppq) * DIVISIONS);
}

function divisionsToType(divisions: number): string {
  if (divisions >= DIVISIONS * 4) return 'whole';
  if (divisions >= DIVISIONS * 2) return 'half';
  if (divisions >= DIVISIONS) return 'quarter';
  if (divisions >= DIVISIONS / 2) return 'eighth';
  if (divisions >= DIVISIONS / 4) return '16th';
  if (divisions >= DIVISIONS / 8) return '32nd';
  return '64th';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const KEY_TO_FIFTHS: Record<string, { fifths: number; mode: 'major' | 'minor' }> = {
  C: { fifths: 0, mode: 'major' }, Am: { fifths: 0, mode: 'minor' },
  G: { fifths: 1, mode: 'major' }, Em: { fifths: 1, mode: 'minor' },
  D: { fifths: 2, mode: 'major' }, Bm: { fifths: 2, mode: 'minor' },
  A: { fifths: 3, mode: 'major' }, 'F#m': { fifths: 3, mode: 'minor' },
  E: { fifths: 4, mode: 'major' }, 'C#m': { fifths: 4, mode: 'minor' },
  B: { fifths: 5, mode: 'major' }, 'G#m': { fifths: 5, mode: 'minor' },
  'F#': { fifths: 6, mode: 'major' }, 'D#m': { fifths: 6, mode: 'minor' },
  'C#': { fifths: 7, mode: 'major' }, 'A#m': { fifths: 7, mode: 'minor' },
  F: { fifths: -1, mode: 'major' }, Dm: { fifths: -1, mode: 'minor' },
  Bb: { fifths: -2, mode: 'major' }, Gm: { fifths: -2, mode: 'minor' },
  Eb: { fifths: -3, mode: 'major' }, Cm: { fifths: -3, mode: 'minor' },
  Ab: { fifths: -4, mode: 'major' }, Fm: { fifths: -4, mode: 'minor' },
  Db: { fifths: -5, mode: 'major' }, Bbm: { fifths: -5, mode: 'minor' },
  Gb: { fifths: -6, mode: 'major' }, Ebm: { fifths: -6, mode: 'minor' },
  Cb: { fifths: -7, mode: 'major' }, Abm: { fifths: -7, mode: 'minor' },
};

const STEM_LABELS: Record<string, string> = {
  vocals: 'Вокал',
  drums: 'Ударные',
  bass: 'Бас',
  guitar: 'Гитара',
  piano: 'Пианино',
  other: 'Другие',
};

function keySignatureToMusicXml(keySignature: string | null | undefined): string {
  if (!keySignature || !keySignature.trim()) return '';
  const key = keySignature.trim().replace(/\s+/g, '');
  const parsed =
    KEY_TO_FIFTHS[key] ??
    KEY_TO_FIFTHS[key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()];
  if (!parsed) return '';
  return `<key><fifths>${parsed.fifths}</fifths><mode>${parsed.mode}</mode></key>`;
}

function buildEvents(notes: DivisionNote[]): DivisionEvent[] {
  const events: DivisionEvent[] = [];
  let previousEnd = 0;

  if (notes.length === 0) {
    return [{ duration: MEASURE_DURATION, isRest: true }];
  }

  for (const note of notes) {
    if (note.startDiv > previousEnd) {
      events.push({
        duration: note.startDiv - previousEnd,
        isRest: true,
      });
    }

    events.push({
      pitch: note.pitch,
      duration: note.durationDiv,
      isRest: false,
    });

    previousEnd = Math.max(previousEnd, note.startDiv + note.durationDiv);
  }

  return events;
}

function buildMusicXmlFromDivisionTracks(
  tracks: DivisionTrack[],
  tempo: number,
  keySignature: string | null
): string {
  const parts: string[] = [];
  const partIds: string[] = [];
  const keyXml = keySignatureToMusicXml(keySignature);

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const partId = `P${i + 1}`;
    partIds.push(partId);

    const events = buildEvents(
      [...track.notes].sort((a, b) => a.startDiv - b.startDiv)
    );

    let partXml = `<part id="${partId}">`;
    let eventIdx = 0;
    let measureNum = 1;

    while (eventIdx < events.length || measureNum === 1) {
      partXml += `<measure number="${measureNum}">`;
      if (measureNum === 1) {
        partXml += `<attributes><divisions>${DIVISIONS}</divisions>`;
        partXml += '<time><beats>4</beats><beat-type>4</beat-type></time>';
        if (keyXml) partXml += keyXml;
        partXml += '</attributes>';
        partXml += `<direction><sound tempo="${Math.round(tempo)}"/></direction>`;
      }

      let measureDiv = 0;
      while (eventIdx < events.length && measureDiv < MEASURE_DURATION) {
        const event = events[eventIdx];
        const take = Math.min(event.duration, MEASURE_DURATION - measureDiv);
        if (take <= 0) break;

        if (event.isRest) {
          partXml += `<note><rest/><duration>${take}</duration><type>${divisionsToType(take)}</type></note>`;
        } else {
          const { step, alter, octave } = midiToStep(event.pitch!);
          partXml += `<note><pitch><step>${step}</step>`;
          if (alter !== undefined) partXml += `<alter>${alter}</alter>`;
          partXml += `<octave>${octave}</octave></pitch>`;
          partXml += `<duration>${take}</duration><type>${divisionsToType(take)}</type></note>`;
        }

        measureDiv += take;
        if (take >= event.duration) {
          eventIdx++;
        } else {
          events[eventIdx] = { ...event, duration: event.duration - take };
        }
      }

      if (measureDiv < MEASURE_DURATION && eventIdx >= events.length) {
        const rest = MEASURE_DURATION - measureDiv;
        partXml += `<note><rest/><duration>${rest}</duration><type>${divisionsToType(rest)}</type></note>`;
      }

      partXml += '</measure>';
      measureNum++;
      if (eventIdx >= events.length && measureNum > 2) break;
    }

    partXml += '</part>';
    parts.push(partXml);
  }

  let partList = '';
  for (let i = 0; i < partIds.length; i++) {
    const instrument = tracks[i]?.instrument ?? 'other';
    const name = STEM_LABELS[instrument] ?? instrument;
    partList += `<score-part id="${partIds[i]}"><part-name>${escapeXml(name)}</part-name></score-part>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Score</work-title></work>
  <identification><encoding><software>gtpconverter</software></encoding></identification>
  <part-list>${partList}</part-list>
  ${parts.join('\n  ')}
</score-partwise>`;
}

function normalizeTracksFromSeconds(
  tracks: MidiTrackData[],
  tempo: number
): DivisionTrack[] {
  return tracks.map((track) => ({
    instrument: track.instrument,
    notes: [...track.notes]
      .sort((a, b) => a.startTime - b.startTime)
      .map((note) => ({
        pitch: note.pitch,
        startDiv: Math.max(0, secondsToDivisions(note.startTime, tempo)),
        durationDiv: Math.max(1, secondsToDivisions(note.endTime - note.startTime, tempo)),
        velocity: note.velocity,
      })),
  }));
}

/**
 * Конвертирует MidiTrackData[] в MusicXML.
 * Для треков из аудио-конвертера время хранится в секундах, поэтому мы
 * сначала нормализуем его в "доли" относительно layout-tempo.
 */
export function midiTrackDataToMusicXml(
  tracks: MidiTrackData[],
  tempo: number = TEMPO,
  keySignature: string | null = null
): string {
  return buildMusicXmlFromDivisionTracks(
    normalizeTracksFromSeconds(tracks, tempo),
    tempo,
    keySignature
  );
}

/**
 * Парсит MIDI в MusicXML, сохраняя музыкальное время через ticks/ppq.
 * Это стабильнее, чем переводить MIDI-тайминг через секунды: layout нот остаётся
 * корректным независимо от BPM воспроизведения.
 */
export async function midiBufferToMusicXmlData(
  buffer: ArrayBuffer
): Promise<MidiXmlData> {
  const midi = new Midi(buffer);
  const sourceTempo = midi.header.tempos[0]?.bpm ?? TEMPO;
  const ppq = midi.header.ppq || DIVISIONS;

  const tracks: DivisionTrack[] = midi.tracks
    .filter((track) => track.notes.length > 0)
    .map((track) => ({
      instrument: 'other',
      notes: track.notes
        .map((note) => ({
          pitch: note.midi,
          startDiv: Math.max(0, ticksToDivisions(note.ticks, ppq)),
          durationDiv: Math.max(1, ticksToDivisions(note.durationTicks, ppq)),
          velocity: Math.round((note.velocity ?? 0.8) * 127),
        }))
        .sort((a, b) => a.startDiv - b.startDiv),
    }));

  if (tracks.length === 0) {
    tracks.push({ instrument: 'other', notes: [] });
  }

  return {
    xml: buildMusicXmlFromDivisionTracks(tracks, sourceTempo, null),
    sourceTempo,
  };
}

export async function midiBufferToMusicXml(
  buffer: ArrayBuffer
): Promise<string> {
  const { xml } = await midiBufferToMusicXmlData(buffer);
  return xml;
}
