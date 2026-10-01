import { describe, expect, it } from 'vitest';

import { formatUploadLimit, TEMPLATE_UPLOAD_MAX_BYTES, UPLOAD_MAX_BYTES } from '@/lib/schemas/uploadLimits';

const MB = 1024 * 1024;

describe('formatUploadLimit', () => {
  it('names the avatar and Template upload limits in whole megabytes', () => {
    expect(formatUploadLimit(UPLOAD_MAX_BYTES.avatars)).toBe('5MB');
    expect(formatUploadLimit(TEMPLATE_UPLOAD_MAX_BYTES)).toBe('50MB');
  });

  it('rounds a limit between two megabytes down, so no message names a size the limit refuses', () => {
    expect(formatUploadLimit(50 * MB + MB / 2)).toBe('50MB');
    expect(formatUploadLimit(50 * MB - 1)).toBe('49MB');
  });
});
