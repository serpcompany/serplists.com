import { describe, expect, it } from 'vitest';

import { generateSlug, getVideoEmbedSource } from '@/utils/urlHelpers';
import { getOutboundLinkProps, withSerpListsClipyRef } from '@/lib/utils/clipyUrl';

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
