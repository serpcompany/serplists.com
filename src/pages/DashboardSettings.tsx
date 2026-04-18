import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import {
  Camera,
  Download,
  Globe,
  Link as LinkIcon,
  Mail,
  Shield,
  Trash2,
  User,
  Bell,
} from 'lucide-react';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { authClient } from '@/lib/auth-client';
import { buildAccountUpdatePayload } from '@/pages/accountProfileUpdates';
import { api } from '@/lib/api';
import { buildPublicProfilePath } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type ProfileState = {
  avatarUrl: string;
  bio: string;
  email: string;
  fullName: string;
  twitter: string;
  username: string;
  website: string;
};

type NotificationState = {
  emailDigest: boolean;
  marketingEmails: boolean;
  runReminders: boolean;
  templateCopies: boolean;
};

type PrivacyState = {
  profilePublic: boolean;
  showEmail: boolean;
  showStats: boolean;
};

const initialNotifications: NotificationState = {
  emailDigest: true,
  runReminders: true,
  templateCopies: true,
  marketingEmails: false,
};

const initialPrivacy: PrivacyState = {
  profilePublic: true,
  showEmail: false,
  showStats: true,
};

const validateUsername = (username: string): string | null => {
  const trimmed = username.trim();

  if (trimmed && trimmed.length < 3) {
    return 'Username must be at least 3 characters long';
  }

  if (trimmed && !/^[a-zA-Z0-9]+$/.test(trimmed)) {
    return 'Username can only contain letters and numbers';
  }

  return null;
};

