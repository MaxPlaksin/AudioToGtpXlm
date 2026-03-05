import { motion } from 'framer-motion';

const STATUS_LABELS: Record<string, string> = {
  'loading-model': 'Загрузка модели...',
  separating: 'Разделение на инструменты...',
  converting: 'Конвертация в MIDI...',
  ready: 'Готово!',
  error: 'Ошибка',
};

interface ProcessingStatusProps {
  status: string;
  progress: number;
  downloadProgress?: number;
  error?: string;
  separationWarning?: string;
  usedFallback?: boolean;
}

export function ProcessingStatus({
  status,
  progress,
  downloadProgress = 0,
  error,
  separationWarning,
  usedFallback,
}: ProcessingStatusProps) {
  if (status === 'idle') return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8"
    >
      <div className="flex items-center gap-4">
        {status !== 'ready' && status !== 'error' && (
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#8A2BE2] border-t-transparent" />
        )}
        {status === 'ready' && (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-green-500 to-emerald-600">
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        )}
        <div className="flex-1">
          <p className="text-lg font-semibold text-[#E0E0E0]">
            {STATUS_LABELS[status] ?? status}
          </p>
          {error && (
            <p className="mt-1 text-sm text-red-400">{error}</p>
          )}
          {separationWarning && status === 'ready' && (
            <div
              className={`mt-3 rounded-lg border p-3 text-sm ${
                usedFallback
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                  : 'border-[#8A2BE2]/50 bg-[#8A2BE2]/10 text-[#A0A0A0]'
              }`}
            >
              <p className="font-medium">
                {usedFallback ? '⚠ Качество разделения' : '💡 Совет'}
              </p>
              <p className="mt-1">{separationWarning}</p>
            </div>
          )}
          {(status === 'loading-model' ||
            status === 'separating' ||
            status === 'converting') && (
            <div className="mt-3 space-y-2">
              {downloadProgress > 0 && downloadProgress < 100 && (
                <p className="text-sm text-[#A0A0A0]">
                  Скачивание модели: {downloadProgress.toFixed(0)}%
                </p>
              )}
              <div className="h-2 overflow-hidden rounded-full bg-[#2A2A2A]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082]"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
