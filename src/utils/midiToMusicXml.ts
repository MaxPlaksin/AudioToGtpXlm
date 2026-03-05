/**
 * Конвертация MIDI в MusicXML для AlphaTab (AlphaTab не поддерживает импорт MIDI)
 */

import { Midi } from '@tonejs/midi';
import type { MidiTrackData } from '../types/audio.types';

const DIVISIONS = 480;
const TEMPO = 120;

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

/**
 * Конвертирует MidiTrackData[] в MusicXML
 */
export function midiTrackDataToMusicXml(
  tracks: MidiTrackData[],
  tempo: number = TEMPO
): string {
  const parts: string[] = [];
  const partIds: string[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const partId = `P${i + 1}`;
    partIds.push(partId);

    const sortedNotes = [...track.notes].sort((a, b) => a.startTime - b.startTime);

    const events: Array<{ pitch?: number; duration: number; isRest: boolean }> = [];
    let prevEnd = 0;
    if (sortedNotes.length === 0) {
      events.push({ duration: DIVISIONS * 4, isRest: true });
    }
    for (const n of sortedNotes) {
      const startDiv = secondsToDivisions(n.startTime, tempo);
      const durDiv = Math.max(1, secondsToDivisions(n.endTime - n.startTime, tempo));
      if (startDiv > prevEnd) {
        events.push({ duration: startDiv - prevEnd, isRest: true });
      }
      events.push({ pitch: n.pitch, duration: durDiv, isRest: false });
      prevEnd = startDiv + durDiv;
    }
    const measureDuration = DIVISIONS * 4;

    let partXml = `<part id="${partId}">`;
    let eventIdx = 0;
    let measureNum = 1;

    while (eventIdx < events.length || measureNum === 1) {
      partXml += `<measure number="${measureNum}">`;
      if (measureNum === 1) {
        partXml += '<attributes><divisions>' + DIVISIONS + '</divisions>';
        partXml += '<time><beats>4</beats><beat-type>4</beat-type></time>';
        partXml += '</attributes>';
      }

      let measureDiv = 0;
      while (eventIdx < events.length && measureDiv < measureDuration) {
        const ev = events[eventIdx];
        const take = Math.min(ev.duration, measureDuration - measureDiv);
        if (take <= 0) break;

        if (ev.isRest) {
          partXml += '<note><rest/><duration>' + take + '</duration><type>' + divisionsToType(take) + '</type></note>';
        } else {
          const { step, alter, octave } = midiToStep(ev.pitch!);
          partXml += '<note><pitch><step>' + step + '</step>';
          if (alter !== undefined) partXml += '<alter>' + alter + '</alter>';
          partXml += '<octave>' + octave + '</octave></pitch>';
          partXml += '<duration>' + take + '</duration><type>' + divisionsToType(take) + '</type></note>';
        }
        measureDiv += take;
        if (take >= ev.duration) {
          eventIdx++;
        } else {
          events[eventIdx] = { ...ev, duration: ev.duration - take };
        }
      }
      if (measureDiv < measureDuration && eventIdx >= events.length) {
        partXml += '<note><rest/><duration>' + (measureDuration - measureDiv) + '</duration><type>whole</type></note>';
      }
      partXml += '</measure>';
      measureNum++;
      if (eventIdx >= events.length && measureNum > 2) break;
    }
    partXml += '</part>';
    parts.push(partXml);
  }

  const STEM_LABELS: Record<string, string> = {
    vocals: 'Вокал',
    drums: 'Ударные',
    bass: 'Бас',
    guitar: 'Гитара',
    piano: 'Пианино',
    other: 'Другие',
  };
  let partList = '';
  for (let i = 0; i < partIds.length; i++) {
    const inst = tracks[i]?.instrument ?? 'other';
    const name = STEM_LABELS[inst] ?? inst;
    partList +=
      '<score-part id="' +
      partIds[i] +
      '"><part-name>' +
      escapeXml(name) +
      '</part-name></score-part>';
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

/**
 * Парсит бинарный MIDI и конвертирует в MusicXML
 */
export async function midiBufferToMusicXml(buffer: ArrayBuffer): Promise<string> {
  const midi = new Midi(buffer);
  const tempo = midi.header.tempos[0]?.bpm ?? TEMPO;
  const tracks: MidiTrackData[] = [];

  for (const track of midi.tracks) {
    if (track.notes.length === 0) continue;
    const notes = track.notes.map((n) => ({
      pitch: n.midi,
      startTime: n.time,
      endTime: n.time + n.duration,
      velocity: Math.round((n.velocity ?? 0.8) * 127),
    }));
    tracks.push({
      instrument: 'other',
      notes,
    });
  }

  if (tracks.length === 0) {
    tracks.push({ instrument: 'other', notes: [] });
  }

  return midiTrackDataToMusicXml(tracks, tempo);
}
