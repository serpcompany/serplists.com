import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';

import { getOutboundLinkProps } from '@/lib/utils/clipyUrl';
import { getVideoEmbedSource } from '@/utils/urlHelpers';

interface VideoEmbedProps {
  url: string;
  title?: string;
  className?: string;
}

const DEFAULT_CLASS_NAME = "h-64 w-full rounded-md";

const OpenVideoLink: React.FC<{ url: string }> = ({ url }) => (
  <div className="p-4">
    <a
      {...getOutboundLinkProps(url)}
      className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
    >
      Open video
      <ExternalLink aria-hidden="true" className="h-4 w-4" />
    </a>
  </div>
);

const READY_STATE_HAVE_NOTHING = 0;

interface NativeVideoViewProps {
  className?: string;
  failed: boolean;
  onFail: () => void;
  url: string;
}

export const NativeVideoView: React.FC<NativeVideoViewProps> = ({
  className = DEFAULT_CLASS_NAME,
  failed,
  onFail,
  url,
}) => {
  if (failed) return <OpenVideoLink url={url} />;

  return (
    <video
      key={url}
      src={url}
      className={className}
      controls
      onError={(event) => {
        if (event.currentTarget.readyState === READY_STATE_HAVE_NOTHING) onFail();
      }}
      preload="metadata"
    >
      Your browser does not support embedded video.
    </video>
  );
};

export const VideoEmbed: React.FC<VideoEmbedProps> = ({ 
  url, 
  title = "Embedded video",
  className = DEFAULT_CLASS_NAME
}) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
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
            className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/75 px-3 py-1.5 text-xs font-medium text-white shadow-xs backdrop-blur-xs transition-colors hover:bg-black/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
          >
            Watch on Clipy
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    );
  }

  if (source?.kind === 'link') {
    return <OpenVideoLink url={source.url} />;
  }

  if (source?.kind === 'video') {
    const videoUrl = source.url;
    return (
      <NativeVideoView
        className={className}
        failed={failedUrl === videoUrl}
        onFail={() => setFailedUrl(videoUrl)}
        url={videoUrl}
      />
    );
  }
  
  return <div className="italic text-muted-foreground">Invalid video URL or embed code</div>;
};
