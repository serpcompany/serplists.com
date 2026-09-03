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
      url: 'https://clipy.online/embed/tizg5pl1gkul?ref=serplists.com',
      outboundUrl: 'https://clipy.online/video/tizg5pl1gkul?ref=serplists.com',
    });
  });

  it('extracts a safe iframe src when embed code is pasted into a video block', () => {
    expect(
      getVideoEmbedSource(
        '<iframe src="https://clipy.online/embed/tizg5pl1gkul?autoplay=1" allowfullscreen></iframe>',
      ),
    ).toEqual({
      kind: 'iframe',
      url: 'https://clipy.online/embed/tizg5pl1gkul?autoplay=1&ref=serplists.com',
      outboundUrl: 'https://clipy.online/video/tizg5pl1gkul?ref=serplists.com',
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
  it('adds or replaces the Serplists referral without dropping other query values', () => {
    expect(withSerpListsClipyRef('https://www.clipy.online/video/demo?autoplay=1')).toBe(
      'https://clipy.online/video/demo?autoplay=1&ref=serplists.com',
    );
    expect(withSerpListsClipyRef('https://clipy.online/video/demo?ref=old')).toBe(
      'https://clipy.online/video/demo?ref=serplists.com',
    );
  });

  it('marks Clipy anchors as new-tab nofollow links', () => {
    expect(getOutboundLinkProps('https://clipy.online/video/demo')).toEqual({
      href: 'https://clipy.online/video/demo?ref=serplists.com',
      target: '_blank',
      rel: 'nofollow noopener noreferrer',
    });
  });
});
