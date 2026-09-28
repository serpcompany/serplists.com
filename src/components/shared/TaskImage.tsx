import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

import { resolveTaskImageSource } from './taskImageSource';

interface TaskImageViewProps {
  alt: string;
  onFail: () => void;
  src: string | null;
}

// onError only reports the failure. Setting src from the handler would start a new
// load, and a fallback that fails too would then reload forever.
export const TaskImageView: React.FC<TaskImageViewProps> = ({ alt, onFail, src }) => {
  if (!src) {
    return (
      <div
        aria-label="Image unavailable"
        className="flex items-center justify-center gap-2 bg-muted/30 py-8 text-sm text-muted-foreground"
        role="img"
      >
        <ImageOff aria-hidden="true" className="h-5 w-5" />
        <span>Image unavailable</span>
      </div>
    );
  }

  return <img alt={alt} className="w-full max-h-96 object-contain" onError={onFail} src={src} />;
};

interface TaskImageProps {
  alt?: string;
  url: string;
}

export const TaskImage: React.FC<TaskImageProps> = ({ alt = 'Task content', url }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = resolveTaskImageSource(url, failedSrc);

  return <TaskImageView alt={alt} onFail={() => setFailedSrc(src)} src={src} />;
};
