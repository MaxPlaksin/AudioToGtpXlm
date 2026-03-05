/**
 * Главный хук для всего процесса обработки аудио
 */

import { useCallback, useState } from 'react';
import type {
  AudioFileUpload,
  AudioStems,
  MidiTrackData,
  ProcessingStatus,
} from '../types/audio.types';
import { fileToAudioBuffer, getWaveform } from '../utils/audioBuffer';
import { useAudioSeparation } from './useAudioSeparation';
import { useMidiConversion } from './useMidiConversion';

export interface AudioProcessorState {
  status: ProcessingStatus;
  progress: number;
  downloadProgress?: number;
  audioFile?: AudioFileUpload;
  stems?: AudioStems;
  midiTracks?: MidiTrackData[];
  error?: string;
  separationWarning?: string;
  usedFallback?: boolean;
}

export function useAudioProcessor() {
  const [state, setState] = useState<AudioProcessorState>({
    status: 'idle',
    progress: 0,
  });

  const separation = useAudioSeparation();
  const midiConversion = useMidiConversion();

  const effectiveProgress =
    state.status === 'separating' ? separation.progress : state.progress;
  const downloadProgress =
    state.status === 'separating' ? separation.downloadProgress : 0;

  const processAudio = useCallback(
    async (file: File) => {
      setState({ status: 'loading-model', progress: 0 });

      try {
        const audioBuffer = await fileToAudioBuffer(file);
        const waveform = getWaveform(audioBuffer);
        const audioFile: AudioFileUpload = {
          file,
          buffer: audioBuffer,
          duration: audioBuffer.duration,
          waveform,
        };

        setState((s) => ({
          ...s,
          status: 'separating',
          progress: 10,
          audioFile,
        }));

        const stems = await separation.separate(file);
        if (!stems) {
          setState({
            status: 'error',
            progress: 0,
            error: separation.error ?? 'Ошибка разделения',
          });
          return;
        }

        setState((s) => ({
          ...s,
          status: 'converting',
          progress: 50,
          audioFile: { ...s.audioFile!, stems },
          stems,
        }));

        const midiTracks = await midiConversion.convert(stems);
        if (!midiTracks) {
          setState((s) => ({
            ...s,
            status: 'error',
            error: midiConversion.error ?? 'Ошибка конвертации в MIDI',
          }));
          return;
        }

        setState({
          status: 'ready',
          progress: 100,
          audioFile: { ...audioFile, stems },
          stems,
          midiTracks,
          separationWarning: separation.separationWarning ?? undefined,
          usedFallback: separation.usedFallback ?? false,
        });
      } catch (err) {
        setState({
          status: 'error',
          progress: 0,
          error: err instanceof Error ? err.message : 'Неизвестная ошибка',
        });
      }
    },
    [separation, midiConversion]
  );

  const processStemsFromFiles = useCallback(
    async (files: File[]) => {
      setState({ status: 'loading-model', progress: 0 });

      try {
        setState((s) => ({ ...s, status: 'separating' }));
        const stems = await separation.loadStemsFromFiles(files);
        if (!stems) {
          setState({
            status: 'error',
            progress: 0,
            error: separation.error ?? 'Ошибка загрузки stems',
          });
          return;
        }

        const duration = stems.original.duration;
        const waveform = getWaveform(stems.original);
        const audioFile: AudioFileUpload = {
          file: new File([], 'stems'),
          buffer: stems.original,
          duration,
          waveform,
          stems,
        };

        setState((s) => ({
          ...s,
          status: 'converting',
          progress: 50,
          audioFile,
          stems,
        }));

        const midiTracks = await midiConversion.convert(stems);
        if (!midiTracks) {
          setState((s) => ({
            ...s,
            status: 'error',
            error: midiConversion.error ?? 'Ошибка конвертации в MIDI',
          }));
          return;
        }

        setState({
          status: 'ready',
          progress: 100,
          audioFile: { ...audioFile, stems },
          stems,
          midiTracks,
        });
      } catch (err) {
        setState({
          status: 'error',
          progress: 0,
          error: err instanceof Error ? err.message : 'Неизвестная ошибка',
        });
      }
    },
    [separation, midiConversion]
  );

  const reset = useCallback(() => {
    setState({ status: 'idle', progress: 0 });
    separation.reset();
    midiConversion.reset();
  }, [separation, midiConversion]);

  const updateMidiTracks = useCallback((tracks: MidiTrackData[]) => {
    setState((s) => (s.midiTracks ? { ...s, midiTracks: tracks } : s));
  }, []);

  return {
    state: {
      ...state,
      progress: effectiveProgress,
      downloadProgress,
      separationWarning: separation.separationWarning ?? state.separationWarning,
      usedFallback: separation.usedFallback ?? state.usedFallback,
    },
    processAudio,
    processStemsFromFiles,
    updateMidiTracks,
    reset,
  };
}
