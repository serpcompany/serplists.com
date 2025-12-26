import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/ui/file-upload";
import { Image, Video, File } from "lucide-react";

interface MediaContentEditorProps {
  type: 'image' | 'video' | 'file';
  value: string;
  fileName?: string;
  onValueChange: (value: string) => void;
  onFileInfoChange: (fileName?: string, fileSize?: number) => void;
}

export const MediaContentEditor = ({ 
  type, 
  value, 
  fileName, 
  onValueChange, 
  onFileInfoChange 
}: MediaContentEditorProps) => {
  const getIcon = () => {
    switch (type) {
      case 'image': return <Image className="h-4 w-4" />;
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
        onValueChange={onValueChange}
        onFileInfoChange={onFileInfoChange}
      />
    </div>
  );
};