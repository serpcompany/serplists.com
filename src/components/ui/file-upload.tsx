import React, { useId, useRef, useState } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Textarea } from './textarea';
import { Label } from './label';
import { X, File, Image, Video } from 'lucide-react';
import {
  uploadAcceptTypesForBlock,
  uploadFile,
  validateFile,
  UploadResult,
} from '@/lib/utils/fileUpload';
import { formatAssetSizeLimit } from '@/lib/schemas/templateAssetLimits';
import { isUploadedAssetUrl } from '@/lib/utils/mediaSource';
import { UPLOAD_MAX_BYTES } from '@/lib/schemas/uploadTypes';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useToast } from '@/hooks/use-toast';
import { VideoEmbed } from '@/components/shared/VideoEmbed';

// An upload or a clear, reported as one change so the URL and the file details are
// never written separately (a second write could restore a stale URL).
export type FileUploadChange = {
  value: string;
  fileName?: string;
  fileSize?: number;
};

interface FileUploadProps {
  type: 'image' | 'video' | 'file';
  value: string;
  fileName?: string;
  // Typing or pasting in the URL field.
  onValueChange: (value: string) => void;
  onFileChange: (change: FileUploadChange) => void;
  // Receives each upload as it starts, so the page can wait for it: the file reaches
  // the form only when the upload finishes, and this field may unmount before then.
  onUploadStart?: (upload: Promise<UploadResult>) => void;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  type,
  value,
  fileName,
  onValueChange,
  onFileChange,
  onUploadStart,
  className = ''
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const sourceInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const getBucketName = () => {
    switch (type) {
      case 'image': return 'template-images';
      case 'video': return 'template-videos';
      case 'file': return 'template-files';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'image': return <Image className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      case 'file': return <File className="h-4 w-4" />;
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file
    const validation = validateFile(file, type);
    if (!validation.valid) {
      toast({
        title: "Invalid file",
        description: validation.error,
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);

    try {
      const upload = uploadFile(file, getBucketName(), user.id);
      onUploadStart?.(upload);
      const result: UploadResult = await upload;

      // The previous upload is never deleted here: the saved template, its runs,
      // versions, and copies may still reference it, and this change is unsaved.
      if (result.success && result.url) {
        onFileChange({ value: result.url, fileName: result.fileName, fileSize: result.fileSize });
        toast({
          title: "Upload successful",
          description: `${file.name} has been uploaded.`
        });
      } else {
        toast({
          title: "Upload failed",
          description: result.error || "Unknown error occurred",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "An unexpected error occurred",
        variant: "destructive"
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
    <div className={`space-y-4 ${className}`}>
      {/* URL Input */}
      <div className="space-y-2">
        <Label htmlFor={sourceInputId}>
          {type === 'image' ? 'Image URL' : 
           type === 'video' ? 'Video URL or embed code' :
           'File URL'}
        </Label>
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
      </div>

      {/* File Upload */}
      <div className="space-y-2">
        <Label>
          Or upload {type === 'image' ? 'image' : type === 'video' ? 'video' : 'file'}
        </Label>
        
        <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-2">
          {uploadedFileName ? (
            <div className="flex items-center justify-between p-2 bg-muted rounded">
              <div className="flex items-center gap-2">
                {getIcon()}
                <span className="text-sm font-medium">
                  {uploadedFileName}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={isUploading}
                aria-label={`Remove uploaded ${type}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="text-center">
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
                  <>Uploading...</>
                ) : (
                  <>
                    {getIcon()}
                    <span className="ml-2">
                      Click to upload {type}
                    </span>
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                Max file size: {formatAssetSizeLimit(UPLOAD_MAX_BYTES)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Preview for images */}
      {value && type === 'image' && (
        <div className="border rounded-lg p-2">
          <img 
            src={value} 
            alt="Preview" 
            className="max-h-32 mx-auto rounded"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}
      
      {/* Preview for videos */}
      {value && type === 'video' && (
        <div className="overflow-hidden rounded-lg border p-2">
          <VideoEmbed className="h-72 w-full rounded" title="Video preview" url={value} />
        </div>
      )}
    </div>
  );
};
