import React from 'react';
import { ExternalLink } from 'lucide-react';

import { AvatarUpload } from '@/components/shared/AvatarUpload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
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

// Account Settings' profile: the picture, the email (read-only), the name and the username
// with the Public Profile URL it gives.
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
        <CardTitle>Profile Information</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldTitle>Profile Picture</FieldTitle>
            <AvatarUpload
              currentAvatarUrl={profileData.avatar_url}
              onAvatarUpdate={onAvatarUpdate}
              size="lg"
              editable={true}
            />
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                value={profileData.email}
                disabled
                aria-describedby="email-description"
              />
              <FieldDescription id="email-description">Email cannot be changed</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="fullName">Full Name</FieldLabel>
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
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="username">Username</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>@</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="username"
                value={profileData.username}
                onChange={(e) => {
                  const username = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
                  onProfileDataChange((current) => ({ ...current, username }));
                }}
                placeholder="Enter your username"
                aria-describedby="username-description"
              />
            </InputGroup>
            <FieldDescription className="wrap-anywhere" id="username-description">
              Public profile URL:{' '}
              {profilePreviewPath ? (
                <Link
                  href={profilePreviewPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1"
                >
                  {origin}
                  {profilePreviewPath}
                  <ExternalLink aria-hidden="true" className="size-3" />
                </Link>
              ) : (
                `${origin}${buildPublicProfilePath('username')}`
              )}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <Button onClick={onProfileUpdate} disabled={loading}>
          {loading ? 'Updating...' : 'Update Profile'}
        </Button>
      </CardFooter>
    </Card>
  );
};
