import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, User } from 'lucide-react';
import { AvatarUpload } from '@/components/shared/AvatarUpload';
import { buildProfilePreviewPath, buildPublicProfilePath } from '@/lib/routes';
import { USER_NAME_MAX_LENGTH } from '@/lib/schemas/userProfileSchema';

import { Link } from '@/components/navigation/Link';

interface ProfileData {
  email: string;
  fullName: string;
  username: string;
  avatar_url: string;
}

interface ProfileSectionProps {
  profileData: ProfileData;
  // The username the server holds, which the preview links to as stored.
  savedUsername: string | undefined;
  loading: boolean;
  // Takes an updater so a keystroke never overwrites a concurrent avatar change.
  onProfileDataChange: React.Dispatch<React.SetStateAction<ProfileData>>;
  onProfileUpdate: () => void;
  onAvatarUpdate: (url: string) => void;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({
  profileData,
  savedUsername,
  loading,
  onProfileDataChange,
  onProfileUpdate,
  onAvatarUpdate,
}) => {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://serplists.com';
  // The saved username as stored (a legacy one may be mixed case), or the lowercase URL an
  // unsaved edit will have.
  const profilePreviewPath = buildProfilePreviewPath(profileData.username, savedUsername);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Avatar Upload Section */}
        <div className="flex flex-col items-center space-y-2">
          <Label>Profile Picture</Label>
          <AvatarUpload
            currentAvatarUrl={profileData.avatar_url}
            onAvatarUpdate={onAvatarUpdate}
            size="lg"
            editable={true}
          />
        </div>

        <Separator />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={profileData.email}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Email cannot be changed
            </p>
          </div>
          <div>
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={profileData.fullName}
              onChange={(e) => {
                const fullName = e.target.value;
                onProfileDataChange((current) => ({ ...current, fullName }));
              }}
              placeholder="Enter your full name"
              maxLength={USER_NAME_MAX_LENGTH}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="username">Username</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">@</span>
            <Input
              id="username"
              value={profileData.username}
              onChange={(e) => {
                const username = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
                onProfileDataChange((current) => ({ ...current, username }));
              }}
              placeholder="Enter your username"
              className="flex-1"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Public profile URL:{' '}
            {profilePreviewPath ? (
              <Link
                href={profilePreviewPath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {origin}
                {profilePreviewPath}
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : (
              `${origin}${buildPublicProfilePath('username')}`
            )}
          </p>
        </div>

        <Button onClick={onProfileUpdate} disabled={loading}>
          {loading ? 'Updating...' : 'Update Profile'}
        </Button>
      </CardContent>
    </Card>
  );
};
