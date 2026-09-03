import React from 'react';
import { ExternalLink } from 'lucide-react';

import { getOutboundLinkProps } from '@/lib/utils/clipyUrl';
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
      <div className="aspect-w-16 aspect-h-9 relative overflow-hidden rounded-md">
        <iframe
          src={source.url}
          title={title}
          className={className}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {source.outboundUrl ? (
          <a
            {...getOutboundLinkProps(source.outboundUrl)}
            className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/75 px-3 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Watch on Clipy
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          </a>
        ) : null}
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
