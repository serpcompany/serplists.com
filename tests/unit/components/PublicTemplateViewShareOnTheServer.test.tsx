import { navigation } from '../../support/mockedNextNavigation';
import '../../support/mockedClipboard';
import { clickTheLastButtonReading } from '../../support/recordedButtons';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { PublicTemplateView } from '@/components/template/PublicTemplateView';
import { copyTextToClipboard } from '@/lib/clipboard';

import { publicTemplateViewProps } from '../../fixtures/publicTemplateView';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe('Share on a public Template page rendered where there is no window, as on the server', () => {
  it('copies no link and says nothing, since there is no address bar to copy from', async () => {
    navigation.reset('/profile/serp/complete-wedding-planning-checklist/');
    renderToStaticMarkup(<PublicTemplateView {...publicTemplateViewProps()} />);

    await clickTheLastButtonReading('Share');

    expect(typeof window).toBe('undefined');
    expect(copyTextToClipboard).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
