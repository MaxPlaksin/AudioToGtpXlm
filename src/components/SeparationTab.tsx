/**
 * Вкладка «Разделение на дорожки» — загрузка аудио и разделение на stems
 */

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { FileUploader } from './FileUploader';
import { ProcessingStatus } from './ProcessingStatus';
import { StemPlayer } from './StemPlayer';
import { useAudioSeparation } from '../hooks/useAudioSeparation';

export function SeparationTab() {
  const [baseFilename, setBaseFilename] = useState('stems');
  const { stems, isLoading, progress, downloadProgress, error, separationWarning, usedFallback, separate, reset } =
    useAudioSeparation();

  const handleFileSelect = useCallback(
    (file: File) => {
      setBaseFilename(file.name.replace(/\.[^.]+$/, ''));
      separate(file);
    },
    [separate]
  );

  const status = isLoading ? 'separating' : stems ? 'ready' : 'idle';
  const effectiveError = status === 'idle' ? undefined : (error ?? undefined);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <FileUploader
        onFileSelect={handleFileSelect}
        disabled={isLoading}
      />

      <ProcessingStatus
        status={status}
        progress={progress}
        downloadProgress={downloadProgress}
        error={effectiveError}
        separationWarning={separationWarning ?? undefined}
        usedFallback={usedFallback}
      />

      {stems && (
        <StemPlayer
          stems={stems}
          duration={stems.original.duration}
          baseFilename={baseFilename}
        />
      )}

      {status !== 'idle' && (
        <div className="flex justify-center">
          <button
            onClick={reset}
            className="rounded-full border border-[#2A2A2A] px-8 py-3 font-medium text-[#A0A0A0] transition-all hover:border-[#3A3A3A] hover:text-[#E0E0E0]"
          >
            Начать заново
          </button>
        </div>
      )}
    </motion.div>
  );
}
