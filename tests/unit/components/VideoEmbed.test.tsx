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

  // Changing the src of a <source> already in a player loads nothing, and React reuses the
  // player when only the URL changes: it kept playing the first file it loaded.
  it('loads a direct video URL on the player itself, with a new player for each URL', () => {
    const markup = renderToStaticMarkup(<VideoEmbed url="https://cdn.example.com/a.mp4" />);

    expect(markup).toMatch(/<video[^>]* src="https:\/\/cdn\.example\.com\/a\.mp4"/);
    expect(markup).not.toContain('<source');
    expect(markup).toContain('Your browser does not support embedded video.');

    const first = VideoEmbed({ url: 'https://cdn.example.com/a.mp4' }) as React.ReactElement;
    const second = VideoEmbed({ url: ' https://cdn.example.com/b.mp4 ' }) as React.ReactElement;
    expect(first.type).toBe('video');
    expect(first.key).toBe('https://cdn.example.com/a.mp4');
    expect(second.key).toBe('https://cdn.example.com/b.mp4');
  });
});

