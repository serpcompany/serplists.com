import React, { useId, useRef, useState } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Textarea } from './textarea';
import { Label } from './label';
import { X, File, Image, Video } from 'lucide-react';
import {
  uploadFile,
  validateFile,
  UploadResult,
} from '@/lib/utils/fileUpload';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useToast } from '@/hooks/use-toast';
import { VideoEmbed } from '@/components/shared/VideoEmbed';

interface FileUploadProps {
  type: 'image' | 'video' | 'file';
  value: string;
  fileName?: string;
  onValueChange: (value: string) => void;
  onFileInfoChange: (fileName?: string, fileSize?: number) => void;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  type,
  value,
  fileName,
  onValueChange,
  onFileInfoChange,
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

  const getAcceptTypes = () => {
    switch (type) {
      case 'image': return 'image/*';
      case 'video': return 'video/*';
      case 'file': return '*/*';
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
      const result: UploadResult = await uploadFile(file, getBucketName(), user.id);
      
      // The replaced file is unlinked, not deleted: saved Templates, versions,
      // Runs and clones may still use it.
      if (result.success && result.url) {
        onValueChange(result.url);
        onFileInfoChange(result.fileName, result.fileSize);
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

  // Unlinks the file only; see the note in handleFileSelect.
  const handleClear = () => {
    onValueChange('');
    onFileInfoChange(undefined, undefined);
  };

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
          {fileName ? (
            <div className="flex items-center justify-between p-2 bg-muted rounded">
              <div className="flex items-center gap-2">
                {getIcon()}
                <span className="text-sm font-medium">
                  {fileName}
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
                accept={getAcceptTypes()}
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
                Max file size: 50MB
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
