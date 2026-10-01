import { expect } from 'vitest';

export function expectThePortableSeoFieldsAndOneRule(template: {
  seoTitle?: string;
  seoDescription?: string;
  rules?: unknown[];
}) {
  expect(template.seoTitle).toBe('Portable SEO Title');
  expect(template.seoDescription).toBe('Portable SEO Description');
  expect(template.rules).toHaveLength(1);
}