export default function DashboardSettings() {
  const { user, refreshProfile } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileState>({
    avatarUrl: user?.image || '',
    bio: '',
    email: user?.email || '',
    fullName: user?.name || '',
    twitter: '',
    username: user?.username || '',
    website: '',
  });
  const [notifications, setNotifications] = useState<NotificationState>(
    initialNotifications,
  );
  const [privacy, setPrivacy] = useState<PrivacyState>(initialPrivacy);

  const profileInitials = useMemo(() => {
    const source = profile.fullName.trim() || profile.username.trim();
    const initials = source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');

    return initials || 'U';
  }, [profile.fullName, profile.username]);

  useEffect(() => {
    const syncProfile = async () => {
      if (!user) return;

      const session = await authClient.getSession();
      const data = session?.data?.user;

      if (!data) return;

      setProfile((current) => ({
        ...current,
        avatarUrl: (data as { image?: string | null }).image || current.avatarUrl,
        email: data.email || current.email,
        fullName: data.name || current.fullName,
        username: (data as { username?: string }).username || current.username,
      }));
    };

    void syncProfile();
  }, [user]);

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    try {
      const upload = await api.uploadToR2({ bucket: 'avatars', file });
      await authClient.updateUser({ image: upload.url });
      await refreshProfile();
      setProfile((current) => ({ ...current, avatarUrl: upload.url }));
      toast.success('Avatar updated successfully');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload avatar');
    } finally {
      event.target.value = '';
    }
  };

  const handleProfileSave = async () => {
    if (!user) return;

    const usernameError = validateUsername(profile.username);
    if (usernameError) {
      toast.error(usernameError);
      return;
    }

    setLoading(true);
    try {
      const updates = buildAccountUpdatePayload(
        {
          avatar_url: profile.avatarUrl,
          fullName: profile.fullName,
          username: profile.username,
        },
        {
          image: user.image || '',
          name: user.name || '',
          username: user.username || '',
        },
      );

      if (Object.keys(updates).length > 0) {
        const result = await authClient.updateUser(updates);
        if (result?.error) {
          toast.error(result.error.message || 'Failed to update profile');
          return;
        }

        await refreshProfile();
      } else {
        toast.message('No profile changes to save');
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

  const handleNotificationSave = () => {
    toast.success('Notification preferences saved');
  };

  const handlePrivacySave = () => {
    toast.success('Privacy settings updated');
  };

  const handleExportData = () => {
    toast.success('Export started. You will receive an email with your data.');
  };

  const handleDeleteAccount = () => {
    toast.error('Account deletion requires email confirmation');
  };

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://serplists.com';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="h-auto justify-start gap-0 rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="profile"
            className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <User className="mr-2 h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger
            value="privacy"
            className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Shield className="mr-2 h-4 w-4" />
            Privacy
          </TabsTrigger>
          <TabsTrigger
            value="data"
            className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Download className="mr-2 h-4 w-4" />
            Data
          </TabsTrigger>
        </TabsList>

        <TabsContent forceMount value="profile" className="space-y-6">
          <Card className="border-border bg-card shadow-none">
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your profile details and public information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative">
                  <Avatar className="h-20 w-20 border border-border bg-secondary">
                    <AvatarImage src={profile.avatarUrl || undefined} />
                    <AvatarFallback className="bg-secondary text-lg font-medium text-foreground">
                      {profileInitials}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full shadow-lg"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-border"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Change Photo
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    JPG, PNG or GIF. Max 5MB.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={profile.fullName}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        fullName: event.target.value,
                      }))
                    }
                    className="border-border bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      @
                    </span>
                    <Input
                      id="username"
                      value={profile.username}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          username: event.target.value.replace(/[^a-zA-Z0-9]/g, ''),
                        }))
                      }
                      className="border-border bg-muted pl-8"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    disabled
                    className="border-border bg-muted pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={profile.bio}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      bio: event.target.value,
                    }))
                  }
                  rows={3}
                  className="resize-none border-border bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Brief description for your profile. Max 160 characters.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="website"
                      value={profile.website}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          website: event.target.value,
                        }))
                      }
                      className="border-border bg-muted pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="twitter">Twitter</Label>
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="twitter"
                      value={profile.twitter}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          twitter: event.target.value,
                        }))
                      }
                      className="border-border bg-muted pl-10"
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Public profile URL:{' '}
                <a
                  href={buildPublicProfilePath(profile.username || 'username')}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    'inline-flex items-center gap-1 text-primary hover:underline',
                    !profile.username && 'pointer-events-none text-muted-foreground',
                  )}
                >
                  {origin}
                  {profile.username ? buildPublicProfilePath(profile.username) : '/profile/username'}
                </a>
              </p>

              <Button
                onClick={handleProfileSave}
                disabled={loading}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                {loading ? 'Updating...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent forceMount value="notifications" className="space-y-6">
          <Card className="border-border bg-card shadow-none">
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>
                Choose what notifications you receive via email.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">Weekly Digest</p>
                  <p className="text-sm text-muted-foreground">
                    Receive a weekly summary of your activity
                  </p>
                </div>
                <Switch
                  checked={notifications.emailDigest}
                  onCheckedChange={(checked) =>
                    setNotifications((current) => ({
                      ...current,
                      emailDigest: checked,
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">Run Reminders</p>
                  <p className="text-sm text-muted-foreground">
                    Reminders for incomplete runs
                  </p>
                </div>
                <Switch
                  checked={notifications.runReminders}
                  onCheckedChange={(checked) =>
                    setNotifications((current) => ({
                      ...current,
                      runReminders: checked,
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">Template Copies</p>
                  <p className="text-sm text-muted-foreground">
                    Notify when someone copies your public template
                  </p>
                </div>
                <Switch
                  checked={notifications.templateCopies}
                  onCheckedChange={(checked) =>
                    setNotifications((current) => ({
                      ...current,
                      templateCopies: checked,
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">Marketing Emails</p>
                  <p className="text-sm text-muted-foreground">
                    Updates about new features and tips
                  </p>
                </div>
                <Switch
                  checked={notifications.marketingEmails}
                  onCheckedChange={(checked) =>
                    setNotifications((current) => ({
                      ...current,
                      marketingEmails: checked,
                    }))
                  }
                />
              </div>

              <Button
                onClick={handleNotificationSave}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                Save Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent forceMount value="privacy" className="space-y-6">
          <Card className="border-border bg-card shadow-none">
            <CardHeader>
              <CardTitle>Privacy Settings</CardTitle>
              <CardDescription>
                Control what information is visible to others.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">Public Profile</p>
                  <p className="text-sm text-muted-foreground">
                    Allow others to view your profile page
                  </p>
                </div>
                <Switch
                  checked={privacy.profilePublic}
                  onCheckedChange={(checked) =>
                    setPrivacy((current) => ({
                      ...current,
                      profilePublic: checked,
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">Show Email</p>
                  <p className="text-sm text-muted-foreground">
                    Display your email on your public profile
                  </p>
                </div>
                <Switch
                  checked={privacy.showEmail}
                  onCheckedChange={(checked) =>
                    setPrivacy((current) => ({
                      ...current,
                      showEmail: checked,
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">Show Statistics</p>
                  <p className="text-sm text-muted-foreground">
                    Display template and run statistics on your profile
                  </p>
                </div>
                <Switch
                  checked={privacy.showStats}
                  onCheckedChange={(checked) =>
                    setPrivacy((current) => ({
                      ...current,
                      showStats: checked,
                    }))
                  }
                />
              </div>

              <Button
                onClick={handlePrivacySave}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent forceMount value="data" className="space-y-6">
          <Card className="border-border bg-card shadow-none">
            <CardHeader>
              <CardTitle>Export Data</CardTitle>
              <CardDescription>
                Download all your templates and run data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                <div>
                  <p className="font-medium text-foreground">Export All Data</p>
                  <p className="text-sm text-muted-foreground">
                    Includes templates, runs, and account info
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleExportData}
                  className="border-border"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/50 bg-card shadow-none">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Permanently delete your account and all associated data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 p-4">
                <div>
                  <p className="font-medium text-foreground">Delete Account</p>
                  <p className="text-sm text-muted-foreground">
                    This action cannot be undone
                  </p>
                </div>
                <Button variant="destructive" onClick={handleDeleteAccount}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
