import { source } from '@/lib/source';
import { exportEpub } from 'fumadocs-epub';

export const revalidate = false;

export async function GET(): Promise<Response> {
  const buffer = await exportEpub({
    source,
    getMarkdown(page) {
      return page.data.getText('raw');
    },
    title: 'Serplists UI Inventory',
    author: 'Serplists',
    description: 'Inventory docs for Serplists UI integration readiness',
    cover: '/og.png',
  });
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/epub+zip',
      'Content-Disposition': 'attachment; filename="serplists-ui-inventory.epub"',
    },
  });
}
