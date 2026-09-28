import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { toast } from 'sonner';
import { ProfileSection } from '@/components/account/ProfileSection';
import { authClient } from '@/lib/auth-client';
import { SecuritySection } from '@/components/account/SecuritySection';
import { BillingSection } from '@/components/account/BillingSection';
import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import { LeaveOrganizationCard } from '@/components/account/LeaveOrganizationCard';
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
  DashboardScrollArea,
} from '@/components/dashboard/DashboardContentShell';

const Account = () => {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<ProfileFormValues>(() =>
    profileFormFromUser(user ?? {}),
  );
  // The server values the form last loaded or saved for this user. Fields that
  // differ from it are unsaved edits, which a session refresh (for example
  // after an avatar upload) must not overwrite.
  const baselineRef = useRef<{ userId: string; values: ProfileFormValues } | null>(
    user ? { userId: user.id, values: profileFormFromUser(user) } : null,
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    const server = profileFormFromUser(user);
    const previous = baselineRef.current;
    // A different account starts from scratch.
    const baseline = previous?.userId === user.id ? previous.values : null;
    baselineRef.current = { userId: user.id, values: server };
    setProfileData((current) => syncProfileForm(current, baseline, server));
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
        // The saved values become the baseline, so the refreshed user replaces
        // them with the server's (possibly normalized) values.
        onSaved: () => {
          if (baselineRef.current) {
            baselineRef.current = {
              userId: baselineRef.current.userId,
              values: {
                ...baselineRef.current.values,
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

        <LeaveOrganizationCard />

        <SecuritySection />
        </div>
      </DashboardScrollArea>
    </DashboardContentShell>
  );
};

export default Account;
