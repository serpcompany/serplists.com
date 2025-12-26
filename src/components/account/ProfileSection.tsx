import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { User, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AvatarUpload } from '@/components/shared/AvatarUpload';

interface ProfileData {
  email: string;
  fullName: string;
  username: string;
  avatar_url: string;
}

interface ProfileSectionProps {
  profileData: ProfileData;
  loading: boolean;
  onProfileDataChange: (data: ProfileData) => void;
  onProfileUpdate: () => void;
  onAvatarUpdate: (url: string) => void;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({
  profileData,
  loading,
  onProfileDataChange,
  onProfileUpdate,
  onAvatarUpdate
}) => {
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
              onChange={(e) => onProfileDataChange({
                ...profileData,
                fullName: e.target.value
              })} 
              placeholder="Enter your full name" 
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
              onChange={(e) => onProfileDataChange({
                ...profileData,
                username: e.target.value.replace(/[^a-zA-Z0-9]/g, '')
              })} 
              placeholder="Enter your username" 
              className="flex-1" 
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            This will be your public profile URL: {profileData.username && (
              <Link 
                to={`/profile/${profileData.username}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                {window.location.origin}/profile/{profileData.username}
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            {!profileData.username && `${window.location.origin}/profile/username`}
          </p>
        </div>
        
        <Button onClick={onProfileUpdate} disabled={loading}>
          {loading ? 'Updating...' : 'Update Profile'}
        </Button>
      </CardContent>
    </Card>
  );
};
