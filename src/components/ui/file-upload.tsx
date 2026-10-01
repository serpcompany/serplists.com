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
import { imagePreviewSrc, isUploadedAssetUrl } from '@/lib/utils/mediaSource';
import { formatUploadLimit, UPLOAD_MAX_BYTES } from '@/lib/schemas/uploadLimits';
import { VideoEmbed } from '@/components/shared/VideoEmbed';
import { UPLOAD_BUCKET_BY_TYPE, uploadSelectedFile, type FileUploadType } from './file-upload-flow';

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

export type FileUploadChange = {
  value: string;
  fileName?: string | undefined;
  fileSize?: number | undefined;
};

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
  fileName?: string | undefined;
  signedIn?: boolean;
  onValueChange: (value: string) => void;
  onFileChange: (change: FileUploadChange) => void;
  onUploadStart?: ((upload: Promise<UploadResult>) => void) | undefined;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  type,
  value,
  fileName,
  signedIn = false,
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
    if (!file || !signedIn) return;

    setIsUploading(true);

    try {
      await uploadSelectedFile({
        file,
        type,
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

  const handleClear = () => {
    onFileChange({ value: '', fileName: undefined, fileSize: undefined });
  };

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
              Max file size: {formatUploadLimit(UPLOAD_MAX_BYTES[UPLOAD_BUCKET_BY_TYPE[type]])}
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
