import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { toast } from 'sonner';
import { ProfileSection } from '@/components/account/ProfileSection';
import { authClient } from '@/lib/auth-client';
import { getAuthErrorMessage } from '@/lib/auth/authErrors';
import { SecuritySection } from '@/components/account/SecuritySection';
import { BillingSection } from '@/components/account/BillingSection';
import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import { AgentAccessSection } from '@/components/account/AgentAccessSection';
import { isPersonalRunMcpUiEnabled } from '@/env';
import { buildAccountUpdatePayload } from './accountProfileUpdates';
import {
  DashboardContentShell,
  DashboardPageHeader,
  DashboardScrollArea,
} from '@/components/dashboard/DashboardContentShell';

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
      const updates = buildAccountUpdatePayload(profileData, user);

      if (Object.keys(updates).length === 0) {
        toast.message('No profile changes to save');
        return;
      }

      const result = await authClient.updateUser(updates);
      if (result?.error) {
        toast.error(getAuthErrorMessage(result.error, 'Failed to update profile'));
        return;
      }

      await refreshProfile();
      await loadProfile();
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
    <DashboardContentShell>
      <DashboardPageHeader
        title="Account Settings"
        description="Manage your profile, billing, and security settings."
      />
      <DashboardScrollArea>
        <div className="mx-auto grid max-w-4xl gap-6">
        {/* Profile Section */}
        <ProfileSection
          profileData={profileData}
          loading={loading}
          onProfileDataChange={setProfileData}
          onProfileUpdate={handleProfileUpdate}
          onAvatarUpdate={handleAvatarUpdate}
        />

        <BillingSection />

        {isPersonalRunMcpUiEnabled() ? <AgentAccessSection /> : null}

        <TeamSettingsSection />

        <SecuritySection />
        </div>
      </DashboardScrollArea>
    </DashboardContentShell>
  );
};

export default Account;
