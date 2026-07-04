import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PublicTemplateContent } from '@/components/template/PublicTemplateContent';

describe('PublicTemplateContent', () => {
  it('preserves authored line breaks when displaying text blocks', () => {
    const markup = renderToStaticMarkup(
      <PublicTemplateContent
        initialExpandedItems={{ '0-0': true }}
        sections={[
          {
            id: 'section-1',
            title: 'Section one',
            items: [
              {
                id: 'item-1',
                title: 'Review the steps',
                description: 'First description line\nSecond description line',
                contents: [
                  {
                    id: 'content-1',
                    type: 'text',
                    value: 'First content line\nSecond content line\\nThird content line',
                  },
                ],
              },
            ],
          },
        ]}
      />,
    );

    expect(markup).toContain('whitespace-pre-line');
    expect(markup).toContain(
      'First description line\nSecond description line',
    );
    expect(markup).toContain(
      'First content line\nSecond content line\nThird content line',
    );
  });
});

