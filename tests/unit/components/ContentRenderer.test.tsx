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
    expect(markup).toContain('src="https://clipy.online/embed/tizg5pl1gkul?ref=m4d8e9p&amp;utm_source=serplists.com"');
    expect(markup).toContain('href="https://clipy.online/video/tizg5pl1gkul?ref=m4d8e9p&amp;utm_source=serplists.com"');
    expect(markup).toContain('rel="nofollow noopener noreferrer"');
    expect(markup).toContain('href="/api/uploads/file?key=template-files/launch-plan.pdf"');
  });

  it('names every sub-task checkbox after its sub-task, never blank', () => {
    const markup = renderToStaticMarkup(
      <ContentRenderer
        contents={[
          {
            type: 'subItems',
            value: '',
            subItems: [
              { id: 'a', title: 'Send the approval email', isCompleted: true },
              { id: 'b', title: '  ', isCompleted: false },
            ],
          },
        ]}
        onSubItemToggle={() => undefined}
      />,
    );
    const checkboxes = markup.match(/<button[^>]*role="checkbox"[^>]*>/g) ?? [];

    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toContain('aria-label="Send the approval email"');
    expect(checkboxes[0]).toContain('aria-checked="true"');
    expect(checkboxes[1]).toContain('aria-label="Sub-task 2"');
  });
});
