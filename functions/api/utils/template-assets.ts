function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function hasOversizedAssets(sections: unknown[], maxAssetBytes: number): boolean {
  for (const section of sections) {
    if (!isRecord(section)) continue;
    const items = section.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!isRecord(item)) continue;
      const contents = item.contents;
      if (!Array.isArray(contents)) continue;
      for (const content of contents) {
        if (!isRecord(content)) continue;
        const type = content.type;
        if (type !== 'image' && type !== 'video' && type !== 'file') continue;
        const fileSize = content.fileSize;
        if (typeof fileSize === 'number' && fileSize > maxAssetBytes) return true;
      }
    }
  }
  return false;
}

export function countReferencedUploads(sections: unknown[]): number {
  let count = 0;

  for (const section of sections) {
    if (!isRecord(section)) continue;
    const items = section.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!isRecord(item)) continue;
      const contents = item.contents;
      if (!Array.isArray(contents)) continue;
      for (const content of contents) {
        if (!isRecord(content)) continue;
        const type = content.type;
        const value = typeof content.value === 'string' ? content.value : '';
        const isUpload = content.uploadType === 'upload' || value.includes('/api/uploads/file') || value.includes('uploads/file?key=');
        if ((type === 'image' || type === 'video' || type === 'file') && isUpload) {
          count += 1;
        }
      }
    }
  }

  return count;
}
