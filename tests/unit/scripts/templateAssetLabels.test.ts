import { describe, expect, it } from 'vitest';
import { inferEmbedProvider } from '@/../scripts/lib/templateAssetLabels';

describe('inferEmbedProvider', () => {
  it.each([
    ['https://youtube.com/watch?v=abc', 'YouTube'],
    ['https://www.youtube.com/embed/abc', 'YouTube'],
    ['https://youtu.be/abc', 'YouTube'],
    ['HTTPS://WWW.YOUTUBE.COM/embed/abc', 'YouTube'],
    ['https://vimeo.com/123', 'Vimeo'],
    ['https://player.vimeo.com/video/123', 'Vimeo'],
    ['https://www.loom.com/share/abc', 'Loom'],
    ['https://www.figma.com/file/abc', 'Figma'],
    ['https://embed.figma.com/design/abc', 'Figma'],
    ['https://maps.google.com/?q=Paris', 'Google Maps'],
    ['https://maps.google.de/?q=Berlin', 'Google Maps'],
    ['https://maps.google.co.uk/?q=London', 'Google Maps'],
    ['https://maps.google.com.au/?q=Sydney', 'Google Maps'],
  ])('names the provider of %s by its hostname', (embed, provider) => {
    expect(inferEmbedProvider(embed)).toBe(provider);
  });

  it.each([
    [`<iframe src='https://www.youtube.com/embed/abc'></iframe>`, 'YouTube'],
    ['<iframe width="640" src="https://player.vimeo.com/video/123"></iframe>', 'Vimeo'],
    ['<iframe src="//www.loom.com/embed/abc"></iframe>', 'Loom'],
  ])('names the provider of an iframe embed by the hostname of its src: %s', (embed, provider) => {
    expect(inferEmbedProvider(embed)).toBe(provider);
  });

  it.each([
    'https://youtube.com.evil.example/watch?v=abc',
    'https://notyoutube.com/watch?v=abc',
    'https://youtu.be.evil.example/abc',
    'https://evil.example/?next=https://www.youtube.com/embed/abc',
    'https://evil.example/youtube.com',
    'https://youtube.com@evil.example/',
    'https://vimeo.com.evil.example/123',
    'https://notvimeo.com/123',
    'https://loom.com.evil.example/share/abc',
    'https://myloom.com/share/abc',
    'https://figma.com.evil.example/file/abc',
    'https://notfigma.com/file/abc',
    'https://maps.google.evil.example/?q=Paris',
    'https://maps.google.com.evil.example/?q=Paris',
    'https://evil.example/maps.google.com',
    '<iframe src="https://evil.example/embed?from=youtube.com"></iframe>',
  ])('calls a look-alike host embedded content, not a known provider: %s', (embed) => {
    expect(inferEmbedProvider(embed)).toBe('Embedded Content');
  });

  it.each([
    '',
    'youtube.com/watch?v=abc',
    'Watch it on youtube.com',
    'javascript:alert("youtube.com")',
    '<script src="https://www.youtube.com/iframe_api"></script>',
    'https://',
  ])('calls an embed with no http link it can parse embedded content: %j', (embed) => {
    expect(inferEmbedProvider(embed)).toBe('Embedded Content');
  });
});
