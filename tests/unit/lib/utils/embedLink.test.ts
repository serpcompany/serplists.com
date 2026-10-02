import { describe, expect, it } from 'vitest';

import { absoluteHttpUrl, getEmbedLinkUrl } from '@/lib/utils/embedLink';
import { safeUrl } from '@/lib/utils/safeUrl';

describe('absoluteHttpUrl', () => {
  it.each([
    ['https://www.loom.com/share/abc', 'https://www.loom.com/share/abc'],
    ['http://example.com/embed', 'http://example.com/embed'],
    ['  https://example.com/embed \n', 'https://example.com/embed'],
    ['HTTPS://EXAMPLE.COM', 'HTTPS://EXAMPLE.COM'],
  ])('accepts %j', (value, expected) => {
    expect(absoluteHttpUrl(value)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    '/relative/path',
    '#anchor',
    '//evil.com/x',
    'www.example.com',
    'example.com/embed',
    'javascript:alert(1)',
    'data:text/html,<p>x</p>',
    'mailto:someone@example.com',
    'tel:+15555550100',
    'See the staging dashboard',
    "<iframe src='https://www.youtube.com/embed/abc'></iframe>",
    'https://example.com/embed <iframe src="x"></iframe>',
    'https://example.com/a\nmore text',
  ])('rejects %j', (value) => {
    expect(absoluteHttpUrl(value)).toBe('');
  });
});

describe('getEmbedLinkUrl', () => {
  it('links a URL', () => {
    expect(getEmbedLinkUrl(' https://www.loom.com/share/abc ')).toBe('https://www.loom.com/share/abc');
  });

  it.each([
    [`<iframe src='https://www.youtube.com/embed/abc'></iframe>`, 'https://www.youtube.com/embed/abc'],
    [`<iframe width="560" src="https://www.youtube.com/embed/abc" allowfullscreen></iframe>`, 'https://www.youtube.com/embed/abc'],
    ['<iframe src=https://player.vimeo.com/video/1 width=640></iframe>', 'https://player.vimeo.com/video/1'],
    ['<IFRAME SRC="https://example.com/e?a=1&amp;b=2"></IFRAME>', 'https://example.com/e?a=1&b=2'],
    ['<iframe src="//www.youtube.com/embed/abc"></iframe>', 'https://www.youtube.com/embed/abc'],
    ['\n  <iframe\n  src="https://example.com/e"\n></iframe>\n', 'https://example.com/e'],
  ])('links the src of iframe code %j', (value, expected) => {
    expect(getEmbedLinkUrl(value)).toBe(expected);
  });

  it.each([
    '<iframe src="javascript:alert(1)"></iframe>',
    '<iframe src="data:text/html,x"></iframe>',
    '<iframe src="/relative"></iframe>',
    `<iframe src='...' width='560' height='315'></iframe>`,
    '<iframe data-src="https://example.com/e"></iframe>',
    '<script src="https://example.com/widget.js"></script>',
    'See the staging dashboard',
    '//evil.com/x',
    '',
  ])('has no link for %j', (value) => {
    expect(getEmbedLinkUrl(value)).toBe('');
  });

  it('leaves safeUrl allowing relative paths and anchors, which markdown links and uploaded files need', () => {
    expect(safeUrl('/api/uploads/file?key=template-files/a.pdf')).toBe('/api/uploads/file?key=template-files/a.pdf');
    expect(safeUrl('#step-2')).toBe('#step-2');
  });
});
