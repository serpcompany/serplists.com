import React from 'react';
import { createFormControl, get } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { ContentEditor } from '@/components/template-editor/ContentEditor';
import { MediaContentEditor } from '@/components/template-editor/content-types/MediaContentEditor';
import { FileUpload } from '@/components/ui/file-upload';
import {
  createPendingUploads,
  type PendingUploads,
} from '@/features/template-editor/pendingUploads';
import {
  buildTemplateEditorFormValues,
  type TemplateEditorContent,
  type TemplateEditorFormValues,
} from '@/lib/forms/templateEditorForm';

// Unit tests run in node with no DOM, so the editor is rendered shallowly: each
// component is called as a function and its element tree is searched for the next
// component's props. The form is a real react-hook-form control; useWatch returns
// a deep clone of the watched value, as react-hook-form 7.62 emits after setValue
// and field-array updates, so render-time snapshots go stale like in the browser.
const harness = vi.hoisted(() => ({
  form: null as unknown as ReturnType<typeof import('react-hook-form').createFormControl>,
  // The editor's writes, recorded so tests can check they mark the form dirty.
  editorSetValue: null as unknown as (...args: unknown[]) => void,
  // The editor page's pending-upload store, which ContentEditor reads from context.
  uploads: null as unknown,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const stubs = {
    useId: () => 'content-editor-test',
    useRef: () => ({ current: null }),
    useState: <T,>(initial: T) => [initial, () => undefined],
    useContext: () => harness.uploads,
  };
  return { ...actual, ...stubs, default: { ...actual, ...stubs } };
});

vi.mock('react-hook-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-hook-form')>();
  return {
    ...actual,
    useFormContext: () => ({ ...harness.form, setValue: harness.editorSetValue }),
    useWatch: ({ name }: { name: string }) =>
      structuredClone(actual.get(harness.form.getValues(), name)),
    useFieldArray: ({ name }: { name: string }) => ({
      fields: ((actual.get(harness.form.getValues(), name) ?? []) as TemplateEditorContent[]).map(
        (content) => ({ ...content, fieldId: content.id }),
      ),
      append: vi.fn(),
      remove: vi.fn(),
    }),
  };
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

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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

const CONTENT_PATH = 'sections.0.items.0.contents';
const UPLOADED_URL = '/api/uploads/file?key=template-images%2Fu1%2Fphoto.png';

function createForm(contents: Array<Partial<TemplateEditorContent>>): void {
  harness.form = createFormControl<TemplateEditorFormValues>({
    defaultValues: buildTemplateEditorFormValues({
      sections: [
        {
          id: 's1',
          title: 'Section',
          items: [{ id: 'i1', title: 'Task', contents: contents as TemplateEditorContent[] }],
        },
      ],
    }),
  }) as typeof harness.form;
  // useForm marks its control mounted; until then getValues() reads the defaults.
  harness.form.control._state.mount = true;
  const setValue = harness.form.setValue as (...args: unknown[]) => void;
  harness.editorSetValue = vi.fn((...args: unknown[]) => setValue(...args));
}

// Renders the editor as it was when the user acted and returns FileUpload's tree.
function renderFileUpload(): React.ReactNode {
  const editorTree = ContentEditor({ itemIndex: 0, sectionIndex: 0 });
  const media = findElement(editorTree, (element) => element.type === MediaContentEditor);
  expect(media).not.toBeNull();
  const mediaTree = MediaContentEditor(media!.props as Parameters<typeof MediaContentEditor>[0]);
  const upload = findElement(mediaTree, (element) => element.type === FileUpload);
  expect(upload).not.toBeNull();
  return FileUpload(upload!.props as Parameters<typeof FileUpload>[0]);
}

function selectFile(tree: React.ReactNode): Promise<void> {
  const input = findElement(tree, (element) => element.props.type === 'file');
  expect(input).not.toBeNull();
  const file = new File(['png'], 'photo.png', { type: 'image/png' });
  return (input!.props.onChange as (event: unknown) => Promise<void>)({
    target: { files: [file] },
  });
}

function contentAt(index: number): TemplateEditorContent | undefined {
  return get(harness.form.getValues(), `${CONTENT_PATH}.${index}`);
}

describe('ContentEditor media uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.uploads = createPendingUploads();
    vi.mocked(api.uploadToR2).mockResolvedValue({
      url: UPLOADED_URL,
      fileName: 'photo.png',
      fileSize: 123,
    });
  });

  it('keeps the uploaded URL together with the file name and size', async () => {
    createForm([{ id: 'c1', type: 'image', value: '' }]);

    await selectFile(renderFileUpload());

    expect(contentAt(0)).toEqual(
      expect.objectContaining({
        id: 'c1',
        type: 'image',
        value: UPLOADED_URL,
        fileName: 'photo.png',
        fileSize: 123,
        uploadType: 'upload',
      }),
    );
    const writes = vi.mocked(harness.editorSetValue).mock.calls;
    expect(writes.length).toBeGreaterThan(0);
    for (const [, , options] of writes) {
      expect(options).toEqual(expect.objectContaining({ shouldDirty: true }));
    }
  });

  it('clears the URL, file name, and size together', async () => {
    createForm([
      { id: 'c1', type: 'image', value: UPLOADED_URL, fileName: 'photo.png', fileSize: 123, uploadType: 'upload' },
    ]);

    const tree = renderFileUpload();
    const removeButton = findElement(
      tree,
      (element) => element.props['aria-label'] === 'Remove uploaded image',
    );
    expect(removeButton).not.toBeNull();
    await (removeButton!.props.onClick as () => unknown)();

    const cleared = contentAt(0);
    expect(cleared?.id).toBe('c1');
    expect(cleared?.value).toBe('');
    expect(cleared?.fileName).toBeUndefined();
    expect(cleared?.fileSize).toBeUndefined();
  });

  it('writes a finished upload to its own block after blocks move', async () => {
    createForm([{ id: 'c1', type: 'image', value: '' }]);
    let finishUpload: (value: unknown) => void = () => undefined;
    vi.mocked(api.uploadToR2).mockReturnValue(
      new Promise((resolve) => {
        finishUpload = resolve;
      }) as ReturnType<typeof api.uploadToR2>,
    );

    const pending = selectFile(renderFileUpload());
    // While the upload runs, a text block is inserted above the image block.
    harness.form.setValue(CONTENT_PATH as `sections.0.items.0.contents`, [
      { id: 'c0', type: 'text', value: 'Intro' },
      contentAt(0)!,
    ]);
    finishUpload({ url: UPLOADED_URL, fileName: 'photo.png', fileSize: 123 });
    await pending;

    expect(contentAt(0)).toEqual({ id: 'c0', type: 'text', value: 'Intro' });
    expect(contentAt(1)).toEqual(
      expect.objectContaining({ id: 'c1', value: UPLOADED_URL, fileName: 'photo.png' }),
    );
  });

  it('does not bring back a block removed while its upload was running', async () => {
    createForm([{ id: 'c1', type: 'image', value: '' }]);
    let finishUpload: (value: unknown) => void = () => undefined;
    vi.mocked(api.uploadToR2).mockReturnValue(
      new Promise((resolve) => {
        finishUpload = resolve;
      }) as ReturnType<typeof api.uploadToR2>,
    );

    const pending = selectFile(renderFileUpload());
    harness.form.setValue(CONTENT_PATH as `sections.0.items.0.contents`, []);
    finishUpload({ url: UPLOADED_URL, fileName: 'photo.png', fileSize: 123 });
    await pending;

    expect(get(harness.form.getValues(), CONTENT_PATH)).toEqual([]);
  });

  // The editor disables Save and guards leaving while this count is above zero.
  it('reports the upload to the editor until it finishes', async () => {
    createForm([{ id: 'c1', type: 'image', value: '' }]);
    const uploads = harness.uploads as PendingUploads;
    let finishUpload: (value: unknown) => void = () => undefined;
    vi.mocked(api.uploadToR2).mockReturnValue(
      new Promise((resolve) => {
        finishUpload = resolve;
      }) as ReturnType<typeof api.uploadToR2>,
    );

    const pending = selectFile(renderFileUpload());
    await Promise.resolve();
    expect(uploads.count()).toBe(1);

    finishUpload({ url: UPLOADED_URL, fileName: 'photo.png', fileSize: 123 });
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(uploads.count()).toBe(0);
    expect(contentAt(0)?.value).toBe(UPLOADED_URL);
  });

  it('stops reporting an upload that fails', async () => {
    createForm([{ id: 'c1', type: 'image', value: '' }]);
    const uploads = harness.uploads as PendingUploads;
    vi.mocked(api.uploadToR2).mockRejectedValue(new Error('Network down'));

    const pending = selectFile(renderFileUpload());
    expect(uploads.count()).toBe(1);
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(uploads.count()).toBe(0);
    expect(contentAt(0)?.value).toBe('');
  });
});

