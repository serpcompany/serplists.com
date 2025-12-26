import React from 'react';
import { getYoutubeVideoId } from '@/utils/urlHelpers';

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
  const videoId = getYoutubeVideoId(url);
  
  if (videoId) {
    return (
      <div className="aspect-w-16 aspect-h-9 overflow-hidden rounded-md">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title={title}
          className={className}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  
  return <div className="italic text-muted-foreground">{url}</div>;
};