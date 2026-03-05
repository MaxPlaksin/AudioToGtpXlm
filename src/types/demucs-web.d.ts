declare module 'demucs-web' {
  export const CONSTANTS: {
    SAMPLE_RATE: number;
    DEFAULT_MODEL_URL: string;
  };

  export class DemucsProcessor {
    constructor(options: {
      ort: unknown;
      onProgress?: (info: { progress: number }) => void;
      onDownloadProgress?: (loaded: number, total: number) => void;
      onLog?: (phase: string, msg: string) => void;
    });
    loadModel(pathOrBuffer: string | ArrayBuffer): Promise<unknown>;
    separate(
      left: Float32Array,
      right: Float32Array
    ): Promise<{
      drums: { left: Float32Array; right: Float32Array };
      bass: { left: Float32Array; right: Float32Array };
      other: { left: Float32Array; right: Float32Array };
      vocals: { left: Float32Array; right: Float32Array };
    }>;
  }
}
