/**
 * Типы для приложения Audio-to-GTP Converter
 */

export type StemType =
  | 'vocals'
  | 'drums'
  | 'bass'
  | 'other'
  | 'guitar'
  | 'piano';

export const STEM_ORDER: StemType[] = [
  'vocals',
  'drums',
  'bass',
  'guitar',
  'piano',
  'other',
];

export const STEM_LABELS: Record<StemType, string> = {
  vocals: 'Вокал',
  drums: 'Ударные',
  bass: 'Бас',
  guitar: 'Гитара',
  piano: 'Пианино',
  other: 'Другие',
};

export interface AudioStems {
  vocals?: AudioBuffer;
  drums?: AudioBuffer;
  bass?: AudioBuffer;
  other?: AudioBuffer;
  guitar?: AudioBuffer;
  piano?: AudioBuffer;
  original: AudioBuffer;
}

export interface AudioFileUpload {
  file: File;
  buffer?: AudioBuffer;
  duration: number;
  waveform?: number[];
  stems?: AudioStems;
}

export interface MidiNote {
  pitch: number;
  startTime: number;
  endTime: number;
  velocity: number;
}

export interface MidiTrackData {
  instrument: StemType;
  notes: MidiNote[];
  program?: number;
}

export type ProcessingStatus =
  | 'idle'
  | 'loading-model'
  | 'separating'
  | 'converting'
  | 'ready'
  | 'error';

export interface AudioProcessorState {
  status: ProcessingStatus;
  progress: number;
  audioFile?: AudioFileUpload;
  stems?: AudioStems;
  midiTracks?: MidiTrackData[];
  error?: string;
}

export const SUPPORTED_AUDIO_FORMATS = [
  'audio/mpeg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/flac',
  'audio/mp4',
  'audio/x-m4a',
] as const;

export const MAX_FILE_SIZE_MB = 100;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
