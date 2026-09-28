import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, User, X } from "lucide-react";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { getApiErrorMessage } from "@/lib/api-errors";
import { isAllowedUpload, uploadAcceptAttribute } from "@/lib/schemas/uploadTypes";
import { deleteUploadedAsset } from "@/lib/utils/fileUpload";

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
  const { user, refreshProfile } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
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
    const input = event.target;
    const file = input.files?.[0];
    // A file input fires no change event when the same file is picked again, so it is
    // cleared at once (the File is already held) and every attempt below can be retried.
    input.value = "";
    if (!file || !user) return;

    if (!isAllowedUpload("avatars", file)) {
      toast.error("Please select a PNG, JPEG, WebP, or GIF image");
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
      // authClient resolves with { error } on HTTP failures (429, 5xx) rather than throwing.
      const result = await authClient.updateUser({ image: upload.url });
      if (result?.error) {
        // The account still uses the current avatar: keep it, and drop the new file.
        await deleteUploadedAsset(upload.url);
        toast.error(result.error.message || "Failed to update avatar. Please try again.");
        return;
      }

      // Only now does nothing use the old file.
      if (currentAvatarUrl && currentAvatarUrl !== upload.url) {
        await deleteUploadedAsset(currentAvatarUrl);
      }
      await refreshProfile();
      toast.success("Avatar updated successfully!");
      onAvatarUpdate?.(upload.url);
    } catch (error) {
      // A thrown update (network failure) may still have been applied, so no file is
      // deleted here: never the current avatar, and not the new upload either.
      console.error('Error uploading avatar:', error);
      toast.error(getApiErrorMessage(error, "Failed to upload avatar"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user || !currentAvatarUrl) return;

    setIsRemoving(true);

    try {
      const result = await authClient.updateUser({ image: null });
      if (result?.error) {
        toast.error(result.error.message || "Failed to remove avatar. Please try again.");
        return;
      }

      await deleteUploadedAsset(currentAvatarUrl);
      await refreshProfile();
      toast.success("Avatar removed successfully!");
      onAvatarUpdate?.("");
    } catch (error) {
      console.error('Error removing avatar:', error);
      toast.error("Failed to remove avatar");
    } finally {
      setIsRemoving(false);
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
            className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full shadow-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={handleFileSelect}
            disabled={isUploading || isRemoving}
            aria-label="Upload avatar"
          >
            {isUploading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </Button>

          {currentAvatarUrl ? (
            <Button
              variant="outline"
              size="icon"
              className="absolute -bottom-2 -left-2 h-8 w-8 rounded-full shadow-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              onClick={handleRemoveAvatar}
              disabled={isUploading || isRemoving}
              aria-label="Remove avatar"
            >
              {isRemoving ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </Button>
          ) : null}
          
          <input
            ref={fileInputRef}
            type="file"
            accept={uploadAcceptAttribute("avatars")}
            onChange={handleFileUpload}
            disabled={isUploading || isRemoving}
            className="hidden"
          />
        </>
      )}
    </div>
  );
};
