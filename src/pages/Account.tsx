import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { toast } from 'sonner';
import { ProfileSection } from '@/components/account/ProfileSection';
import { authClient } from '@/lib/auth-client';
import { SecuritySection } from '@/components/account/SecuritySection';
import { BillingSection } from '@/components/account/BillingSection';

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
    fullName: user?.name || '',
    username: user?.username || '',
    avatar_url: user?.image || ''
  });

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    try {
      const session = await authClient.getSession();
      const data = session?.data?.user;
      if (data) {
        setProfileData(prev => ({
          ...prev,
          email: data.email || prev.email,
          fullName: data.name || '',
          username: (data as unknown as { username?: string }).username || '',
          avatar_url: (data as unknown as { image?: string | null }).image || ''
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
      const updates: { name?: string; image?: string } = {};
      if (profileData.fullName !== (user.name || '')) updates.name = profileData.fullName;
      if (profileData.avatar_url !== (user.image || '')) updates.image = profileData.avatar_url;

      if (Object.keys(updates).length > 0) {
        await authClient.updateUser(updates);
      }

      if (profileData.username !== (user.username || '')) {
        await authClient.username.updateUser({ username: profileData.username || undefined });
      }

      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
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

        <BillingSection />

        <SecuritySection />
      </div>
    </div>
  );
};

export default Account;
