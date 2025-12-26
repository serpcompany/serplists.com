import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { toast } from 'sonner';
import { useDevMode } from '@/hooks/useDevMode';
import { ProfileSection } from '@/components/account/ProfileSection';
import { BillingSection } from '@/components/account/BillingSection';
import { DeveloperSection } from '@/components/account/DeveloperSection';
import { AffiliateStats } from '@/components/affiliate/AffiliateStats';

interface ProfileData {
  email: string;
  fullName: string;
  username: string;
  affiliate_code: string;
  avatar_url: string;
}

interface SubscriptionData {
  subscribed: boolean;
  subscription_tier: string | null;
  subscription_end: string | null;
}

const Account = () => {
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({
    email: user?.email || '',
    fullName: '',
    username: '',
    affiliate_code: '',
    avatar_url: ''
  });
  const [subscription, setSubscription] = useState<SubscriptionData>({
    subscribed: false,
    subscription_tier: null,
    subscription_end: null
  });
  const { devOverride, toggleDevOverride } = useDevMode();

  useEffect(() => {
    if (user) {
      loadProfile();
      checkSubscription();

      // Auto-refresh subscription when page becomes visible
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          checkSubscription();
        }
      };

      // Auto-refresh every 5 minutes
      const intervalId = setInterval(() => {
        checkSubscription();
      }, 5 * 60 * 1000); // 5 minutes

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        clearInterval(intervalId);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
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
          affiliate_code: data.affiliate_code || '',
          avatar_url: data.avatar_url || '',
          ...data // Include affiliate data
        }));
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const checkSubscription = async () => {
    try {
      // TODO: Replace with Cloudflare API call for subscription
      const data = null;
      const error = null;
      // const { data, error } = await api.checkSubscription();
      if (error) throw error;
      if (data) {
        setSubscription(data);
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const testGHLIntegration = async () => {
    try {
      setLoading(true);
      toast.info('Testing GHL integration...');
      
      // TODO: Replace with Cloudflare API call
      const data = null;
      const error = null;
      if (error) throw error;
      
      if (data) {
        setSubscription(data);
        toast.success('GHL integration test completed! Check the logs.');
      }
    } catch (error) {
      console.error('Error testing GHL integration:', error);
      toast.error('GHL integration test failed');
    } finally {
      setLoading(false);
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

  const handleUpgrade = async () => {
    try {
      // TODO: Replace with Cloudflare API call for checkout
      const data = { url: null };
      const error = null;
      // const { data, error } = await api.createCheckout();
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      toast.error('Failed to start checkout process');
    }
  };

  const handleManageSubscription = async () => {
    try {
      // TODO: Replace with Cloudflare API call for customer portal
      const data = { url: null };
      const error = null;
      // const { data, error } = await api.getCustomerPortal();
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast.error('Failed to open subscription management');
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground">Manage your profile and billing preferences</p>
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

        {/* Affiliate Program Section */}
        <AffiliateStats profile={profileData} />

        {/* Billing Section */}
        <BillingSection
          subscription={subscription}
          onUpgrade={handleUpgrade}
          onManageSubscription={handleManageSubscription}
        />

        {/* Developer Settings (only show in development) */}
        {process.env.NODE_ENV === 'development' && (
          <DeveloperSection
            devOverride={devOverride}
            onToggleDevOverride={toggleDevOverride}
            onTestGHLIntegration={testGHLIntegration}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
};

export default Account;