// After an upload the block holds its URL plus the file's name and size. Typing a URL
// over it must drop the name and size, or runs label the new link with the old file
// and the editor keeps a Remove button that would clear the typed URL.
describe('ContentEditor media URL typed over an upload', () => {
  const EXTERNAL_URL = 'https://example.com/pricing.pdf';

  beforeEach(() => {
    vi.clearAllMocks();
    harness.uploads = createPendingUploads();
  });

  function typeUrl(tree: React.ReactNode, value: string): void {
    const input = findElement(
      tree,
      (element) => element.props.id === 'content-editor-test' && typeof element.props.onChange === 'function',
    );
    expect(input).not.toBeNull();
    (input!.props.onChange as (event: unknown) => void)({ target: { value } });
  }

  it('drops the uploaded file name and size and records a URL source', () => {
    createForm([
      { id: 'c1', type: 'file', value: UPLOADED_URL, fileName: 'report.pdf', fileSize: 2048, uploadType: 'upload' },
    ]);

    typeUrl(renderFileUpload(), EXTERNAL_URL);

    const content = contentAt(0);
    expect(content?.value).toBe(EXTERNAL_URL);
    expect(content?.fileName).toBeUndefined();
    expect(content?.fileSize).toBeUndefined();
    expect(content?.uploadType).toBe('url');
    expect(api.deleteFromR2).not.toHaveBeenCalled();
    const [, , options] = vi.mocked(harness.editorSetValue).mock.calls.at(-1) ?? [];
    expect(options).toEqual(expect.objectContaining({ shouldDirty: true }));
  });

  it('no longer offers to remove the upload, so the typed URL cannot be cleared by it', () => {
    createForm([
      { id: 'c1', type: 'file', value: UPLOADED_URL, fileName: 'report.pdf', fileSize: 2048, uploadType: 'upload' },
    ]);

    typeUrl(renderFileUpload(), EXTERNAL_URL);
    const tree = renderFileUpload();

    expect(
      findElement(tree, (element) => element.props['aria-label'] === 'Remove uploaded file'),
    ).toBeNull();
    expect(findElement(tree, (element) => element.props.type === 'file')).not.toBeNull();
  });

  it('keeps the file details while the value stays the same', () => {
    createForm([
      { id: 'c1', type: 'file', value: UPLOADED_URL, fileName: 'report.pdf', fileSize: 2048, uploadType: 'upload' },
    ]);

    typeUrl(renderFileUpload(), UPLOADED_URL);

    expect(contentAt(0)).toEqual(
      expect.objectContaining({ value: UPLOADED_URL, fileName: 'report.pdf', fileSize: 2048, uploadType: 'upload' }),
    );
  });
});

