import { Label } from "@/components/ui/label";
import { FileUpload, type FileUploadChange } from "@/components/ui/file-upload";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import type { UploadResult } from "@/lib/utils/fileUpload";
import { File, ImageIcon, Video } from "lucide-react";

interface MediaContentEditorProps {
  type: 'image' | 'video' | 'file';
  value: string;
  fileName?: string;
  onValueChange: (value: string) => void;
  onFileChange: (change: FileUploadChange) => void;
  onUploadStart?: (upload: Promise<UploadResult>) => void;
}

export const MediaContentEditor = ({ 
  type, 
  value, 
  fileName, 
  onValueChange, 
  onFileChange,
  onUploadStart,
}: MediaContentEditorProps) => {
  // Uploads go to the signed-in user's folder.
  const { user } = useAuth();

  const getIcon = () => {
    switch (type) {
      case 'image': return <ImageIcon className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      case 'file': return <File className="h-4 w-4" />;
    }
  };

  const getLabel = () => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div>
      <Label className="flex items-center gap-2 mb-3">
        {getIcon()}
        {getLabel()}
      </Label>
      <FileUpload
        type={type}
        value={value}
        fileName={fileName}
        userId={user?.id}
        onValueChange={onValueChange}
        onFileChange={onFileChange}
        onUploadStart={onUploadStart}
      />
    </div>
  );
};