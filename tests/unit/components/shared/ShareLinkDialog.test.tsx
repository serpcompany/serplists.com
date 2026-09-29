import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ShareLinkField } from '@/components/shared/ShareLinkDialog';

describe('ShareLinkField', () => {
  it('always shows the created link, so a failed automatic copy never loses it', () => {
    const html = renderToStaticMarkup(
      <ShareLinkField copiedMessage="Share link copied" url="https://serplists.com/share/token-1" />,
    );

    expect(html).toContain('value="https://serplists.com/share/token-1"');
    expect(html).toContain('readOnly=""');
    expect(html).toContain('aria-label="Copy share link"');
  });
});
