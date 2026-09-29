import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EmbedContentEditor } from '@/components/template-editor/content-types/EmbedContentEditor';
import { EmbedField } from '@/components/ui/embed-field';

// React remounts a control whose element type changes, which drops focus and the
// caret mid-typing. The embed field must therefore render the same element for every
// value: typing past "https://" or deleting below it only changes its props.
const VALUES = [
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
  it.each(VALUES)('renders one textarea and no input for %j', (value) => {
    const markup = renderField(value);

    expect(countMatches(markup, /<textarea\b/g)).toBe(1);
    expect(countMatches(markup, /<input\b/g)).toBe(0);
  });

  it('renders the same control element across the URL prefix, both ways', () => {
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
    // HTML attribute names are case-insensitive, and React writes some in lower case.
    const markup = renderField('https://example.com').toLowerCase();

    expect(markup).toContain('autocapitalize="off"');
    expect(markup).toContain('autocorrect="off"');
    expect(markup).toContain('spellcheck="false"');
    expect(markup).toContain('inputmode="url"');
  });
});

describe('EmbedContentEditor', () => {
  it.each(VALUES)('renders one textarea and no input for %j', (value) => {
    const markup = renderToStaticMarkup(
      <EmbedContentEditor value={value} onValueChange={() => undefined} />,
    );

    expect(countMatches(markup, /<textarea\b/g)).toBe(1);
    expect(countMatches(markup, /<input\b/g)).toBe(0);
  });
});

// Viewers get a link to a URL or to the src of iframe code, and see anything else as
// text, so the field must not promise script embeds and shows what viewers will get.
describe('EmbedField help and preview', () => {
  it('does not offer script embeds', () => {
    // The text people read: markup attributes (data-slot="field-description") are not copy.
    const text = renderField('')
      .replace(/<[^>]*\bplaceholder="([^"]*)"[^>]*>/g, ' $1 ')
      .replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/script/i);
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
