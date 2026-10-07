import { describe, expect, it } from 'vitest';

import {
  iconTileVariants,
  pageContainerVariants,
  pageHeroVariants,
  pageSectionVariants,
} from '@/components/layout/page-shell.styles';

describe('page-shell variants', () => {
  it('returns centralized width tokens for page containers', () => {
    expect(pageContainerVariants({ width: 'shell' })).toContain('max-w-6xl');
    expect(pageContainerVariants({ width: 'content' })).toContain('max-w-6xl');
    expect(pageContainerVariants({ width: 'narrow' })).toContain('max-w-4xl');
  });

  it('returns shared spacing, alignment, and icon tile sizes', () => {
    expect(pageSectionVariants({ spacing: 'hero' })).toContain('pb-10');
    expect(pageSectionVariants({ spacing: 'hero' })).toContain('pt-12');
    expect(pageHeroVariants({ align: 'center' })).toContain('text-center');
    expect(iconTileVariants({ size: 'lg' })).toContain('size-14');
    expect(iconTileVariants()).toContain('bg-muted');
  });
});
