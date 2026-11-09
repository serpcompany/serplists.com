import { describe, expect, it } from 'vitest';

import { absoluteHttpUrl, getEmbedLinkUrl } from '../../../../src/lib/utils/embedLink';
import { safeUrl } from '../../../../src/lib/utils/safeUrl';

describe('link helpers called from JavaScript with no text, which their string types rule out', () => {
  it.each([undefined, null])('gives a link with %s no address instead of throwing', (url) => {
    expect(safeUrl(url)).toBe('');
  });

  it.each([undefined, null, 42, { src: 'https://example.com/embed' }])(
    'reads no web address or embed source from %j',
    (value) => {
      expect(absoluteHttpUrl(value)).toBe('');
      expect(getEmbedLinkUrl(value)).toBe('');
    },
  );
});
