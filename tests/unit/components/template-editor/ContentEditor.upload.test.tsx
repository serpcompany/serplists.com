import '../../../support/mockedR2Uploads';
import { assert, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

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
import { findByAriaLabel, findElement, findElementOf, findFileInput } from '../../../support/elementTree';

const harness = vi.hoisted(
  (): { form: EditorForm | null; editorSetValueSpy: Mock<(...args: unknown[]) => void>; pendingUploadsFromContext: unknown } => ({
    form: null,
    editorSetValueSpy: vi.fn(),
    pendingUploadsFromContext: null,
  }),
);

type EditorForm = ReturnType<typeof createFormControlMountedLikeUseForm>;

function editorForm(): EditorForm {
  if (!harness.form) throw new Error('The test made no editor form: call createForm() first');
  return harness.form;
}


vi.mock('react', async (importOriginal) =>
  (await import('../../../support/reactHookStubs')).reactWithHookStubs(importOriginal, {
    useId: () => 'content-editor-test',
    useRef: () => ({ current: null }),
    useState: <T,>(initial: T) => [initial, () => undefined],
    useContext: () => harness.pendingUploadsFromContext,
  }),
);

vi.mock('react-hook-form', async (importOriginal) =>
  (await import('../../../support/reactHookFormMock')).reactHookFormWatching(
    importOriginal,
    harness,
    ({ valueAt }) => ({
      useFormContext: () => ({ ...editorForm(), setValue: harness.editorSetValueSpy }),
      useFieldArray: ({ name }: { name: string }) => ({
        fields: ((valueAt(name) ?? []) as TemplateEditorContent[]).map(
          (content) => ({ ...content, fieldId: content.id }),
        ),
        append: vi.fn(),
        remove: vi.fn(),
      }),
    }),
  ),
);


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
  });
  const setValue = editorForm().setValue as (...args: unknown[]) => void;
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
  assert.exists(input, 'the file input');
  const file = new File(['png'], 'photo.png', { type: 'image/png' });
  return (input.props.onChange as (event: unknown) => Promise<void>)({
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
  return editorForm().getValues(`${CONTENT_PATH}.${index}`);
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
    const removeButton = findByAriaLabel(tree, 'Remove uploaded image');
    assert.exists(removeButton, 'the Remove uploaded image button');
    await (removeButton.props.onClick as () => unknown)();

    const cleared = contentAt(0);
    expect(cleared?.id).toBe('c1');
    expect(cleared?.value).toBe('');
    expect(cleared?.fileName).toBeUndefined();
    expect(cleared?.fileSize).toBeUndefined();
  });

  it('writes a finished upload to its own block after a block was inserted above it during the upload', async () => {
    createForm([{ id: 'c1', type: 'image', value: '' }]);
    const finishUpload = holdTheUpload();
    const textBlockInsertedAbove: TemplateEditorContent = { id: 'c0', type: 'text', value: 'Intro' };

    const pending = selectFile(renderEditorFileUploadFromCurrentForm());
    const blockBeingUploadedTo = contentAt(0);
    assert.exists(blockBeingUploadedTo);
    editorForm().setValue(CONTENT_PATH, [
      textBlockInsertedAbove,
      blockBeingUploadedTo,
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
    editorForm().setValue(CONTENT_PATH, []);
    finishUpload({ url: UPLOADED_URL, fileName: 'photo.png', fileSize: 123 });
    await pending;

    expect(editorForm().getValues(CONTENT_PATH)).toEqual([]);
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
    assert.exists(input, 'the URL field');
    (input.props.onChange as (event: unknown) => void)({ target: { value } });
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

    expect(findByAriaLabel(tree, 'Remove uploaded file')).toBeNull();
    expect(findFileInput(tree)).not.toBeNull();
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

