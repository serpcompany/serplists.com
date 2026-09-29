import { describe, expect, it } from 'vitest';

import {
  iconBadgeVariants,
  pageContainerVariants,
  pageHeroVariants,
  pageSectionVariants,
  surfaceVariants,
} from '@/components/layout/page-shell.styles';

describe('page-shell variants', () => {
  it('returns centralized width tokens for page containers', () => {
    expect(pageContainerVariants({ width: 'shell' })).toContain(
      'max-w-6xl',
    );
    expect(pageContainerVariants({ width: 'content' })).toContain(
      'max-w-6xl',
    );
    expect(pageContainerVariants({ width: 'narrow' })).toContain(
      'max-w-4xl',
    );
  });

  it('returns flatter shell treatments for docs and glass panels', () => {
    expect(surfaceVariants({ tone: 'docs', padding: 'lg' })).toContain(
      'shadow-none',
    );
    expect(surfaceVariants({ tone: 'docs', padding: 'lg' })).toContain('p-8');
    expect(surfaceVariants({ tone: 'glass' })).toContain('shadow-none');
    expect(surfaceVariants({ tone: 'metric' })).toContain('shadow-none');
  });

  it('returns shared compact spacing, alignment, and icon sizing variants', () => {
    expect(pageSectionVariants({ spacing: 'hero' })).toContain('pb-8');
    expect(pageSectionVariants({ spacing: 'hero' })).toContain('pt-10');
    expect(pageHeroVariants({ align: 'center' })).toContain('text-center');
    expect(iconBadgeVariants({ size: 'lg' })).toContain('h-14');
    expect(iconBadgeVariants({ size: 'lg' })).toContain('w-14');
  });
});
