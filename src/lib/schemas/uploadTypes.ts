export const UPLOAD_BUCKETS = [
  'avatars',
  'template-images',
  'template-videos',
  'template-files',
] as const;

export type UploadBucket = (typeof UPLOAD_BUCKETS)[number];

type UploadKind = {
  label: string;
  extensions: readonly string[];
  mimeTypes: readonly string[];
};

const typeStoredForUntypedFile = (kind: UploadKind): string | null => kind.mimeTypes[0] ?? null;

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

export const resolveUploadContentType = (
  bucket: UploadBucket,
  file: { name: string; type: string },
): string | null => {
  const { kinds } = UPLOAD_KINDS[bucket];
  const type = (file.type.split(';')[0] ?? '').trim().toLowerCase();

  if (!UNKNOWN_TYPES.has(type)) {
    return kinds.some((kind) => kind.mimeTypes.includes(type)) ? type : null;
  }

  const extension = extensionOf(file.name);
  const kind = kinds.find((candidate) => candidate.extensions.includes(extension));
  return kind ? typeStoredForUntypedFile(kind) : null;
};

export const isAllowedUpload = (
  bucket: UploadBucket,
  file: { name: string; type: string },
): boolean => resolveUploadContentType(bucket, file) !== null;

export const uploadAcceptAttribute = (bucket: UploadBucket): string => {
  const { kinds } = UPLOAD_KINDS[bucket];
  const entries = new Set<string>();
  kinds.forEach((kind) => kind.extensions.forEach((extension) => entries.add(extension)));
  kinds.forEach((kind) => kind.mimeTypes.forEach((type) => entries.add(type)));
  return Array.from(entries).join(',');
};

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
