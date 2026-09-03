import React from 'react';
import { getVideoEmbedSource } from '@/utils/urlHelpers';

interface VideoEmbedProps {
  url: string;
  title?: string;
  className?: string;
}

export const VideoEmbed: React.FC<VideoEmbedProps> = ({ 
  url, 
  title = "YouTube video",
  className = "h-64 w-full rounded-md"
}) => {
  const source = getVideoEmbedSource(url);
  
  if (source?.kind === 'iframe') {
    return (
      <div className="aspect-w-16 aspect-h-9 overflow-hidden rounded-md">
        <iframe
          src={source.url}
          title={title}
          className={className}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (source?.kind === 'video') {
    return (
      <video className={className} controls preload="metadata">
        <source src={source.url} />
        Your browser does not support embedded video.
      </video>
    );
  }
  
  return <div className="italic text-muted-foreground">Invalid video URL or embed code</div>;
};
