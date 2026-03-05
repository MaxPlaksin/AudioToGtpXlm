/**
 * Предзагрузка моделей в фоне для ускорения первого использования
 */

import { useEffect } from 'react';

const DEMUCS_MODEL_KEY = 'demucs-htdemucs-embedded';
const MODEL_URL =
  'https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx';

async function checkOrDownloadDemucs(): Promise<void> {
  try {
    const { getCachedModel, cacheModel } = await import('../utils/modelCache');
    const cached = await getCachedModel(DEMUCS_MODEL_KEY);
    if (cached) return;

    const response = await fetch(MODEL_URL);
    const buffer = await response.arrayBuffer();
    await cacheModel(DEMUCS_MODEL_KEY, buffer);
  } catch (e) {
    console.warn('Model preload failed:', e);
  }
}

export function useModelPreload(): void {
  useEffect(() => {
    const id = setTimeout(checkOrDownloadDemucs, 3000);
    return () => clearTimeout(id);
  }, []);
}
