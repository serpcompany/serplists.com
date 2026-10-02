import { describe, expect, it } from 'vitest';

import { buttonVariants } from '@/components/ui/button';

describe('buttonVariants', () => {
  it("gives a link styled as an outline button the outline's border, since unmerged the base's border-transparent would win", () => {
    const classes = buttonVariants({ variant: 'outline' }).split(' ');

    expect(classes).toContain('border-border');
    expect(classes).not.toContain('border-transparent');
  });

  it('keeps the transparent border on variants that set none', () => {
    expect(buttonVariants({ variant: 'ghost' }).split(' ')).toContain('border-transparent');
  });
});
