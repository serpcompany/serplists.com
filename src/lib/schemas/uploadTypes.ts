// What each upload bucket stores, shared by the API (functions/api/handlers/uploads.ts)
// and the upload pickers, so the browser never offers or sends a file the API refuses.
//
// Browsers take a file's type from the OS, so one kind of file arrives under several
// types: Windows reports .zip as application/x-zip-compressed and .csv as
// application/vnd.ms-excel when Excel is installed. A file whose type the OS does not
// know arrives with an empty type, which the multipart encoder sends as
// application/octet-stream; such a file is accepted by its extension and stored under
// the kind's usual type.
//
// Never add HTML, SVG, XML, or script types: /api/uploads/file serves files from the
// app's origin, so they would run as the app.

export const UPLOAD_BUCKETS = [
  'avatars',
  'template-images',
  'template-videos',
  'template-files',
] as const;

export type UploadBucket = (typeof UPLOAD_BUCKETS)[number];

// Size limits per bucket are in ./uploadLimits.ts.

// Image types the API stores for avatars and Image blocks. The avatar picker offers
// and checks the same list, so a file the API would refuse is caught first.
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

type UploadKind = {
  label: string;
  extensions: readonly string[];
  // The first type is the one stored when the browser sends no type.
  mimeTypes: readonly string[];
};

const IMAGE_KINDS: readonly UploadKind[] = [
  { label: 'PNG', extensions: ['.png'], mimeTypes: ['image/png'] },
  { label: 'JPEG', extensions: ['.jpg', '.jpeg'], mimeTypes: ['image/jpeg'] },
  { label: 'WebP', extensions: ['.webp'], mimeTypes: ['image/webp'] },
  { label: 'GIF', extensions: ['.gif'], mimeTypes: ['image/gif'] },
];

const VIDEO_KINDS: readonly UploadKind[] = [
  { label: 'MP4', extensions: ['.mp4'], mimeTypes: ['video/mp4'] },
  { label: 'WebM', extensions: ['.webm'], mimeTypes: ['video/webm'] },
  { label: 'MOV', extensions: ['.mov'], mimeTypes: ['video/quicktime'] },
];

// Files are always served as attachments (Content-Disposition: attachment).
const FILE_KINDS: readonly UploadKind[] = [
  { label: 'PDF', extensions: ['.pdf'], mimeTypes: ['application/pdf'] },
  {
    label: 'ZIP',
    extensions: ['.zip'],
    mimeTypes: [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-zip',
      'application/zip-compressed',
      'multipart/x-zip',
    ],
  },
  {
    label: 'CSV',
    extensions: ['.csv'],
    mimeTypes: ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
  },
  {
    label: 'Word',
    extensions: ['.docx', '.doc'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ],
  },
  {
    label: 'Excel',
    extensions: ['.xlsx', '.xls'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
  },
  {
    label: 'PowerPoint',
    extensions: ['.pptx', '.ppt'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
    ],
  },
  { label: 'JSON', extensions: ['.json'], mimeTypes: ['application/json'] },
  {
    label: 'Markdown',
    extensions: ['.md', '.markdown'],
    mimeTypes: ['text/markdown', 'text/x-markdown', 'text/plain'],
  },
  { label: 'text', extensions: ['.txt'], mimeTypes: ['text/plain'] },
  {
    label: 'image',
    extensions: IMAGE_KINDS.flatMap((kind) => kind.extensions),
    mimeTypes: IMAGE_KINDS.flatMap((kind) => kind.mimeTypes),
  },
];

const UPLOAD_KINDS: Record<UploadBucket, { kinds: readonly UploadKind[]; noun: string }> = {
  avatars: { kinds: IMAGE_KINDS, noun: 'images' },
  'template-images': { kinds: IMAGE_KINDS, noun: 'images' },
  'template-videos': { kinds: VIDEO_KINDS, noun: 'videos' },
  'template-files': { kinds: FILE_KINDS, noun: 'files' },
};

const UNKNOWN_TYPES = new Set(['', 'application/octet-stream']);

const extensionOf = (name: string): string => {
  const match = /\.[^./\\]+$/.exec(name.trim().toLowerCase());
  return match ? match[0] : '';
};

export const isUploadBucket = (value: unknown): value is UploadBucket =>
  typeof value === 'string' && (UPLOAD_BUCKETS as readonly string[]).includes(value);

// The type to store the file under, or null when the bucket does not take it.
export const resolveUploadContentType = (
  bucket: UploadBucket,
  file: { name: string; type: string },
): string | null => {
  const { kinds } = UPLOAD_KINDS[bucket];
  const type = file.type.split(';')[0].trim().toLowerCase();

  if (!UNKNOWN_TYPES.has(type)) {
    return kinds.some((kind) => kind.mimeTypes.includes(type)) ? type : null;
  }

  const extension = extensionOf(file.name);
  const kind = kinds.find((candidate) => candidate.extensions.includes(extension));
  return kind ? kind.mimeTypes[0] : null;
};

export const isAllowedUpload = (
  bucket: UploadBucket,
  file: { name: string; type: string },
): boolean => resolveUploadContentType(bucket, file) !== null;

// For an <input type="file" accept>: extensions too, since Windows pickers filter on them.
export const uploadAcceptAttribute = (bucket: UploadBucket): string => {
  const { kinds } = UPLOAD_KINDS[bucket];
  const entries = new Set<string>();
  kinds.forEach((kind) => kind.extensions.forEach((extension) => entries.add(extension)));
  kinds.forEach((kind) => kind.mimeTypes.forEach((type) => entries.add(type)));
  return Array.from(entries).join(',');
};

// "PDF, ZIP, or CSV files": for messages that say what a bucket takes.
export const describeUploadTypes = (bucket: UploadBucket): string => {
  const { kinds, noun } = UPLOAD_KINDS[bucket];
  const labels = kinds.map((kind) => kind.label);
  const list =
    labels.length > 1
      ? `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`
      : labels[0];
  return `${list} ${noun}`;
};

export const unsupportedUploadMessage = (bucket: UploadBucket): string =>
  `This file type can't be uploaded here. Use ${describeUploadTypes(bucket)}.`;
