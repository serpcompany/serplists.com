import { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';

import { PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION } from '@/lib/schemas/checklistSchema';

export const portablePackFile = (templates: unknown[], fileName = 'pack.json') =>
  new File(
    [JSON.stringify({ kind: 'serplists-template-pack', schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION, exportedAt: '2026-10-01T00:00:00.000Z', templates })],
    fileName,
    { type: 'application/json' },
  );

export async function chooseTheImportFile(file: File) {
  const input = screen.getByLabelText('Select a YAML, JSON, or Markdown template file');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    fireEvent.change(input);
  });
}
