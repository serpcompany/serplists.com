import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WorkspaceErrorNotice } from '@/components/workspace/WorkspaceErrorNotice';

describe('the notice that the Organizations failed to load', () => {
  it('offers only Retry when the page gives no way to continue in Personal', () => {
    const html = renderToStaticMarkup(
      <WorkspaceErrorNotice id="workspace-error" message="The server did not answer." onRetry={() => undefined} />,
    );

    expect(html).toContain('The server did not answer.');
    expect(html).toContain('Retry</button>');
    expect(html).not.toContain('Continue in Personal');
  });
});
