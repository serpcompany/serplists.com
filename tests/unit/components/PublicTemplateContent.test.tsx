import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PublicTemplateContent } from '@/components/template/PublicTemplateContent';

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
