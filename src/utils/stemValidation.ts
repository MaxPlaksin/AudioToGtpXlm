/**
 * Валидация качества разделения stems.
 * Определяет, что stems действительно разные, а не копии оригинала.
 */

function getSampleSlice(buffer: AudioBuffer, channel: number, start: number, count: number): Float32Array {
  const data = buffer.getChannelData(channel);
  return data.slice(start, start + count);
}

function correlation(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
    sumAB += a[i] * b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
  }
  const denom = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
  if (denom === 0) return 1;
  return (n * sumAB - sumA * sumB) / denom;
}

export interface StemValidationResult {
  isValid: boolean;
  isFallback: boolean;
  warning?: string;
}

const SAMPLE_CHECK_COUNT = 5000;

/**
 * Проверяет, что stems — результат реального разделения, а не fallback (копии оригинала).
 */
export function validateStemSeparation(
  stems: { drums?: AudioBuffer; bass?: AudioBuffer; other?: AudioBuffer; vocals?: AudioBuffer }
): StemValidationResult {
  const entries = [
    stems.drums,
    stems.bass,
    stems.other,
    stems.vocals,
  ].filter((b): b is AudioBuffer => !!b);

  if (entries.length < 2) {
    return { isValid: true, isFallback: false };
  }

  // Проверка 1: все stems идентичны (fallback)?
  const ref = getSampleSlice(entries[0]!, 0, 0, SAMPLE_CHECK_COUNT);
  let allIdentical = true;
  for (let i = 1; i < entries.length; i++) {
    const cmp = getSampleSlice(entries[i]!, 0, 0, SAMPLE_CHECK_COUNT);
    const corr = correlation(ref, cmp);
    if (corr < 0.9999) {
      allIdentical = false;
      break;
    }
  }
  if (allIdentical) {
    return {
      isValid: false,
      isFallback: true,
      warning: 'Все дорожки идентичны. Разделение не сработало — используется копия оригинала. Настройте backend: npm run setup',
    };
  }

  // Проверка 2: stems слишком похожи друг на друга?
  let maxCorr = 0;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = getSampleSlice(entries[i]!, 0, 0, SAMPLE_CHECK_COUNT);
      const b = getSampleSlice(entries[j]!, 0, 0, SAMPLE_CHECK_COUNT);
      const c = Math.abs(correlation(a, b));
      maxCorr = Math.max(maxCorr, c);
    }
  }
  if (maxCorr > 0.95) {
    return {
      isValid: true,
      isFallback: false,
      warning: 'Некоторые дорожки очень похожи. Качество разделения может быть низким. Используйте backend (npm run setup) для лучшего результата.',
    };
  }

  return { isValid: true, isFallback: false };
}
