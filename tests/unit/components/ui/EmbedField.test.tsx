import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EmbedContentEditor } from '@/components/template-editor/content-types/EmbedContentEditor';
import { EmbedField } from '@/components/ui/embed-field';

const VALUES_ACROSS_THE_URL_PREFIX = [
  '',
  'h',
  'https:/',
  'https://',
  'http://',
  'https://www.loom.com/share/abc',
  '<iframe src="x"></iframe>',
  ' https://www.loom.com/share/abc',
  'HTTPS://EXAMPLE.COM',
];

function countMatches(markup: string, pattern: RegExp): number {
  return markup.match(pattern)?.length ?? 0;
}

function renderField(value: string): string {
  return renderToStaticMarkup(<EmbedField value={value} onValueChange={() => undefined} />);
}

describe('EmbedField', () => {
  it.each(VALUES_ACROSS_THE_URL_PREFIX)('renders one textarea and no input for %j', (value) => {
    const markup = renderField(value);

    expect(countMatches(markup, /<textarea\b/g)).toBe(1);
    expect(countMatches(markup, /<input\b/g)).toBe(0);
  });

  it('renders the same control element across the URL prefix, both ways, since React remounts a control whose element type changes and drops the caret mid-typing', () => {
    const controlTag = (value: string) => renderField(value).match(/<(textarea|input)\b/)?.[1];

    expect(controlTag('https:/')).toBe('textarea');
    expect(controlTag('https://')).toBe(controlTag('https:/'));
    expect(controlTag('http://x')).toBe(controlTag('<iframe'));
  });

  it('links the label to the control', () => {
    const markup = renderField('https://example.com');
    const labelFor = markup.match(/<label[^>]*\bfor="([^"]+)"/)?.[1];
    const controlId = markup.match(/<textarea[^>]*\bid="([^"]+)"/)?.[1];

    expect(labelFor).toBeTruthy();
    expect(controlId).toBe(labelFor);
  });

  it('keeps newlines in content that starts with a URL', () => {
    const markup = renderField('https://a\n<iframe src="x"></iframe>');

    expect(markup).toContain('https://a\n&lt;iframe src=&quot;x&quot;&gt;&lt;/iframe&gt;');
  });

  it('shows the URL preview for a URL typed with leading whitespace or in capitals', () => {
    expect(renderField(' https://www.loom.com/share/abc')).toContain('Embed URL:');
    expect(renderField('HTTPS://EXAMPLE.COM')).toContain('Embed URL:');
    expect(renderField('<iframe src="x"></iframe>')).not.toContain('Embed URL:');
    expect(renderField('')).not.toContain('Embed URL:');
  });

  it('does not correct or capitalize what is typed', () => {
    const markupWithCaseInsensitiveAttributeNames = renderField('https://example.com').toLowerCase();

    expect(markupWithCaseInsensitiveAttributeNames).toContain('autocapitalize="off"');
    expect(markupWithCaseInsensitiveAttributeNames).toContain('autocorrect="off"');
    expect(markupWithCaseInsensitiveAttributeNames).toContain('spellcheck="false"');
    expect(markupWithCaseInsensitiveAttributeNames).toContain('inputmode="url"');
  });
});

describe('EmbedContentEditor', () => {
  it.each(VALUES_ACROSS_THE_URL_PREFIX)('renders one textarea and no input for %j', (value) => {
    const markup = renderToStaticMarkup(
      <EmbedContentEditor value={value} onValueChange={() => undefined} />,
    );

    expect(countMatches(markup, /<textarea\b/g)).toBe(1);
    expect(countMatches(markup, /<input\b/g)).toBe(0);
  });
});

describe('EmbedField help and preview, which show what viewers get', () => {
  it('does not offer script embeds', () => {
    const copyPeopleRead = renderField('')
      .replace(/<[^>]*\bplaceholder="([^"]*)"[^>]*>/g, ' $1 ')
      .replace(/<[^>]+>/g, ' ');
    expect(copyPeopleRead).not.toMatch(/script/i);
  });

  it('previews the link viewers get for iframe code', () => {
    const markup = renderField(`<iframe src='https://www.youtube.com/embed/abc'></iframe>`);

    expect(markup).toContain('Embed URL: https://www.youtube.com/embed/abc');
  });

  it('says when a value has no link and will be shown as text', () => {
    const markup = renderField('<script src="https://example.com/widget.js"></script>');

    expect(markup).not.toContain('Embed URL:');
    expect(markup).toContain('viewers will see it as text');
  });

  it('shows no note for an empty field', () => {
    expect(renderField('')).not.toContain('viewers will see it as text');
  });
});
