import { copyTextToClipboard } from '@/lib/clipboard';

export type ShareLinkResult =
  | { kind: 'ok'; copied: boolean; shareUrl: string }
  | { kind: 'error'; message: string }
  | { kind: 'skipped' };

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
