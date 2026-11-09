import { describe, expect, it } from 'vitest';

import { EMBED_FRAME_ORIGINS, isEmbedFrameOrigin } from '@/lib/utils/embedOrigins';

describe('the origins a video may be framed from', () => {
  it('frames only YouTube and Clipy pages', () => {
    for (const origin of EMBED_FRAME_ORIGINS) {
      expect(isEmbedFrameOrigin(`${origin}/embed/demo`)).toBe(true);
    }
    expect(isEmbedFrameOrigin('https://example.com/embed/demo')).toBe(false);
    expect(isEmbedFrameOrigin('http://www.youtube.com/embed/demo')).toBe(false);
  });

  it('frames nothing for text that is not an address', () => {
    expect(isEmbedFrameOrigin('www.youtube.com/embed/demo')).toBe(false);
    expect(isEmbedFrameOrigin('')).toBe(false);
  });
});
