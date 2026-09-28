import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { VideoEmbed } from '@/components/shared/VideoEmbed';

describe('VideoEmbed', () => {
  it('frames a YouTube watch URL through the allowlisted embed player', () => {
    const markup = renderToStaticMarkup(
      <VideoEmbed url="https://www.youtube.com/watch?v=aqz-KE-bpKQ" />,
    );

    expect(markup).toContain('<iframe');
    expect(markup).toContain('src="https://www.youtube.com/embed/aqz-KE-bpKQ"');
    expect(markup).toContain('title="Embedded video"');
  });

  it('links out to embed code from an origin the policy does not frame', () => {
    const markup = renderToStaticMarkup(
      <VideoEmbed url={'<iframe src="https://player.vimeo.com/video/76979871"></iframe>'} />,
    );

    expect(markup).not.toContain('<iframe');
    expect(markup).not.toContain('Invalid video URL');
    expect(markup).toContain('href="https://player.vimeo.com/video/76979871"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('Open video');
  });

  it('still reports values that are not web URLs', () => {
    expect(renderToStaticMarkup(<VideoEmbed url="javascript:alert(1)" />)).toContain(
      'Invalid video URL or embed code',
    );
  });
});
