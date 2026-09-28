import { copyTextToClipboard } from '@/lib/clipboard';

export type ShareLinkResult =
  | { kind: 'ok'; copied: boolean; shareUrl: string }
  | { kind: 'error'; message: string }
  | { kind: 'skipped' };

// Creating a share link and copying it are separate steps. Once the API has created the
// link (and made the run public with a new token), a failed copy must not lose it:
// Safari rejects a clipboard write that follows a network request, and any browser can
// reject on denied permission or lost focus. Callers always show the returned link, and
// report an error only when creating it failed. A null link means nothing was created.
export async function createShareLinkAndCopy(
  createShareUrl: () => Promise<string | null>,
  copy: (text: string) => Promise<boolean> = copyTextToClipboard,
): Promise<ShareLinkResult> {
  let shareUrl: string | null;
  try {
    shareUrl = await createShareUrl();
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error && error.message ? error.message : 'Failed to create share link',
    };
  }
  if (!shareUrl) {
    return { kind: 'skipped' };
  }

  let copied = false;
  try {
    copied = await copy(shareUrl);
  } catch {
    copied = false;
  }
  return { kind: 'ok', copied, shareUrl };
}
