import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { toast } from 'sonner';
import { ProfileSection } from '@/components/account/ProfileSection';

interface ProfileData {
  email: string;
  fullName: string;
  username: string;
  avatar_url: string;
}

const Account = () => {
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({
    email: user?.email || '',
    fullName: '',
    username: '',
    avatar_url: ''
  });

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    try {
      const { api } = await import('@/lib/api');
      const data = await api.getProfile();
      
      if (data) {
        setProfileData(prev => ({
          ...prev,
          fullName: data.name || '',
          username: data.username || '',
          avatar_url: data.avatar_url || ''
        }));
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleProfileUpdate = async () => {
    if (!user) return;

    // Validate username
    if (profileData.username && profileData.username.length < 3) {
      toast.error('Username must be at least 3 characters long');
      return;
    }
    if (profileData.username && !/^[a-zA-Z0-9]+$/.test(profileData.username)) {
      toast.error('Username can only contain letters and numbers');
      return;
    }
    
    setLoading(true);
    try {
      const { api } = await import('@/lib/api');
      await api.updateProfile({
        name: profileData.fullName,
        avatar_url: profileData.avatar_url,
        username: profileData.username
      });

      // Refresh the profile in AuthContext so avatar updates
      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      if (error instanceof Error && error.message.includes('Username is already taken')) {
        toast.error('Username is already taken. Please choose a different one.');
      } else {
        toast.error('Failed to update profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpdate = (newAvatarUrl: string) => {
    setProfileData(prev => ({
      ...prev,
      avatar_url: newAvatarUrl
    }));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground">Manage your profile</p>
      </div>

      <div className="grid gap-6">
        {/* Profile Section */}
        <ProfileSection
          profileData={profileData}
          loading={loading}
          onProfileDataChange={setProfileData}
          onProfileUpdate={handleProfileUpdate}
          onAvatarUpdate={handleAvatarUpdate}
        />
      </div>
    </div>
  );
};

export default Account;
