import { describe, expect, it } from 'vitest';

import { safeUrl } from '@/lib/utils/safeUrl';

describe('safeUrl, the address a link in a Template may open', () => {
  it.each([
    ['https://example.com/brief', 'https://example.com/brief'],
    [' mailto:ops@example.com ', 'mailto:ops@example.com'],
    ['tel:+15555550100', 'tel:+15555550100'],
    ['docs/brief.pdf', 'docs/brief.pdf'],
  ])('keeps %j', (url, kept) => {
    expect(safeUrl(url)).toBe(kept);
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', '   ', 'http://[serplists/brief'])('gives no address for %j', (url) => {
    expect(safeUrl(url)).toBe('');
  });
});
