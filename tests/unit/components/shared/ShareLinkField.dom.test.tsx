import '../../../support/mockedToasts';
import '../../../support/cleanupAfterEachTest';
import '../../../support/mockedClipboard';
import { act } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';

import { ShareLinkDialog, ShareLinkField } from '@/components/shared/ShareLinkDialog';
import { copyTextToClipboard } from '@/lib/clipboard';

import { inputNamed, renderSettled } from '../../../support/renderInTheDom';

const link = 'https://serplists.com/share/token-1';

const renderTheField = () => renderSettled(<ShareLinkField copiedMessage="Share link copied" url={link} />);

const copy = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
  });

describe('the share link field', () => {
  it('copies the link and says so', async () => {
    vi.mocked(copyTextToClipboard).mockResolvedValue(true);
    await renderTheField();

    await copy();

    expect(copyTextToClipboard).toHaveBeenCalledWith(link);
    expect(toast.success).toHaveBeenCalledWith('Share link copied');
  });

  it('asks for a manual copy when the clipboard refuses', async () => {
    vi.mocked(copyTextToClipboard).mockResolvedValue(false);
    await renderTheField();

    await copy();

    expect(toast.error).toHaveBeenCalledWith("Couldn't copy the link. Select it and copy it manually.");
  });

  it('selects the whole link when the field is focused, ready to copy by hand', async () => {
    await renderTheField();
    const field = inputNamed('Share link');

    await act(async () => {
      fireEvent.focus(field);
    });

    expect([field.selectionStart, field.selectionEnd]).toEqual([0, link.length]);
  });
});

describe('the share link dialog', () => {
  it('closes from the Close button under the link', async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    await renderSettled(
      <ShareLinkDialog
        copiedMessage="Share link copied"
        description="Anyone with this link can work through the run."
        onOpenChange={onOpenChange}
        open
        title="Share run"
        url={link}
      />,
    );

    const footer = screen.getByRole('dialog', { name: 'Share run' }).querySelector('[data-slot="dialog-footer"]');
    if (!(footer instanceof HTMLElement)) throw new Error('No dialog footer');
    await act(async () => {
      fireEvent.click(within(footer).getByRole('button', { name: 'Close' }));
    });

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });
});

