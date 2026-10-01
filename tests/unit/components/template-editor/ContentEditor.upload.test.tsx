import { get } from 'react-hook-form';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { ContentEditor } from '@/components/template-editor/ContentEditor';
import { MediaContentEditor } from '@/components/template-editor/content-types/MediaContentEditor';
import { FileUpload } from '@/components/ui/file-upload';
import {
  createPendingUploads,
  type PendingUploads,
} from '@/features/template-editor/pendingUploads';
import type { TemplateEditorContent } from '@/lib/forms/templateEditorForm';

import { deferred } from '../../../support/deferred';
import { createFormControlMountedLikeUseForm } from '../../../support/editorFormControl';
import { findElement, findElementOf } from '../../../support/elementTree';

const harness = vi.hoisted(() => ({
  form: null as unknown as ReturnType<typeof import('react-hook-form').createFormControl>,
  editorSetValueSpy: null as unknown as (...args: unknown[]) => void,
  pendingUploadsFromContext: null as unknown,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const stubs = {
    useId: () => 'content-editor-test',
    useRef: () => ({ current: null }),
    useState: <T,>(initial: T) => [initial, () => undefined],
    useContext: () => harness.pendingUploadsFromContext,
  };
  return { ...actual, ...stubs, default: { ...actual, ...stubs } };
});

vi.mock('react-hook-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-hook-form')>();
  const watchedValueSnapshot = ({ name }: { name: string }) =>
    structuredClone(actual.get(harness.form.getValues(), name));
  return {
    ...actual,
    useFormContext: () => ({ ...harness.form, setValue: harness.editorSetValueSpy }),
    useWatch: watchedValueSnapshot,
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

const CONTENT_PATH = 'sections.0.items.0.contents';
const UPLOADED_URL = '/api/uploads/file?key=template-images%2Fu1%2Fphoto.png';

function createForm(contents: Array<Partial<TemplateEditorContent>>): void {
  harness.form = createFormControlMountedLikeUseForm({
    sections: [
      {
        id: 's1',
        title: 'Section',
        items: [{ id: 'i1', title: 'Task', contents: contents as TemplateEditorContent[] }],
      },
    ],
  }) as unknown as typeof harness.form;
  const setValue = harness.form.setValue as (...args: unknown[]) => void;
  harness.editorSetValueSpy = vi.fn((...args: unknown[]) => setValue(...args));
}

function renderEditorFileUploadFromCurrentForm() {
  const editorTree = ContentEditor({ itemIndex: 0, sectionIndex: 0 });
  const media = findElementOf(editorTree, MediaContentEditor);
  assert.exists(media);
  const upload = findElementOf(MediaContentEditor(media.props), FileUpload);
  assert.exists(upload);
  return FileUpload(upload.props);
}

function selectFile(tree: unknown): Promise<void> {
  const input = findElement(tree, (element) => element.props.type === 'file');
  expect(input).not.toBeNull();
  const file = new File(['png'], 'photo.png', { type: 'image/png' });
  return (input!.props.onChange as (event: unknown) => Promise<void>)({
    target: { files: [file] },
  });
}

type UploadedFile = Awaited<ReturnType<typeof api.uploadToR2>>;

function holdTheUpload(): (uploaded: UploadedFile) => void {
  const upload = deferred<UploadedFile>();
  vi.mocked(api.uploadToR2).mockReturnValue(upload.promise);
  return upload.resolve;
}

function contentAt(index: number): TemplateEditorContent | undefined {
  return get(harness.form.getValues(), `${CONTENT_PATH}.${index}`);
}

describe('ContentEditor media uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.pendingUploadsFromContext = createPendingUploads();
    vi.mocked(api.uploadToR2).mockResolvedValue({
      url: UPLOADED_URL,
      fileName: 'photo.png',
      fileSize: 123,
    });
  });

  it('keeps the uploaded URL together with the file name and size, and marks the form dirty', async () => {
    createForm([{ id: 'c1', type: 'image', value: '' }]);

    await selectFile(renderEditorFileUploadFromCurrentForm());

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
    const writes = vi.mocked(harness.editorSetValueSpy).mock.calls;
    expect(writes.length).toBeGreaterThan(0);
    for (const [, , options] of writes) {
      expect(options).toEqual(expect.objectContaining({ shouldDirty: true }));
    }
  });

  it('clears the URL, file name, and size together', async () => {
    createForm([
      { id: 'c1', type: 'image', value: UPLOADED_URL, fileName: 'photo.png', fileSize: 123, uploadType: 'upload' },
    ]);

    const tree = renderEditorFileUploadFromCurrentForm();
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

  it('writes a finished upload to its own block after a block was inserted above it during the upload', async () => {
    createForm([{ id: 'c1', type: 'image', value: '' }]);
    const finishUpload = holdTheUpload();
    const textBlockInsertedAbove = { id: 'c0', type: 'text', value: 'Intro' };

    const pending = selectFile(renderEditorFileUploadFromCurrentForm());
    harness.form.setValue(CONTENT_PATH as `sections.0.items.0.contents`, [
      textBlockInsertedAbove,
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
    const finishUpload = holdTheUpload();

    const pending = selectFile(renderEditorFileUploadFromCurrentForm());
    harness.form.setValue(CONTENT_PATH as `sections.0.items.0.contents`, []);
    finishUpload({ url: UPLOADED_URL, fileName: 'photo.png', fileSize: 123 });
    await pending;

    expect(get(harness.form.getValues(), CONTENT_PATH)).toEqual([]);
  });

  it('counts the upload as pending for the editor until it finishes, which keeps Save disabled and guards leaving', async () => {
    createForm([{ id: 'c1', type: 'image', value: '' }]);
    const uploads = harness.pendingUploadsFromContext as PendingUploads;
    const finishUpload = holdTheUpload();

    const pending = selectFile(renderEditorFileUploadFromCurrentForm());
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
    const uploads = harness.pendingUploadsFromContext as PendingUploads;
    vi.mocked(api.uploadToR2).mockRejectedValue(new Error('Network down'));

    const pending = selectFile(renderEditorFileUploadFromCurrentForm());
    expect(uploads.count()).toBe(1);
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(uploads.count()).toBe(0);
    expect(contentAt(0)?.value).toBe('');
  });
});

describe('ContentEditor media URL typed over an upload', () => {
  const EXTERNAL_URL = 'https://example.com/pricing.pdf';

  beforeEach(() => {
    vi.clearAllMocks();
    harness.pendingUploadsFromContext = createPendingUploads();
  });

  function typeUrl(tree: unknown, value: string): void {
    const input = findElement(
      tree,
      (element) => element.props.id === 'content-editor-test' && typeof element.props.onChange === 'function',
    );
    expect(input).not.toBeNull();
    (input!.props.onChange as (event: unknown) => void)({ target: { value } });
  }

  it('drops the uploaded file name and size and records a URL source, so runs never label the new link with the old file', () => {
    createForm([
      { id: 'c1', type: 'file', value: UPLOADED_URL, fileName: 'report.pdf', fileSize: 2048, uploadType: 'upload' },
    ]);

    typeUrl(renderEditorFileUploadFromCurrentForm(), EXTERNAL_URL);

    const content = contentAt(0);
    expect(content?.value).toBe(EXTERNAL_URL);
    expect(content?.fileName).toBeUndefined();
    expect(content?.fileSize).toBeUndefined();
    expect(content?.uploadType).toBe('url');
    expect(api.deleteFromR2).not.toHaveBeenCalled();
    const [, , options] = vi.mocked(harness.editorSetValueSpy).mock.calls.at(-1) ?? [];
    expect(options).toEqual(expect.objectContaining({ shouldDirty: true }));
  });

  it('no longer offers to remove the upload, so the typed URL cannot be cleared by it', () => {
    createForm([
      { id: 'c1', type: 'file', value: UPLOADED_URL, fileName: 'report.pdf', fileSize: 2048, uploadType: 'upload' },
    ]);

    typeUrl(renderEditorFileUploadFromCurrentForm(), EXTERNAL_URL);
    const tree = renderEditorFileUploadFromCurrentForm();

    expect(
      findElement(tree, (element) => element.props['aria-label'] === 'Remove uploaded file'),
    ).toBeNull();
    expect(findElement(tree, (element) => element.props.type === 'file')).not.toBeNull();
  });

  it('keeps the file details while the value stays the same', () => {
    createForm([
      { id: 'c1', type: 'file', value: UPLOADED_URL, fileName: 'report.pdf', fileSize: 2048, uploadType: 'upload' },
    ]);

    typeUrl(renderEditorFileUploadFromCurrentForm(), UPLOADED_URL);

    expect(contentAt(0)).toEqual(
      expect.objectContaining({ value: UPLOADED_URL, fileName: 'report.pdf', fileSize: 2048, uploadType: 'upload' }),
    );
  });
});

