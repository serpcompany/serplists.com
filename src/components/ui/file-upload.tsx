import type { JSX } from 'react';
import React, { useId, useRef, useState } from 'react';
import { X, File, ImageIcon, Video } from 'lucide-react';

import { Button } from './button';
import { Field, FieldDescription, FieldLabel } from './field';
import { Input } from './input';
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from './item';
import { Textarea } from './textarea';
import { cn } from '@/lib/utils';
import { uploadAcceptTypesForBlock, type UploadResult } from '@/lib/utils/fileUpload';
import { formatAssetSizeLimit } from '@/lib/schemas/templateAssetLimits';
import { imagePreviewSrc, isUploadedAssetUrl } from '@/lib/utils/mediaSource';
import { UPLOAD_MAX_BYTES } from '@/lib/schemas/uploadLimits';
import { VideoEmbed } from '@/components/shared/VideoEmbed';
import { uploadSelectedFile, type FileUploadType } from './file-upload-flow';

// The bucket each block type uploads to, for the size limit the API enforces there.
const UPLOAD_BUCKET_BY_TYPE = {
  image: 'template-images',
  video: 'template-videos',
  file: 'template-files',
} as const satisfies Record<FileUploadType, string>;

const SOURCE_LABEL: Record<FileUploadType, string> = {
  image: 'Image URL',
  video: 'Video URL or embed code',
  file: 'File URL',
};

const TYPE_ICON: Record<FileUploadType, typeof File> = {
  image: ImageIcon,
  video: Video,
  file: File,
};

// An upload or a clear, reported as one change so the URL and the file details are
// never written separately (a second write could restore a stale URL).
export type FileUploadChange = {
  value: string;
  fileName?: string;
  fileSize?: number;
};

// The preview of one image address (null: nothing loadable yet). FileUpload keys it by
// the value, so every new value gets a fresh <img> and a fresh failed state: a URL that
// failed to load (as a URL does while it is typed) cannot hide a later one. A failure
// is React state, never a style set on the element, which React would keep.
export const ImagePreview = ({ src }: { src: string | null }): JSX.Element => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <p className="py-2 text-center text-xs text-muted-foreground">Preview unavailable</p>;
  }

  return (
    <img
      src={src}
      alt="Preview"
      className="mx-auto max-h-32 rounded-md"
      onError={() => setFailed(true)}
    />
  );
};

interface FileUploadProps {
  type: FileUploadType;
  value: string;
  fileName?: string;
  // The signed-in user, whose folder uploads go to. Without one, picking a file does nothing.
  userId?: string;
  // Typing or pasting in the URL field.
  onValueChange: (value: string) => void;
  onFileChange: (change: FileUploadChange) => void;
  // Receives each upload as it starts, so the page can wait for it: the file reaches
  // the form only when the upload finishes, and this field may unmount before then.
  onUploadStart?: (upload: Promise<UploadResult>) => void;
  className?: string;
}

// A media block's source: a URL field, or an upload, with a preview. Built from the shadcn
// Field, Input, Textarea, Item and Button.
export const FileUpload: React.FC<FileUploadProps> = ({
  type,
  value,
  fileName,
  userId,
  onValueChange,
  onFileChange,
  onUploadStart,
  className,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const sourceInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const TypeIcon = TYPE_ICON[type];

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    setIsUploading(true);

    try {
      await uploadSelectedFile({
        file,
        type,
        userId,
        onUploadStart,
        onUploaded: (uploaded) => {
          onFileChange({ value: uploaded.url, fileName: uploaded.fileName, fileSize: uploaded.fileSize });
        },
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Clearing only changes the form. The stored object stays, because the saved
  // template, its runs, versions, and copies may still reference it.
  const handleClear = () => {
    onFileChange({ value: '', fileName: undefined, fileSize: undefined });
  };

  // The uploaded-file row (and its Remove button, which clears the value) only while
  // the value is that upload: a name next to a typed URL is not an upload to remove.
  const uploadedFileName = fileName && isUploadedAssetUrl(value) ? fileName : undefined;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <Field>
        <FieldLabel htmlFor={sourceInputId}>{SOURCE_LABEL[type]}</FieldLabel>
        {type === 'video' ? (
          <Textarea
            id={sourceInputId}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder="Paste a video URL or iframe embed code..."
            rows={3}
          />
        ) : (
          <Input
            id={sourceInputId}
            type="url"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={`Enter ${type} URL...`}
          />
        )}
      </Field>

      <Field>
        <FieldLabel>Or upload {type}</FieldLabel>
        {uploadedFileName ? (
          <Item variant="outline" size="sm">
            <ItemMedia variant="icon">
              <TypeIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{uploadedFileName}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleClear}
                disabled={isUploading}
                aria-label={`Remove uploaded ${type}`}
              >
                <X />
              </Button>
            </ItemActions>
          </Item>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed p-2 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept={uploadAcceptTypesForBlock(type)}
              onChange={handleFileSelect}
              disabled={isUploading}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              {isUploading ? (
                'Uploading...'
              ) : (
                <>
                  <TypeIcon />
                  Click to upload {type}
                </>
              )}
            </Button>
            <FieldDescription className="text-xs">
              Max file size: {formatAssetSizeLimit(UPLOAD_MAX_BYTES[UPLOAD_BUCKET_BY_TYPE[type]])}
            </FieldDescription>
          </div>
        )}
      </Field>

      {value && value.trim() && type === 'image' ? (
        <div className="rounded-lg border p-2">
          <ImagePreview key={value} src={imagePreviewSrc(value)} />
        </div>
      ) : null}

      {value && type === 'video' ? (
        <div className="overflow-hidden rounded-lg border p-2">
          <VideoEmbed className="h-72 w-full rounded-md" title="Video preview" url={value} />
        </div>
      ) : null}
    </div>
  );
};
