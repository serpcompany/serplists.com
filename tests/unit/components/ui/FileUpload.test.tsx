import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { FileUpload } from '@/components/ui/file-upload';
import { uploadAcceptAttribute } from '@/lib/schemas/uploadTypes';

// Unit tests run in node with no DOM, so FileUpload is rendered shallowly: React's
// state hooks are stubbed and the returned element tree is searched for handlers.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const stubs = {
    useId: () => 'file-upload-test',
    useRef: () => ({ current: null }),
    useState: <T,>(initial: T) => [initial, () => undefined],
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
});
