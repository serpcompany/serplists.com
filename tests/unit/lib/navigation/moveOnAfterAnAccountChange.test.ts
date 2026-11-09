import { describe, expect, it } from 'vitest';

import { moveOnAfterAnAccountChange } from '@/lib/navigation/moveOnAfterAnAccountChange';

describe('moving on after an account change', () => {
  it('moves before it returns, with no check on whether the visit is still current', () => {
    const order: string[] = [];

    moveOnAfterAnAccountChange(() => order.push('moved to the next page'));
    order.push('returned');

    expect(order).toEqual(['moved to the next page', 'returned']);
  });
});
