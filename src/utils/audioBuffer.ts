/**
 * Утилиты для работы с AudioBuffer
 */

const WAVEFORM_SAMPLES = 512;

/**
 * Конвертирует File в AudioBuffer
 */
export async function fileToAudioBuffer(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  return audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Генерирует даунсемплированную волновую форму для визуализации
 */
export function getWaveform(audioBuffer: AudioBuffer): number[] {
  const data = audioBuffer.getChannelData(0);
  const waveform: number[] = [];
  const blockSize = Math.floor(data.length / WAVEFORM_SAMPLES);

  for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, data.length);
    const slice = data.slice(start, end);
    const max = slice.length > 0 ? Math.max(...slice.map(Math.abs)) : 0;
    waveform.push(max);
  }

  return waveform;
}

export const BASIC_PITCH_SAMPLE_RATE = 22050;
export const DEMUCS_SAMPLE_RATE = 44100;

function createMonoFromStereo(audioBuffer: AudioBuffer): Float32Array {
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.numberOfChannels > 1
    ? audioBuffer.getChannelData(1)
    : left;
  const mono = new Float32Array(audioBuffer.length);
  for (let i = 0; i < audioBuffer.length; i++) {
    mono[i] = (left[i] + right[i]) / 2;
  }
  return mono;
}

function createMonoFloatArray(audioBuffer: AudioBuffer): Float32Array {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0).slice();
  }
  return createMonoFromStereo(audioBuffer);
}

/**
 * Линейная интерполяция при ресемплинге
 */
function resampleFloatArray(
  input: Float32Array,
  inputRate: number,
  outputRate: number
): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const idx = Math.floor(srcIndex);
    const frac = srcIndex - idx;
    output[i] =
      idx < input.length - 1
        ? input[idx] * (1 - frac) + input[idx + 1] * frac
        : input[idx];
  }
  return output;
}

/**
 * Ресемплирует AudioBuffer в моно 22050 Hz для Basic Pitch
 */
export function resampleToMono22050(audioBuffer: AudioBuffer): AudioBuffer {
  if (
    audioBuffer.sampleRate === BASIC_PITCH_SAMPLE_RATE &&
    audioBuffer.numberOfChannels === 1
  ) {
    return audioBuffer;
  }

  const monoData = createMonoFloatArray(audioBuffer);
  const resampled = resampleFloatArray(
    monoData,
    audioBuffer.sampleRate,
    BASIC_PITCH_SAMPLE_RATE
  );

  const ctx = new AudioContext({ sampleRate: BASIC_PITCH_SAMPLE_RATE });
  const buffer = ctx.createBuffer(1, resampled.length, BASIC_PITCH_SAMPLE_RATE);
  const channelData = new Float32Array(resampled.length);
  channelData.set(resampled);
  buffer.copyToChannel(channelData, 0);
  return buffer;
}

/**
 * Ресемплирует AudioBuffer в стерео 44100 Hz для Demucs
 */
export function resampleTo44100Stereo(audioBuffer: AudioBuffer): AudioBuffer {
  if (
    audioBuffer.sampleRate === DEMUCS_SAMPLE_RATE &&
    audioBuffer.numberOfChannels === 2
  ) {
    return audioBuffer;
  }

  const left = audioBuffer.getChannelData(0);
  const right =
    audioBuffer.numberOfChannels > 1
      ? audioBuffer.getChannelData(1)
      : left;
  const resampledLeft = resampleFloatArray(
    left,
    audioBuffer.sampleRate,
    DEMUCS_SAMPLE_RATE
  );
  const resampledRight = resampleFloatArray(
    right,
    audioBuffer.sampleRate,
    DEMUCS_SAMPLE_RATE
  );

  const ctx = new AudioContext({ sampleRate: DEMUCS_SAMPLE_RATE });
  const buffer = ctx.createBuffer(
    2,
    resampledLeft.length,
    DEMUCS_SAMPLE_RATE
  );
  buffer.copyToChannel(new Float32Array(resampledLeft), 0);
  buffer.copyToChannel(new Float32Array(resampledRight), 1);
  return buffer;
}

/**
 * Конвертирует AudioBuffer в WAV Blob для howler.js
 */
export function audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = audioBuffer.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const channels: Float32Array[] = [];

  for (let i = 0; i < numChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true); // format (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  const offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset + (i * numChannels + ch) * 2, intSample, true);
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
