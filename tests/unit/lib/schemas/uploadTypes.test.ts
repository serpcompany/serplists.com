import { describe, expect, it } from 'vitest';

import {
  AVATAR_MIME_TYPES,
  describeUploadTypes,
  isAllowedUpload,
  resolveUploadContentType,
  type UploadBucket,
  uploadAcceptAttribute,
} from '@/lib/schemas/uploadTypes';

// Real (bucket, file name, browser-reported type) cases. Browsers take the type from
// the OS: Windows reports .zip as application/x-zip-compressed and .csv as
// application/vnd.ms-excel when Excel is installed; an unknown extension arrives as
// an empty type, which the multipart encoder sends as application/octet-stream.
describe('upload types', () => {
  it.each<[UploadBucket, string, string, string]>([
    ['template-files', 'report.zip', 'application/x-zip-compressed', 'application/x-zip-compressed'],
    ['template-files', 'report.zip', 'application/zip', 'application/zip'],
    ['template-files', 'report.zip', 'application/octet-stream', 'application/zip'],
    ['template-files', 'data.csv', 'text/csv', 'text/csv'],
    ['template-files', 'data.csv', 'application/vnd.ms-excel', 'application/vnd.ms-excel'],
    ['template-files', 'budget.xls', 'application/vnd.ms-excel', 'application/vnd.ms-excel'],
    ['template-files', 'letter.doc', 'application/msword', 'application/msword'],
    ['template-files', 'deck.ppt', 'application/vnd.ms-powerpoint', 'application/vnd.ms-powerpoint'],
    ['template-files', 'notes.md', '', 'text/markdown'],
    ['template-files', 'notes.md', 'application/octet-stream', 'text/markdown'],
    ['template-files', 'shot.png', 'image/png', 'image/png'],
    ['template-files', 'guide.pdf', 'application/pdf', 'application/pdf'],
    ['template-videos', 'clip.mp4', 'video/mp4', 'video/mp4'],
    ['template-videos', 'clip.mov', 'video/quicktime', 'video/quicktime'],
    ['template-images', 'logo.png', 'image/png', 'image/png'],
    ['avatars', 'me.webp', 'image/webp', 'image/webp'],
  ])('accepts %s %s sent as "%s"', (bucket, name, type, stored) => {
    expect(resolveUploadContentType(bucket, { name, type })).toBe(stored);
  });

  it.each<[UploadBucket, string, string]>([
    ['template-files', 'evil.html', 'text/html'],
    ['template-files', 'x.svg', 'image/svg+xml'],
    ['template-images', 'x.svg', 'image/svg+xml'],
    ['template-images', 'page.html', 'text/html'],
    ['avatars', 'x.svg', 'image/svg+xml'],
    ['avatars', 'me.heic', 'image/heic'],
    ['template-videos', 'movie.mkv', 'video/x-matroska'],
    ['template-videos', 'movie.avi', 'video/x-msvideo'],
    ['template-files', 'script.js', 'text/javascript'],
    ['template-files', 'mystery', ''],
    ['template-files', 'run.exe', 'application/octet-stream'],
  ])('refuses %s %s sent as "%s"', (bucket, name, type) => {
    expect(isAllowedUpload(bucket, { name, type })).toBe(false);
  });

  it('offers the file picker the extensions and types the API accepts', () => {
    const accept = uploadAcceptAttribute('template-files').split(',');

    expect(accept).toEqual(
      expect.arrayContaining(['.zip', 'application/x-zip-compressed', '.csv', 'text/csv', '.pdf']),
    );
    expect(accept).not.toContain('*/*');
    expect(uploadAcceptAttribute('template-videos').split(',')).toEqual(
      expect.arrayContaining(['video/mp4', '.mov']),
    );
  });

  it('names the accepted types in plain words', () => {
    expect(describeUploadTypes('template-videos')).toBe('MP4, WebM, or MOV videos');
    expect(describeUploadTypes('template-files')).toContain('CSV');
  });

  it('accepts exactly the avatar types the avatar picker offers', () => {
    for (const type of AVATAR_MIME_TYPES) {
      expect(isAllowedUpload('avatars', { name: 'a', type })).toBe(true);
    }
    expect(
      uploadAcceptAttribute('avatars')
        .split(',')
        .filter((entry) => entry.includes('/')),
    ).toEqual([...AVATAR_MIME_TYPES]);
  });
});
