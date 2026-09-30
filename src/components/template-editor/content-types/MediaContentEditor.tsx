import { FieldLegend, FieldSet } from "@/components/ui/field";
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
      case 'image': return <ImageIcon className="size-4" />;
      case 'video': return <Video className="size-4" />;
      case 'file': return <File className="size-4" />;
    }
  };

  const getLabel = () => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <FieldSet className="gap-3">
      <FieldLegend className="mb-0 flex items-center gap-2" variant="label">
        {getIcon()}
        {getLabel()}
      </FieldLegend>
      <FileUpload
        type={type}
        value={value}
        fileName={fileName}
        userId={user?.id}
        onValueChange={onValueChange}
        onFileChange={onFileChange}
        onUploadStart={onUploadStart}
      />
    </FieldSet>
  );
};