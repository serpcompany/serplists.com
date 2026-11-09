import { describe, expect, it } from 'vitest';

import { buildPortablePackManifest } from '../../../../src/lib/schemas/portableTemplatePack';
import { exportPortableTemplatesToJSON } from '../../../../src/lib/utils/templateBackup';

const upload = { type: 'image', value: '/api/uploads/file?key=photo', uploadType: 'upload' };

describe('portable packs built from Templates no parser read first, which the declared types rule out', () => {
  it('counts the uploads in the sections, tasks and blocks it can read, and skips the rest', () => {
    const manifest = buildPortablePackManifest(
      [{ title: 'Moving day', sections: [null, { title: 'No tasks' }, { items: [null, { title: 'Pack' }, { contents: [null, 'note', upload, { type: 'file', value: 7, uploadType: 'upload' }] }] }] }],
      [],
    );

    expect(manifest.assetWarnings).toBe(2);
  });

  it('warns about an uploaded asset whose block holds no address', () => {
    const template = {
      id: 'template-1',
      title: 'Moving day',
      sections: [{ id: 'section-1', title: 'Pack', items: [{ id: 'item-1', title: 'Photos', contents: [{ type: 'image', uploadType: 'upload' }] }] }],
      userId: 'user-1',
      createdAt: '2026-07-03T12:00:00.000Z',
      updatedAt: '2026-07-03T12:00:00.000Z',
      isPublic: false,
    };

    expect(exportPortableTemplatesToJSON([template]).manifest.assetWarnings).toBe(1);
  });
});
