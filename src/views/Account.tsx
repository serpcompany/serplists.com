'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { toast } from 'sonner';
import { ProfileSection } from '@/components/account/ProfileSection';
import { authClient } from '@/lib/auth-client';
import { SecuritySection } from '@/components/account/SecuritySection';
import { BillingSection } from '@/components/account/BillingSection';
import { AccountOrganizationsSection } from '@/components/account/AccountOrganizationsSection';
import { AgentAccessSection } from '@/components/account/AgentAccessSection';
import { isPersonalRunMcpUiEnabled } from '@/env';
import {
  planAccountUpdate,
  profileFormFromUser,
  saveProfileChanges,
  syncProfileForm,
  type ProfileFormValues,
} from './accountProfileUpdates';
import {
  DashboardContentShell,
  DashboardPageHeader,
  DashboardPageBody,
} from '@/components/dashboard/DashboardContentShell';

const Account = () => {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<ProfileFormValues>(() =>
    profileFormFromUser(user ?? {}),
  );
  const lastServerValuesRef = useRef<{ userId: string; values: ProfileFormValues } | null>(
    user ? { userId: user.id, values: profileFormFromUser(user) } : null,
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    const server = profileFormFromUser(user);
    const previous = lastServerValuesRef.current;
    const baselineOfThisUser = previous?.userId === user.id ? previous.values : null;
    lastServerValuesRef.current = { userId: user.id, values: server };
    setProfileData((current) => syncProfileForm(current, baselineOfThisUser, server));
  }, [user]);

  const handleProfileUpdate = async () => {
    if (!user) return;

    const plan = planAccountUpdate(profileData, user);
    if (!plan.ok) {
      toast.error(plan.error);
      return;
    }
    const { updates } = plan;

    setLoading(true);
    try {
      if (Object.keys(updates).length === 0) {
        toast.message('No profile changes to save');
        return;
      }

      const result = await saveProfileChanges(updates, {
        updateUser: (changes) => authClient.updateUser(changes),
        onSaved: () => {
          if (lastServerValuesRef.current) {
            lastServerValuesRef.current = {
              userId: lastServerValuesRef.current.userId,
              values: {
                ...lastServerValuesRef.current.values,
                fullName: profileData.fullName,
                username: profileData.username,
              },
            };
          }
        },
        refreshProfile,
        refreshTemplateOwnerData: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
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

  const runKeysEnabled = isPersonalRunMcpUiEnabled();

  return (
    <DashboardContentShell width="narrow">
      <DashboardPageHeader
        title="Account Settings"
        description={`${runKeysEnabled ? 'Your profile, sign-in, Run Keys and Personal billing.' : 'Your profile, sign-in and Personal billing.'} They stay yours in every context.`}
      />
      <DashboardPageBody>
        <ProfileSection
          profileData={profileData}
          savedUsername={user?.username}
          loading={loading}
          onProfileDataChange={setProfileData}
          onProfileUpdate={handleProfileUpdate}
          onAvatarUpdate={handleAvatarUpdate}
        />

        <BillingSection />

        {runKeysEnabled ? <AgentAccessSection /> : null}

        <AccountOrganizationsSection />

        <SecuritySection />
      </DashboardPageBody>
    </DashboardContentShell>
  );
};

export default Account;
