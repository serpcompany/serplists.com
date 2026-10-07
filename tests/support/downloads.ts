import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

import { openTheMenu } from './renderInTheDom';

type RecordedDownload = { fileName: string; type: string; text: () => Promise<string>; bytes: () => Promise<Uint8Array> };

function recordDownloads(): { downloads: RecordedDownload[]; restore: () => void } {
  const blobs = new Map<string, Blob>();
  const downloads: RecordedDownload[] = [];
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
    const url = `blob:download-${blobs.size + 1}`;
    if (object instanceof Blob) blobs.set(url, object);
    return url;
  });
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function recordDownload(this: HTMLAnchorElement) {
    const blob = blobs.get(this.getAttribute('href') ?? '');
    if (!blob) throw new Error(`The link ${this.href} opens no file this test made`);
    downloads.push({
      fileName: this.download,
      type: blob.type,
      text: () => blob.text(),
      bytes: async () => new Uint8Array(await blob.arrayBuffer()),
    });
  });
  return {
    downloads,
    restore: () => {
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
      click.mockRestore();
    },
  };
}

export async function downloadFromTheMenu(trigger: string, item: string): Promise<RecordedDownload> {
  const menuItem = (await openTheMenu(trigger)).find((candidate) => candidate.textContent.trim() === item);
  if (!menuItem) throw new Error(`${trigger} has no item named ${item}`);
  const recorded = recordDownloads();
  try {
    await act(async () => {
      fireEvent.click(menuItem);
    });
  } finally {
    recorded.restore();
  }
  const [download, ...more] = recorded.downloads;
  if (!download || more.length > 0) throw new Error(`${item} downloaded ${recorded.downloads.length} files, not one`);
  return download;
}
