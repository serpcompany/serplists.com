import { describe, expect, it } from 'vitest';

import { hasCurrentFileInfo, imagePreviewSrc, withMediaValue } from '@/lib/utils/mediaSource';

const UPLOADED_URL = '/api/uploads/file?key=template-files%2Fu1%2Freport.pdf';
const uploaded = {
  id: 'c1',
  type: 'file' as const,
  value: UPLOADED_URL,
  fileName: 'report.pdf',
  fileSize: 2048,
  uploadType: 'upload' as const,
};

describe('withMediaValue', () => {
  it('drops the uploaded file name and size when a URL replaces the upload, since they described the upload', () => {
    expect(withMediaValue(uploaded, 'https://example.com/pricing.pdf')).toEqual({
      id: 'c1',
      type: 'file',
      value: 'https://example.com/pricing.pdf',
      fileName: undefined,
      fileSize: undefined,
      uploadType: 'url',
    });
  });

  it('drops them when one character of the uploaded URL is edited', () => {
    const edited = withMediaValue(uploaded, `${UPLOADED_URL}x`);

    expect(edited.fileName).toBeUndefined();
    expect(edited.fileSize).toBeUndefined();
  });

  it('drops them when the URL is cleared', () => {
    expect(withMediaValue(uploaded, '')).toEqual({
      id: 'c1',
      type: 'file',
      value: '',
      fileName: undefined,
      fileSize: undefined,
      uploadType: undefined,
    });
  });

  it('keeps everything when the value does not change', () => {
    expect(withMediaValue(uploaded, UPLOADED_URL)).toBe(uploaded);
  });

  it('marks a pasted upload URL as an upload', () => {
    const pasted = withMediaValue(
      { id: 'c2', type: 'image' as const, value: '' },
      '/api/uploads/file?key=template-images%2Fu1%2Fa.png',
    );

    expect(pasted.uploadType).toBe('upload');
    expect(pasted.fileName).toBeUndefined();
  });

  it('marks embed code typed into a video block as a URL source', () => {
    expect(withMediaValue({ id: 'c3', type: 'video' as const, value: '' }, '<iframe src="x"></iframe>').uploadType)
      .toBe('url');
  });
});

describe('hasCurrentFileInfo', () => {
  it('trusts the name of an uploaded file', () => {
    expect(hasCurrentFileInfo(uploaded)).toBe(true);
    expect(hasCurrentFileInfo({ value: UPLOADED_URL })).toBe(true);
  });

  it('trusts the name an author gave a linked file, as the public packs do', () => {
    expect(hasCurrentFileInfo({ value: 'https://example.com/a.pdf', uploadType: 'url' })).toBe(true);
  });

  it('does not trust a name left over from an upload the value no longer points to', () => {
    expect(hasCurrentFileInfo({ value: 'https://example.com/pricing.pdf', uploadType: 'upload' })).toBe(false);
    expect(hasCurrentFileInfo({ value: 'https://example.com/pricing.pdf' })).toBe(false);
    expect(hasCurrentFileInfo({ value: '' })).toBe(false);
  });
});

describe('imagePreviewSrc', () => {
  it.each(['h', 'ht', 'https:', 'https://', '   ', '', 'example.com/photo.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'mailto:a@b.c'])(
    'has nothing to load for %j, which as an img src would load a page of this site and fail',
    (value) => {
      expect(imagePreviewSrc(value)).toBeNull();
    },
  );

  it.each([
    ['https://example.com/photo.png', 'https://example.com/photo.png'],
    ['http://example.com/photo.png', 'http://example.com/photo.png'],
    ['  https://example.com/photo.png  ', 'https://example.com/photo.png'],
    [UPLOADED_URL, UPLOADED_URL],
    ['/images/logo.png', '/images/logo.png'],
  ])('loads %j', (value, expected) => {
    expect(imagePreviewSrc(value)).toBe(expected);
  });
});
