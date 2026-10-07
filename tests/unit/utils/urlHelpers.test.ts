import { assert, describe, expect, it } from 'vitest';

import { generateSlug, getVideoEmbedSource, getYoutubeVideoId } from '@/utils/urlHelpers';
import { getOutboundLinkProps, withSerpListsClipyRef } from '@/lib/utils/clipyUrl';
import { EMBED_FRAME_ORIGINS } from '@/lib/utils/embedOrigins';

import { YOUTUBE_VIDEO_ID, YOUTUBE_VIDEO_LINKS } from '../../fixtures/videoLinks';

describe('urlHelpers', () => {
  describe('generateSlug', () => {
    it('should generate SEO-friendly slugs from titles', () => {
      expect(generateSlug('Wedding Planning Checklist')).toBe('wedding-planning-checklist');
      expect(generateSlug('Home & Garden Tasks')).toBe('home-garden-tasks');
      expect(generateSlug('2024 Tax Preparation!')).toBe('2024-tax-preparation');
    });

    it('should handle special characters correctly', () => {
      const testCases = [
        { input: 'Tips & Tricks', expectedStart: 'tips-tricks' },
        { input: 'Q&A Checklist', expectedStart: 'qa-checklist' },
        { input: '10% Better', expectedStart: '10-better' },
        { input: 'Before/After', expectedStart: 'beforeafter' },
      ];

      testCases.forEach(({ input, expectedStart }) => {
        expect(generateSlug(input)).toBe(expectedStart);
      });
    });

    it('should remove multiple hyphens and trim', () => {
      expect(generateSlug('  Too   Many   Spaces  ')).toBe('too-many-spaces');
      expect(generateSlug('---Multiple-Hyphens---')).toBe('multiple-hyphens');
    });

    it('should generate consistent slugs for the same title', () => {
      const slug1 = generateSlug('Same Title');
      const slug2 = generateSlug('Same Title');
      expect(slug1).toBe('same-title');
      expect(slug2).toBe('same-title');
      expect(slug1).toBe(slug2);
    });
  });
});

