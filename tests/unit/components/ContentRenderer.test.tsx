import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ContentRenderer } from '@/components/shared/ContentRenderer';

describe('ContentRenderer accessibility', () => {
  const renderText = (value: string) =>
    renderToStaticMarkup(<ContentRenderer contents={[{ id: 'text-1', type: 'text', value }]} />);

  it('preserves authored line breaks and shows a typed backslash-n as saved', () => {
    const markup = renderText('Line one\nSave to C:\\new_folder\nLine three');

    expect(markup).toContain('whitespace-pre-line');
    expect(markup).toContain('Line one\nSave to C:\\new_folder\nLine three');
  });

  it('keeps a backslash-n inside inline and fenced code', () => {
    const markup = renderText('Run `printf(hi\\n)` first\n\n```\nprintf(hi\\n);\n```');

    expect(markup).toContain('<code>printf(hi\\n)</code>');
    expect(markup).toContain('<pre><code>printf(hi\\n);\n</code></pre>');
  });

  it('still lays out legacy single-line seed text, leaving its inline code alone', () => {
    const markup = renderText('- Verify `a\\nb` works.\\n- Confirm paths.');

    expect(markup).toContain('<li>Verify <code>a\\nb</code> works.</li>');
    expect(markup).toContain('<li>Confirm paths.</li>');
  });

  it('renders file, embed, and video content as keyboard-reachable elements with accessible names', () => {
    const markup = renderToStaticMarkup(
      <ContentRenderer
        contents={[
          {
            id: 'file-1',
            fileName: 'launch-plan.pdf',
            type: 'file',
            value: '/api/uploads/file?key=template-files/launch-plan.pdf',
          },
          {
            id: 'embed-1',
            type: 'embed',
            value: 'https://example.com/embed',
          },
          {
            id: 'video-1',
            type: 'video',
            value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          },
          {
            id: 'video-2',
            type: 'video',
            value: 'https://clipy.online/video/tizg5pl1gkul',
          },
        ]}
      />,
    );

    expect(markup).toContain('aria-label="Download launch-plan.pdf"');
    expect(markup).toContain('aria-label="Open embedded content"');
    expect(markup).toContain('title="Task video content"');
    expect(markup).toContain('src="https://clipy.online/embed/tizg5pl1gkul?ref=m4d8e9p&amp;utm_source=serplists.com"');
    expect(markup).toContain('href="https://clipy.online/video/tizg5pl1gkul?ref=m4d8e9p&amp;utm_source=serplists.com"');
    expect(markup).toContain('rel="nofollow noopener noreferrer"');
    expect(markup).toContain('href="/api/uploads/file?key=template-files/launch-plan.pdf"');
  });
});

// A broken task image used to fall back to a placehold.co URL from onError, which
// reloaded forever when that host was unreachable too. Images now fall back to a
// local "Image unavailable" box and never make a second request.
describe('ContentRenderer images', () => {
  const renderImage = (value: string) =>
    renderToStaticMarkup(<ContentRenderer contents={[{ id: 'image-1', type: 'image', value }]} />);

  it('renders a valid image url as an img', () => {
    const markup = renderImage('https://cdn.example.com/photo.png');

    expect(markup).toContain('<img');
    expect(markup).toContain('src="https://cdn.example.com/photo.png"');
    expect(markup).not.toContain('Image unavailable');
  });

  it('keeps uploaded images served from the app', () => {
    const markup = renderImage('/api/uploads/file?key=template-images/photo.png');

    expect(markup).toContain('src="/api/uploads/file?key=template-images/photo.png"');
  });

  it.each(['javascript:alert(1)', 'mailto:someone@example.com', 'tel:+15551234567', '#section', 'photo.png'])(
    'shows a local fallback for %s without loading anything',
    (value) => {
      const markup = renderImage(value);

      expect(markup).toContain('Image unavailable');
      expect(markup).toContain('role="img"');
      expect(markup).not.toContain('<img');
      expect(markup).not.toContain('placehold.co');
    },
  );
});
