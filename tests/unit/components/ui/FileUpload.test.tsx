import { readFileSync } from 'node:fs';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { FileUpload, ImagePreview } from '@/components/ui/file-upload';
import { uploadAcceptAttribute } from '@/lib/schemas/uploadTypes';

// Unit tests run in node with no DOM, so FileUpload is rendered shallowly: React's
// state hooks are stubbed and the returned element tree is searched for handlers.
// `stateOverride.value` replaces every useState initial value while set; setters record
// their calls in `stateOverride.sets`.
const stateOverride = vi.hoisted(() => ({ value: undefined as unknown, sets: [] as unknown[] }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const stubs = {
    useId: () => 'file-upload-test',
    useRef: () => ({ current: null }),
    useState: <T,>(initial: T) => [
      stateOverride.value === undefined ? initial : stateOverride.value,
      (next: unknown) => {
        stateOverride.sets.push(next);
      },
    ],
  };
  return { ...actual, ...stubs, default: { ...actual, ...stubs } };
});

vi.mock('@/lib/api', () => ({
  api: {
    deleteFromR2: vi.fn(),
    uploadToR2: vi.fn(),
  },
}));

vi.mock('@/lib/imageOptimization', () => ({
  isImageFile: vi.fn(() => false),
  optimizeImage: vi.fn(async (file: File) => file),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

type AnyElement = React.ReactElement<Record<string, unknown>>;

function findElement(
  node: React.ReactNode,
  predicate: (element: AnyElement) => boolean,
): AnyElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) return match;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  const element = node as AnyElement;
  if (predicate(element)) return element;
  return findElement(element.props.children as React.ReactNode, predicate);
}

const EXISTING_URL = '/api/uploads/file?key=template-images%2Fu1%2Fa.png';

describe('FileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateOverride.value = undefined;
    stateOverride.sets.length = 0;
  });

  it('clears an uploaded file without deleting the stored object', async () => {
    const onFileChange = vi.fn();
    const tree = FileUpload({
      type: 'image',
      value: EXISTING_URL,
      fileName: 'a.png',
      onValueChange: vi.fn(),
      onFileChange,
    });

    const removeButton = findElement(
      tree,
      (element) => element.props['aria-label'] === 'Remove uploaded image',
    );
    expect(removeButton).not.toBeNull();

    await (removeButton!.props.onClick as () => unknown)();

    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange).toHaveBeenCalledWith({
      value: '',
      fileName: undefined,
      fileSize: undefined,
    });
    expect(api.deleteFromR2).not.toHaveBeenCalled();
  });

  it('replaces an uploaded URL without deleting the previous object', async () => {
    vi.mocked(api.uploadToR2).mockResolvedValue({
      url: '/api/uploads/file?key=template-images%2Fu1%2Fb.png',
      fileName: 'b.png',
      fileSize: 10,
    });
    const onFileChange = vi.fn();
    const tree = FileUpload({
      type: 'image',
      value: EXISTING_URL,
      onValueChange: vi.fn(),
      onFileChange,
    });

    const fileInput = findElement(tree, (element) => element.props.type === 'file');
    expect(fileInput).not.toBeNull();

    const file = new File(['png'], 'b.png', { type: 'image/png' });
    await (fileInput!.props.onChange as (event: unknown) => Promise<void>)({
      target: { files: [file] },
    });

    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange).toHaveBeenCalledWith({
      value: '/api/uploads/file?key=template-images%2Fu1%2Fb.png',
      fileName: 'b.png',
      fileSize: 10,
    });
    expect(api.deleteFromR2).not.toHaveBeenCalled();
  });

  it.each([
    ['file', 'template-files'],
    ['video', 'template-videos'],
  ] as const)('offers the %s picker only the types the API stores', (type, bucket) => {
    const tree = FileUpload({ type, value: '', onValueChange: vi.fn(), onFileChange: vi.fn() });

    const fileInput = findElement(tree, (element) => element.props.type === 'file');
    expect(fileInput?.props.accept).toBe(uploadAcceptAttribute(bucket));
  });

  it('names the supported types instead of uploading a file the API would refuse', async () => {
    const tree = FileUpload({ type: 'file', value: '', onValueChange: vi.fn(), onFileChange: vi.fn() });
    const fileInput = findElement(tree, (element) => element.props.type === 'file');

    await (fileInput!.props.onChange as (event: unknown) => Promise<void>)({
      target: { files: [new File(['<p>'], 'page.html', { type: 'text/html' })] },
    });

    expect(api.uploadToR2).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Invalid file',
        description: expect.stringContaining('PDF, ZIP, CSV'),
      }),
    );
  });

  it('uploads a Windows ZIP to a File block', async () => {
    vi.mocked(api.uploadToR2).mockResolvedValue({ url: '/api/uploads/file?key=k', fileName: 'r.zip' });
    const tree = FileUpload({ type: 'file', value: '', onValueChange: vi.fn(), onFileChange: vi.fn() });
    const fileInput = findElement(tree, (element) => element.props.type === 'file');
    const zip = new File(['PK'], 'report.zip', { type: 'application/x-zip-compressed' });

    await (fileInput!.props.onChange as (event: unknown) => Promise<void>)({
      target: { files: [zip] },
    });

    expect(api.uploadToR2).toHaveBeenCalledWith({ bucket: 'template-files', file: zip });
  });

  // A name next to a URL that is not an upload is left over from an earlier upload (or
  // names a linked file). Its Remove button would clear a URL the author typed.
  it('shows the uploaded-file row only while the value is an uploaded file', () => {
    const tree = FileUpload({
      type: 'file',
      value: 'https://example.com/pricing.pdf',
      fileName: 'report.pdf',
      onValueChange: vi.fn(),
      onFileChange: vi.fn(),
    });

    expect(
      findElement(tree, (element) => element.props['aria-label'] === 'Remove uploaded file'),
    ).toBeNull();
    expect(findElement(tree, (element) => element.props.type === 'file')).not.toBeNull();
  });

  // The preview hid its <img> with style.display = 'none' on the first load error. React
  // kept the same element for the next URL, so a corrected URL loaded but stayed hidden
  // (typing a URL fails on its first characters), leaving an empty box.
  describe('image preview', () => {
    const previewFor = (value: string) =>
      findElement(
        FileUpload({ type: 'image', value, onValueChange: vi.fn(), onFileChange: vi.fn() }),
        (element) => element.type === ImagePreview,
      );

    it('gives each URL its own preview, so a failed URL cannot hide the next one', () => {
      const bad = previewFor('https://example.com/phot');
      const good = previewFor('https://example.com/photo.png');

      expect(bad?.key).toBe('https://example.com/phot');
      expect(good?.key).toBe('https://example.com/photo.png');
      expect(good?.props.src).toBe('https://example.com/photo.png');
    });

    it('previews an uploaded image', () => {
      expect(previewFor(EXISTING_URL)?.props.src).toBe(EXISTING_URL);
    });

    it('loads nothing while the URL is only partly typed', () => {
      expect(previewFor('h')?.props.src).toBeNull();
      expect(previewFor('https:')?.props.src).toBeNull();
    });

    it('shows no preview for an empty value', () => {
      expect(previewFor('')).toBeNull();
      expect(previewFor('   ')).toBeNull();
    });

    it('marks a failed load in state instead of hiding the element', () => {
      const img = ImagePreview({ src: 'https://example.com/photo.png' }) as AnyElement;
      expect(img.type).toBe('img');
      expect(img.props.style).toBeUndefined();

      const target = { style: {} as Record<string, string> };
      (img.props.onError as (event: unknown) => void)({ currentTarget: target, target });

      expect(target.style.display).toBeUndefined();
      expect(stateOverride.sets).toEqual([true]);
    });

    it('never hides the preview by setting a style React does not own', () => {
      const source = readFileSync(
        new URL('../../../../src/components/ui/file-upload.tsx', import.meta.url),
        'utf8',
      );
      expect(source).not.toMatch(/\.style\.display\s*=/);
    });

    it('says the preview is unavailable instead of showing an empty box', () => {
      stateOverride.value = true;
      const failed = ImagePreview({ src: 'https://example.com/photo.png' }) as AnyElement;
      stateOverride.value = undefined;
      const partial = ImagePreview({ src: null }) as AnyElement;

      for (const element of [failed, partial]) {
        expect(element.type).not.toBe('img');
        expect(element.props.children).toBe('Preview unavailable');
      }
    });
  });
});
