import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PublicTemplateContent } from '@/components/template/PublicTemplateContent';
import { checklistItemContentSchema } from '@/lib/schemas/checklistSchema';
import type { ChecklistItemContent } from '@/types/checklist';

describe('PublicTemplateContent', () => {
  it('renders generated Clipy key-moment images in an expanded checklist item', () => {
    const html = renderToStaticMarkup(
      <PublicTemplateContent
        initialExpandedItems={{ '0-0': true }}
        sections={[{
          id: 'steps',
          title: 'Steps',
          items: [{
            id: 'step-1',
            title: 'Open the issues tab',
            description: '',
            contents: [{
              id: 'moment-1',
              type: 'image',
              uploadType: 'url',
              value: 'https://cdn.clipy.online/key-moments/demo/issues.jpg',
            }],
          }],
        }]}
      />,
    );

    expect(html).toContain('src="https://cdn.clipy.online/key-moments/demo/issues.jpg"');
    expect(html).toContain('alt="Open the issues tab"');
    expect(html).not.toContain('Image content attached');
  });

  it('renders the Clipy player and an attributed source link without changing other links', () => {
    const html = renderToStaticMarkup(
      <PublicTemplateContent
        initialExpandedItems={{ '0-0': true }}
        sections={[{
          id: 'source',
          title: 'Source',
          items: [{
            id: 'recording',
            title: 'Watch the source recording',
            description: '',
            contents: [{
              id: 'video',
              type: 'video',
              uploadType: 'url',
              value: 'https://clipy.online/video/8fptqlnappr6',
            }],
          }],
        }]}
      />,
    );

    expect(html).toContain('src="https://clipy.online/embed/8fptqlnappr6?ref=m4d8e9p&amp;utm_source=serplists.com"');
    expect(html).toContain('href="https://clipy.online/video/8fptqlnappr6?ref=m4d8e9p&amp;utm_source=serplists.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
  });
});

const renderExpandedItem = (content: ChecklistItemContent) =>
  renderToStaticMarkup(
    <PublicTemplateContent
      initialExpandedItems={{ '0-0': true }}
      sections={[{
        id: 'section',
        title: 'Section',
        items: [{
          id: 'item',
          title: 'Read the runbook',
          description: '',
          contents: [content],
        }],
      }]}
    />,
  );

describe('PublicTemplateContent file blocks', () => {
  it('shows the file name and a download link for an uploaded file', () => {
    const html = renderExpandedItem({
      id: 'file-1',
      type: 'file',
      uploadType: 'upload',
      value: '/api/uploads/file?key=a.pdf',
      fileName: 'a.pdf',
    });

    expect(html).toContain('a.pdf');
    expect(html).toContain('href="/api/uploads/file?key=a.pdf"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Download a.pdf"');
    expect(html).toContain('Download File');
  });

  it('labels a URL file without a name as File', () => {
    const html = renderExpandedItem({
      id: 'file-2',
      type: 'file',
      uploadType: 'url',
      value: 'https://files.example.com/runbook.pdf',
    });

    expect(html).toContain('href="https://files.example.com/runbook.pdf"');
    expect(html).toContain('aria-label="Download file"');
    expect(html).toContain('>File<');
  });

  it('shows no link for a File block that has no file yet', () => {
    const html = renderExpandedItem({
      id: 'file-3',
      type: 'file',
      uploadType: 'upload',
      value: '   ',
    });

    expect(html).not.toContain('<a');
    expect(html).not.toContain('Download');
  });

  it('never links an unsafe file URL', () => {
    const html = renderExpandedItem({
      id: 'file-4',
      type: 'file',
      uploadType: 'url',
      value: 'javascript:alert(1)',
      fileName: 'evil.pdf',
    });

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a');
    expect(html).toContain('evil.pdf');
    expect(html).toContain('Invalid link');
  });

  it('renders every content type the editor can save', () => {
    const samples: Record<ChecklistItemContent['type'], ChecklistItemContent> = {
      text: { id: 'c', type: 'text', value: 'Some **markdown**' },
      image: { id: 'c', type: 'image', uploadType: 'url', value: 'https://cdn.example.com/a.png' },
      video: { id: 'c', type: 'video', uploadType: 'url', value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      file: { id: 'c', type: 'file', uploadType: 'upload', value: 'https://cdn.example.com/a.pdf', fileName: 'a.pdf' },
      embed: { id: 'c', type: 'embed', value: 'https://example.com/embed' },
      subItems: { id: 'c', type: 'subItems', value: '', subItems: [{ id: 's', title: 'Sub-step one' }] },
    };

    for (const type of checklistItemContentSchema.shape.type.options) {
      const html = renderExpandedItem(samples[type]);
      expect(html, `content type ${type}`).not.toContain('<div class="space-y-2"><div></div>');
    }
  });
});

describe('PublicTemplateContent embed blocks', () => {
  const renderEmbed = (value: string) =>
    renderToStaticMarkup(
      <PublicTemplateContent
        initialExpandedItems={{ '0-0': true }}
        sections={[{
          id: 'steps',
          title: 'Steps',
          items: [{
            id: 'step-1',
            title: 'Watch the walkthrough',
            description: '',
            contents: [{ id: 'embed-1', type: 'embed', value }],
          }],
        }]}
      />,
    );
  const hrefs = (html: string) => Array.from(html.matchAll(/href="([^"]*)"/g), (match) => match[1]);

  it('links the src of pasted iframe code, not the markup', () => {
    const html = renderEmbed(`<iframe src='https://www.youtube.com/embed/abc'></iframe>`);

    expect(hrefs(html)).toEqual(['https://www.youtube.com/embed/abc']);
    expect(html).toContain('>https://www.youtube.com/embed/abc</a>');
    expect(html).not.toContain('<iframe');
  });

  it.each([
    '<script src="https://example.com/widget.js"></script>',
    'See the staging dashboard',
  ])('shows %j as text with no link', (value) => {
    const html = renderEmbed(value);

    expect(hrefs(html)).toEqual([]);
    expect(html).not.toContain('Invalid link');
    expect(html).not.toContain('<script');
    expect(html).toContain(value.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
  });
});

describe('PublicTemplateContent task toggles', () => {
  it('gives a screen reader one toggle per task, the title with its expanded state, and keeps the chevron a pointer copy out of the tab order', () => {
    const html = renderToStaticMarkup(
      <PublicTemplateContent
        sections={[{
          id: 'steps',
          title: 'Steps',
          items: [{ id: 'step-1', title: 'Open the issues tab', description: 'Then filter by label.' }],
        }]}
      />,
    );
    const toggles = [...html.matchAll(/<button[^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => !tag.includes('role="checkbox"'));
    const chevron = toggles.find((tag) => tag.includes('aria-hidden="true"'));

    expect(toggles).toHaveLength(2);
    expect(toggles.filter((tag) => tag !== chevron)).toEqual([expect.stringContaining('aria-expanded="false"')]);
    expect(chevron).toContain('tabindex="-1"');
  });
});
