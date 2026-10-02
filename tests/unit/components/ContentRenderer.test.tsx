import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ContentRenderer } from '@/components/shared/ContentRenderer';
import type { ChecklistItemContent } from '@/types/checklist';
import { findElement } from '../../support/elementTree';

describe('ContentRenderer accessibility', () => {
  it('renders malformed stored content without throwing', () => {
    const contents = [
      { type: 'text', value: {} },
      { type: 'embed', value: ['x'] },
      { type: 'subItems', value: '', subItems: 'x' },
      { type: 'subItems', value: '', subItems: [{ id: 'a', title: { en: 'x' } }, null] },
    ] as unknown as ChecklistItemContent[];

    expect(() => renderToStaticMarkup(<ContentRenderer contents={contents} />)).not.toThrow();
  });

  it('reports a Sub-task toggle by the stored positions of its block and Sub-task, malformed blocks before it included, since saves address them by position', () => {
    const onSubItemToggle = vi.fn();
    const contents = [
      null,
      { type: 'text', value: {} },
      { id: 'steps', type: 'subItems', value: '', subItems: [{ id: 'first', title: 'First' }, { id: 'second', title: 'Second' }] },
    ] as unknown as ChecklistItemContent[];

    const rendered = ContentRenderer({ contents, onSubItemToggle });
    const second = findElement(rendered, (element) => element.props['aria-label'] === 'Second');
    (second?.props.onCheckedChange as () => void)();

    expect(onSubItemToggle).toHaveBeenCalledWith(2, 1, true);
  });

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
    const checkboxRoleTags = markup.match(/<[a-z]+[^>]*role="checkbox"[^>]*>/g) ?? [];

    expect(checkboxRoleTags).toHaveLength(2);
    expect(checkboxRoleTags[0]).toContain('aria-label="Send the approval email"');
    expect(checkboxRoleTags[0]).toContain('aria-checked="true"');
    expect(checkboxRoleTags[1]).toContain('aria-label="Sub-task 2"');
  });
});

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
    'shows a local fallback for %s without loading anything, never a remote placeholder',
    (value) => {
      const markup = renderImage(value);

      expect(markup).toContain('Image unavailable');
      expect(markup).toContain('role="img"');
      expect(markup).not.toContain('<img');
      expect(markup).not.toContain('placehold.co');
    },
  );
});

describe('ContentRenderer embed blocks, shown as a link and never as HTML', () => {
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
  ])('shows %j as text with no link, never a relative link to the markup', (value) => {
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

  it.each([
    ['with an upload source', { uploadType: 'upload' }],
    ['with no source recorded', {}],
  ])('does not label a linked file with a name left over from an upload, saved before typing a URL dropped it (%s)', (_label, extra) => {
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

describe('ContentRenderer Sub-tasks heading, one level below the task around it', () => {
  const contents: ChecklistItemContent[] = [
    { id: 'sub-1', type: 'subItems', value: '', subItems: [{ id: 'a', title: 'Check the title' }] },
  ];

  it("is an h4 by default, under a shared run's h3 tasks", () => {
    expect(renderToStaticMarkup(<ContentRenderer contents={contents} />)).toMatch(/<h4[^>]*>Sub-tasks<\/h4>/);
  });

  it("takes the level it is given, such as h3 under the run page's h2 task title", () => {
    const markup = renderToStaticMarkup(<ContentRenderer contents={contents} subtaskHeadingAs="h3" />);

    expect(markup).toMatch(/<h3[^>]*>Sub-tasks<\/h3>/);
    expect(markup).not.toContain('<h4');
  });
});
