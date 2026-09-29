import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { NativeVideoView, VideoEmbed } from '@/components/shared/VideoEmbed';

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

    const player = (url: string) => NativeVideoView({ failed: false, onFail: vi.fn(), url }) as React.ReactElement;
    expect(player('https://cdn.example.com/a.mp4').type).toBe('video');
    expect(player('https://cdn.example.com/a.mp4').key).toBe('https://cdn.example.com/a.mp4');
    expect(player('https://cdn.example.com/b.mp4').key).toBe('https://cdn.example.com/b.mp4');
  });
});

// Any http(s) URL that is not YouTube or Clipy goes to the native player, including pages
// such as a Vimeo or Loom link. The player could not play them and offered no way to them.
describe('NativeVideoView', () => {
  const pageUrl = 'https://vimeo.com/76979871';

  it('links to the video once the player could not load it', () => {
    const markup = renderToStaticMarkup(<NativeVideoView failed onFail={() => undefined} url={pageUrl} />);

    expect(markup).not.toContain('<video');
    expect(markup).toContain(`href="${pageUrl}"`);
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('Open video');
  });

  it('reports a load failure from the player that loads the URL, but not an error after it loaded', () => {
    const onFail = vi.fn();
    const video = NativeVideoView({ failed: false, onFail, url: pageUrl }) as React.ReactElement<{
      onError: (event: unknown) => void;
      src: string;
    }>;
    expect(video.type).toBe('video');
    expect(video.props.src).toBe(pageUrl);

    // A playing video whose connection drops keeps its player.
    video.props.onError({ currentTarget: { readyState: 3 } });
    expect(onFail).not.toHaveBeenCalled();

    video.props.onError({ currentTarget: { readyState: 0 } });
    expect(onFail).toHaveBeenCalledTimes(1);
  });
});