describe('getVideoEmbedSource', () => {
  it('turns a Clipy watch URL into its iframe player URL', () => {
    expect(getVideoEmbedSource('https://clipy.online/video/tizg5pl1gkul')).toEqual({
      kind: 'iframe',
      url: 'https://clipy.online/embed/tizg5pl1gkul?ref=m4d8e9p&utm_source=serplists.com',
      outboundUrl: 'https://clipy.online/video/tizg5pl1gkul?ref=m4d8e9p&utm_source=serplists.com',
    });
  });

  it('extracts a safe iframe src when embed code is pasted into a video block', () => {
    expect(
      getVideoEmbedSource(
        '<iframe src="https://clipy.online/embed/tizg5pl1gkul?autoplay=1" allowfullscreen></iframe>',
      ),
    ).toEqual({
      kind: 'iframe',
      url: 'https://clipy.online/embed/tizg5pl1gkul?autoplay=1&ref=m4d8e9p&utm_source=serplists.com',
      outboundUrl: 'https://clipy.online/video/tizg5pl1gkul?ref=m4d8e9p&utm_source=serplists.com',
    });
  });

  it('keeps direct video files in the native player path', () => {
    expect(getVideoEmbedSource('https://cdn.example.com/walkthrough.mp4')).toEqual({
      kind: 'video',
      url: 'https://cdn.example.com/walkthrough.mp4',
    });
  });

  it.each([
    ['https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'https://www.youtube.com/embed/aqz-KE-bpKQ'],
    ['https://youtube.com/watch?feature=share&v=aqz-KE-bpKQ', 'https://www.youtube.com/embed/aqz-KE-bpKQ'],
    ['https://youtu.be/aqz-KE-bpKQ', 'https://www.youtube.com/embed/aqz-KE-bpKQ'],
    ['https://youtu.be/aqz-KE-bpKQ?t=90', 'https://www.youtube.com/embed/aqz-KE-bpKQ?start=90'],
    ['https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s', 'https://www.youtube.com/embed/aqz-KE-bpKQ?start=90'],
    ['https://m.youtube.com/watch?v=aqz-KE-bpKQ', 'https://www.youtube.com/embed/aqz-KE-bpKQ'],
    ['https://music.youtube.com/watch?v=aqz-KE-bpKQ', 'https://www.youtube.com/embed/aqz-KE-bpKQ'],
    ['https://www.youtube.com/shorts/aqz-KE-bpKQ', 'https://www.youtube.com/embed/aqz-KE-bpKQ'],
    ['https://www.youtube.com/live/aqz-KE-bpKQ?si=abc', 'https://www.youtube.com/embed/aqz-KE-bpKQ'],
    ['<iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ?start=5"></iframe>', 'https://www.youtube.com/embed/aqz-KE-bpKQ?start=5'],
    ['<iframe src="http://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"></iframe>', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ'],
    ['<iframe src="https://www.youtube.com/embed/videoseries?list=PL123"></iframe>', 'https://www.youtube.com/embed/videoseries?list=PL123'],
    ['<iframe src="http://www.youtube.com/embed/videoseries?list=PL123"></iframe>', 'https://www.youtube.com/embed/videoseries?list=PL123'],
  ])('embeds the YouTube player for %s', (input, url) => {
    expect(getVideoEmbedSource(input)).toEqual({ kind: 'iframe', url });
  });

  it.each([
    ['<iframe src="https://player.vimeo.com/video/76979871"></iframe>', 'https://player.vimeo.com/video/76979871'],
    ['<iframe src="https://www.youtube.com.evil.test/embed/aqz-KE-bpKQ"></iframe>', 'https://www.youtube.com.evil.test/embed/aqz-KE-bpKQ'],
    ['https://www.youtube.com/@serplists', 'https://www.youtube.com/@serplists'],
    ['https://www.youtube.com/watch?v=short', 'https://www.youtube.com/watch?v=short'],
    ['https://clipy.online/pricing', 'https://clipy.online/pricing'],
  ])('links out instead of framing a source the policy blocks: %s', (input, url) => {
    expect(getVideoEmbedSource(input)).toEqual({ kind: 'link', url });
  });

  it('rejects non-web protocols', () => {
    expect(getVideoEmbedSource('javascript:alert(1)')).toBeNull();
    expect(getVideoEmbedSource('<iframe src="data:text/html,hi"></iframe>')).toBeNull();
  });

  it('only returns iframe sources on an allowlisted embed origin', () => {
    const inputs = [
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      '<iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"></iframe>',
      '<iframe src="https://player.vimeo.com/video/76979871"></iframe>',
      '<iframe src="https://www.loom.com/embed/abc"></iframe>',
      '<iframe src="http://clipy.online/embed/tizg5pl1gkul"></iframe>',
      'https://clipy.online/video/tizg5pl1gkul',
    ];
    for (const input of inputs) {
      const source = getVideoEmbedSource(input);
      if (source?.kind === 'iframe') {
        expect(EMBED_FRAME_ORIGINS).toContain(new URL(source.url).origin);
      }
    }
  });
});

describe('getVideoEmbedSource for YouTube links', () => {
  it.each(YOUTUBE_VIDEO_LINKS)("embeds %s in the video's player, whichever origin and start time the link keeps", (link) => {
    const source = getVideoEmbedSource(link);
    expect(source?.kind).toBe('iframe');
    assert.exists(source);
    const player = new URL(source.url);
    expect(['https://www.youtube.com', 'https://www.youtube-nocookie.com']).toContain(player.origin);
    expect(player.pathname).toBe(`/embed/${YOUTUBE_VIDEO_ID}`);
  });

  it.each([
    'https://www.youtube.com/@channel',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/shorts/',
    'https://www.youtube.com/live/',
    'https://www.youtube.com/playlist?list=PL1234567890',
    'https://www.youtube.com/embed/videoseries?list=PL1234567890',
    'https://www.youtube.com/redirect?q=https://youtu.be/dQw4w9WgXcQ',
    'https://youtu.be/',
  ])('links to %s as a page that has no video instead of a broken native player', (link) => {
    expect(getVideoEmbedSource(link)).toEqual({ kind: 'link', url: link });
  });

  it.each([
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://evil-youtube.com/embed/dQw4w9WgXcQ',
  ])('does not treat the look-alike host %s as YouTube', (link) => {
    expect(getVideoEmbedSource(link)).toEqual({ kind: 'video', url: link });
  });

  it('never sends a YouTube page to the native video player', () => {
    for (const link of [...YOUTUBE_VIDEO_LINKS, 'https://m.youtube.com/@channel', 'https://music.youtube.com/']) {
      expect(getVideoEmbedSource(link)?.kind).not.toBe('video');
    }
  });

  it('reads the id from a URL object or string', () => {
    expect(getYoutubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(getYoutubeVideoId(new URL('https://www.youtube.com/shorts/dQw4w9WgXcQ'))).toBe('dQw4w9WgXcQ');
    expect(getYoutubeVideoId('not a url')).toBeNull();
    expect(getYoutubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});

describe('Clipy outbound links', () => {
  it('canonicalizes Clipy referral parameters without dropping unrelated values or fragments', () => {
    const result = new URL(withSerpListsClipyRef(
      'https://www.clipy.online/video/demo?autoplay=1&ref=serplists.com&ref=old&utm_source=old&utm_source=older&utm_medium=email#step-2',
    ));

    expect(result.hostname).toBe('clipy.online');
    expect(result.searchParams.getAll('ref')).toEqual(['m4d8e9p']);
    expect(result.searchParams.getAll('utm_source')).toEqual(['serplists.com']);
    expect(result.searchParams.get('autoplay')).toBe('1');
    expect(result.searchParams.get('utm_medium')).toBe('email');
    expect(result.hash).toBe('#step-2');
  });

  it('does not change Clipy CDN or non-Clipy URLs', () => {
    expect(withSerpListsClipyRef('https://cdn.clipy.online/key-moments/demo/image.jpg')).toBe(
      'https://cdn.clipy.online/key-moments/demo/image.jpg',
    );
    expect(withSerpListsClipyRef('https://example.com/video/demo?ref=old')).toBe(
      'https://example.com/video/demo?ref=old',
    );
  });

  it('marks Clipy anchors as new-tab nofollow links', () => {
    expect(getOutboundLinkProps('https://clipy.online/video/demo')).toEqual({
      href: 'https://clipy.online/video/demo?ref=m4d8e9p&utm_source=serplists.com',
      target: '_blank',
      rel: 'nofollow noopener noreferrer',
    });
  });
});
