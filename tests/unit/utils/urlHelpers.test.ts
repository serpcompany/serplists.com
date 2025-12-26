import { describe, it, expect } from 'vitest';
import { generateSlug } from '@/utils/urlHelpers';

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
        { input: 'Before/After', expectedStart: 'beforeafter' }
      ];

      testCases.forEach(({ input, expectedStart }) => {
        const slug = generateSlug(input);
        expect(slug).toBe(expectedStart);
      });
    });

    it('should remove multiple hyphens and trim', () => {
      expect(generateSlug('  Too   Many   Spaces  ')).toBe('too-many-spaces');
      expect(generateSlug('---Multiple-Hyphens---')).toBe('multiple-hyphens');
    });

    it('should generate consistent slugs for the same title', () => {
      const slug1 = generateSlug('Same Title');
      const slug2 = generateSlug('Same Title');
      
      // Same title should produce the same slug (ID provides uniqueness)
      expect(slug1).toBe('same-title');
      expect(slug2).toBe('same-title');
      expect(slug1).toBe(slug2);
    });
  });
});