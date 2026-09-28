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
});

// An Embed block is shown as a link, never as HTML. Its value can be a URL, pasted
// iframe code, or plain text; none of them may become a relative link to the markup.
describe('ContentRenderer embed blocks', () => {
  const renderEmbed = (value: string) =>
    renderToStaticMarkup(<ContentRenderer contents={[{ id: 'embed-1', type: 'embed', value }]} />);
  const hrefs = (markup: string) => Array.from(markup.matchAll(/href="([^"]*)"/g), (match) => match[1]);

  it('links the src of pasted iframe code', () => {
    const markup = renderEmbed(`<iframe src='https://www.youtube.com/embed/abc' width='560'></iframe>`);

    expect(hrefs(markup)).toEqual(['https://www.youtube.com/embed/abc']);
    expect(markup).toContain('aria-label="Open embedded content"');
    expect(markup).not.toContain('<iframe');
  });

  it.each([
    '<script src="https://example.com/widget.js"></script>',
    'See the staging dashboard',
    '<iframe src="/relative"></iframe>',
    '//evil.com/x',
  ])('shows %j as text with no link', (value) => {
    const markup = renderEmbed(value);

    expect(hrefs(markup)).toEqual([]);
    expect(markup).toContain('<pre');
    expect(markup).not.toContain('<script');
    expect(markup).not.toContain('<iframe');
  });

  it('keeps linking a URL as before', () => {
    expect(hrefs(renderEmbed('https://example.com/embed'))).toEqual(['https://example.com/embed']);
  });
});

describe('ContentRenderer file blocks', () => {
  const renderFile = (content: Record<string, unknown>) =>
    renderToStaticMarkup(
      <ContentRenderer contents={[{ id: 'file-1', type: 'file', value: '', ...content }]} />,
    );

  // Saved before typing a URL over an upload dropped the old name and size.
  it.each([
    ['with an upload source', { uploadType: 'upload' }],
    ['with no source recorded', {}],
  ])('does not label a linked file with a name left over from an upload (%s)', (_label, extra) => {
    const markup = renderFile({ value: 'https://example.com/pricing.pdf', fileName: 'report.pdf', ...extra });

    expect(markup).not.toContain('report.pdf');
    expect(markup).toContain('aria-label="Download file"');
    expect(markup).toContain('href="https://example.com/pricing.pdf"');
  });

  it('labels an uploaded file and a named linked file with their names', () => {
    expect(
      renderFile({ value: '/api/uploads/file?key=template-files%2Fu1%2Freport.pdf', fileName: 'report.pdf' }),
    ).toContain('aria-label="Download report.pdf"');
    expect(
      renderFile({ value: 'https://example.com/launch.pdf', fileName: 'launch-packet.pdf', uploadType: 'url' }),
    ).toContain('aria-label="Download launch-packet.pdf"');
  });
});

