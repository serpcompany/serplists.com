import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, User, X } from "lucide-react";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { getApiErrorMessage } from "@/lib/api-errors";
import { isAllowedUpload, uploadAcceptAttribute } from "@/lib/schemas/uploadTypes";
import { deleteUploadedAsset, uploadAvatar } from "@/lib/utils/fileUpload";

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
    sm: "size-12",
    md: "size-16",
    lg: "size-20"
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !user) return;

    if (!isAllowedUpload("avatars", file)) {
      toast.error("Please select a PNG, JPEG, WebP, or GIF image");
      return;
    }

    setIsUploading(true);

    try {
      const upload = await uploadAvatar(file);
      const result = await authClient.updateUser({ image: upload.url });
      if (result?.error) {
        await deleteUploadedAsset(upload.url);
        toast.error(result.error.message || "Failed to update avatar. Please try again.");
        return;
      }

      if (currentAvatarUrl && currentAvatarUrl !== upload.url) {
        await deleteUploadedAsset(currentAvatarUrl);
      }
      await refreshProfile();
      toast.success("Avatar updated successfully!");
      onAvatarUpdate?.(upload.url);
    } catch (error) {
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
    <div className="flex flex-wrap items-center gap-4">
      <Avatar className={sizeClasses[size]}>
        <AvatarImage src={currentAvatarUrl || undefined} />
        <AvatarFallback>
          <User className="size-1/2" />
        </AvatarFallback>
      </Avatar>

      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFileSelect}
            disabled={isUploading || isRemoving}
            aria-label="Upload avatar"
          >
            {isUploading ? <Spinner data-icon="inline-start" /> : <Camera data-icon="inline-start" />}
            Upload avatar
          </Button>

          {currentAvatarUrl ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemoveAvatar}
              disabled={isUploading || isRemoving}
              aria-label="Remove avatar"
            >
              {isRemoving ? <Spinner data-icon="inline-start" /> : <X data-icon="inline-start" />}
              Remove avatar
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
        </div>
      )}
    </div>
  );
};
