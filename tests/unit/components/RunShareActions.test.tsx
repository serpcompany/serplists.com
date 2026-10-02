import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RunShareActions } from '@/components/run-execution/RunShareActions';

const render = (isPublic: boolean) =>
  renderToStaticMarkup(
    <RunShareActions
      isCreatingShare={false}
      isPublic={isPublic}
      onShare={vi.fn()}
      onStopSharing={vi.fn().mockResolvedValue({ kind: 'ok' })}
    />,
  );

describe('RunShareActions', () => {
  it('offers Stop sharing and shows the shared state on a shared run', () => {
    const html = render(true);

    expect(html).toContain('>Shared<');
    expect(html).toContain('Share</button>');
    expect(html).toContain('Stop sharing');
  });

  it('offers only Share on a private run', () => {
    const html = render(false);

    expect(html).toContain('Share</button>');
    expect(html).not.toContain('Stop sharing');
    expect(html).not.toContain('>Shared<');
  });
});
