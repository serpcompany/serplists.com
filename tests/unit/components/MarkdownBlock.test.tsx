import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { MarkdownBlock } from '@/components/shared/MarkdownBlock';
import { PublicTemplateContent } from '@/components/template/PublicTemplateContent';

const render = (value: string) => renderToStaticMarkup(<MarkdownBlock value={value} />);

describe('MarkdownBlock', () => {
  it('wraps markdown in the prose typography classes and keeps authored line breaks', () => {
    const markup = render('Line one\nLine two\nLine three');

    expect(markup).toMatch(/^<div class="[^"]*\bprose prose-sm max-w-none\b[^"]*\bwhitespace-pre-line\b/);
    expect(markup).toContain('<p>Line one\nLine two\nLine three</p>');
  });

  it('drops the newline text between blocks, which pre-line would show as blank lines', () => {
    expect(render('- a\n- b\n\n1. one\n2. two')).toContain(
      '<ul><li>a</li><li>b</li></ul><ol><li>one</li><li>two</li></ol>',
    );
    expect(render('First\n\nSecond')).toContain('<p>First</p><p>Second</p>');
    expect(render('- a\n\n- loose b\n\n  more')).toContain(
      '<ul><li><p>a</p></li><li><p>loose b</p><p>more</p></li></ul>',
    );
    expect(render('- a\n  - nested\n- b')).toContain('<ul><li>a<ul><li>nested</li></ul></li><li>b</li></ul>');
    expect(render('# Title\n\n> quote\n> more')).toContain('<h1>Title</h1><blockquote><p>quote\nmore</p></blockquote>');
  });

  it('keeps soft breaks between inline elements and code block whitespace', () => {
    expect(render('Text **bold**\n*em*')).toContain('<p>Text <strong>bold</strong>\n<em>em</em></p>');
    expect(render('```\ncode\n  block\n```')).toContain('<pre><code>code\n  block\n</code></pre>');
  });

  it('renders a hard break as one line break, not two', () => {
    expect(render('hard  \nbreak')).toContain('<p>hard<br/>break</p>');
  });

  it('still skips raw HTML and unsafe links', () => {
    const markup = render('<script>alert(1)</script>\n\n[x](javascript:alert(1)) [docs](https://example.com)');

    expect(markup).not.toContain('<script');
    expect(markup).not.toContain('javascript:');
    expect(markup).toContain('href="https://example.com"');
  });
});

describe('markdown call sites', () => {
  it('render run task text through MarkdownBlock', () => {
    const markup = renderToStaticMarkup(
      <ContentRenderer contents={[{ id: 't', type: 'text', value: '- one\n- two' }]} />,
    );

    expect(markup).toContain('prose prose-sm');
    expect(markup).toContain('<ul><li>one</li><li>two</li></ul>');
  });

  it('render public template text through MarkdownBlock', () => {
    const markup = renderToStaticMarkup(
      <PublicTemplateContent
        initialExpandedItems={{ '0-0': true }}
        sections={[
          {
            id: 'section-1',
            title: 'Section',
            items: [
              {
                id: 'item-1',
                title: 'Item',
                contents: [{ id: 't', type: 'text', value: '1. first\n2. second' }],
              },
            ],
          },
        ]}
      />,
    );

    expect(markup).toContain('prose prose-sm');
    expect(markup).toContain('<ol><li>first</li><li>second</li></ol>');
  });

});
