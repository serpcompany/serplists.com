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

    expect(html).toContain('src="https://clipy.online/embed/8fptqlnappr6?ref=serplists.com"');
    expect(html).toContain('href="https://clipy.online/video/8fptqlnappr6?ref=serplists.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
  });

  it('renders persisted Clipy summary, transcript, video, image, and exact source attribution', () => {
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
            contents: [
              {
                id: 'text',
                type: 'text',
                value: '### Recording summary\nPersisted summary.\n\n### Transcript\nPersisted transcript.',
              },
              {
                id: 'video',
                type: 'video',
                uploadType: 'url',
                value: 'https://clipy.online/video/8fptqlnappr6',
              },
              {
                id: 'image',
                type: 'image',
                uploadType: 'url',
                value: 'https://cdn.clipy.online/key-moments/demo/issues.jpg',
              },
            ],
          }],
        }]}
      />,
    );

    expect(html).toContain('Recording summary');
    expect(html).toContain('Persisted summary.');
    expect(html).toContain('Transcript');
    expect(html).toContain('Persisted transcript.');
    expect(html).toContain('src="https://clipy.online/embed/8fptqlnappr6?ref=serplists.com"');
    expect(html).toContain('src="https://cdn.clipy.online/key-moments/demo/issues.jpg"');
    expect(html).toContain('href="https://clipy.online/video/8fptqlnappr6?ref=serplists.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
  });
});
