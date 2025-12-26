import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Upload, User } from "lucide-react";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onAvatarUpdate?: (newAvatarUrl: string) => void;
  size?: "sm" | "md" | "lg";
  editable?: boolean;
}

export const AvatarUpload = ({ 
  currentAvatarUrl, 
  onAvatarUpdate, 
  size = "md", 
  editable = true 
}: AvatarUploadProps) => {
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sizeClasses = {
    sm: "h-12 w-12",
    md: "h-24 w-24",
    lg: "h-32 w-32"
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }

    setIsUploading(true);

    try {
      const upload = await api.uploadToR2({ bucket: 'avatars', file });
      await api.updateProfile({ avatar_url: upload.url });
      toast.success("Avatar updated successfully!");
      onAvatarUpdate?.(upload.url);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error("Failed to upload avatar");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="relative group">
      <Avatar className={`${sizeClasses[size]}`}>
        <AvatarImage src={currentAvatarUrl || undefined} />
        <AvatarFallback>
          <User className="h-1/2 w-1/2" />
        </AvatarFallback>
      </Avatar>
      
      {editable && (
        <>
          <Button
            variant="outline"
            size="icon"
            className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleFileSelect}
            disabled={isUploading}
          >
            {isUploading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </Button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </>
      )}
    </div>
  );
};
