import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ContentRenderer } from '@/components/shared/ContentRenderer';

describe('ContentRenderer accessibility', () => {
  it('preserves authored line breaks in text content', () => {
    const markup = renderToStaticMarkup(
      <ContentRenderer
        contents={[
          {
            id: 'text-1',
            type: 'text',
            value: 'Line one\nLine two\\nLine three',
          },
        ]}
      />,
    );

    expect(markup).toContain('whitespace-pre-line');
    expect(markup).toContain('Line one\nLine two\nLine three');
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
    expect(markup).toContain('src="https://clipy.online/embed/tizg5pl1gkul?ref=serplists.com"');
    expect(markup).toContain('href="https://clipy.online/video/tizg5pl1gkul?ref=serplists.com"');
    expect(markup).toContain('rel="nofollow noopener noreferrer"');
    expect(markup).toContain('href="/api/uploads/file?key=template-files/launch-plan.pdf"');
  });

  it('renders image content as a keyboard-accessible lightbox trigger', () => {
    const markup = renderToStaticMarkup(
      <ContentRenderer
        contents={[
          {
            id: 'image-1',
            type: 'image',
            value: 'https://cdn.clipy.online/key-moments/demo/image.jpg',
          },
        ]}
      />,
    );

    expect(markup).toContain('aria-label="View image full size"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('cursor-zoom-in');
    expect(markup).toContain('View full size');
  });

  it('turns Clipy URLs in generated text into referred new-tab nofollow links', () => {
    const markup = renderToStaticMarkup(
      <ContentRenderer
        contents={[{
          id: 'text-clipy',
          type: 'text',
          value: 'Source: https://clipy.online/video/8fptqlnappr6',
        }]}
      />,
    );

    expect(markup).toContain('href="https://clipy.online/video/8fptqlnappr6?ref=serplists.com"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="nofollow noopener noreferrer"');
  });
});
