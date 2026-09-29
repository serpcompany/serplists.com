'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { createSingleFlight } from '@/features/teams/singleFlight';
import {
  describeTeamInviteError,
  formatTeamRole,
  isInviteEmailMismatch,
} from '@/features/teams/teamInviteMessages';
import { useTeamInviteLink } from '@/features/teams/useTeamInviteLink';
import { withReturnPath } from '@/lib/auth/returnPath';
import { signOutAndReturn } from '@/features/auth/signOut';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { useCurrentPath } from '@/lib/navigation/useCurrentPath';
import {
  buildConsoleSettingsPath,
  buildConsoleTemplatesPath,
  buildLoginPath,
  buildRegisterPath,
} from '@/lib/routes';

import { Link } from '@/components/navigation/Link';

// Opening an invite link only shows what the invite is. Joining takes a click
// on Accept, and switching the active context takes another on "Switch to".
export default function TeamInviteAccept() {
  const { token } = useParams<{ token: string }>();
  const router = useAppRouter();
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const invite = useTeamInviteLink(token, !isLoading && isAuthenticated ? (user?.id ?? null) : null);
  const preview = invite.preview;
  // Signing in, signing up, or switching accounts all come back to this path.
  const invitePath = useCurrentPath();
  const [signOutOnce] = useState(createSingleFlight);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleAccept = async () => {
    try {
      const result = await invite.accept();
      if (result) {
        toast.success('Organization invite accepted');
      }
    } catch {
      // The error renders below the buttons.
    }
  };

  const handleDecline = async () => {
    try {
      await invite.decline();
    } catch {
      // The error renders below the buttons.
    }
  };

  // Waits for sign-out before opening the login page; otherwise the login page
  // would send the still signed-in account straight back here. A refused
  // sign-out keeps the user here with the error.
  const handleSignOutAndContinue = () =>
    signOutOnce(async () => {
      setIsSigningOut(true);
      try {
        await signOutAndReturn({
          logout,
          navigate: router.push,
          returnPath: invitePath,
          onError: (message) => toast.error(message),
        });
      } finally {
        setIsSigningOut(false);
      }
    });

  const handleSwitch = (teamId: string) => {
    invite.switchToOrganization(teamId);
    router.push(buildConsoleTemplatesPath());
  };

  const renderJoined = (teamId: string, teamName: string, message: string) => (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-foreground" />
        {message}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => handleSwitch(teamId)}>Switch to {teamName}</Button>
        <Button variant="outline" onClick={() => router.push(buildConsoleSettingsPath())}>
          Organization settings
        </Button>
      </div>
    </>
  );

  const renderDeclined = (teamName: string) => (
    <>
      <p className="text-sm text-muted-foreground">
        Invite declined. You did not join {teamName}.
      </p>
      <Link
        href={buildConsoleTemplatesPath()}
        className={buttonVariants({ variant: 'outline' })}
      >Open templates</Link>
    </>
  );

  const renderEmailMismatch = () => (
    <>
      <p className="text-sm text-muted-foreground">
        {user?.email ? (
          <>
            You&apos;re signed in as <span className="font-medium text-foreground">{user.email}</span>.{' '}
          </>
        ) : null}
        This invite was sent to a different email address. Sign out, then log in or create an
        account with the invited email address to accept it.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={isSigningOut} onClick={() => void handleSignOutAndContinue()}>
          {isSigningOut ? 'Signing out...' : 'Sign out and continue'}
        </Button>
      </div>
    </>
  );

  const renderBody = () => {
    if (!token) {
      return <p className="text-sm text-muted-foreground">This invite link is missing a token.</p>;
    }

    if (isLoading) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking your session...
        </div>
      );
    }

    if (!isAuthenticated) {
      // Both links bring the user back here after signing in or signing up.
      return (
        <>
          <p className="text-sm text-muted-foreground">
            Log in with the invited email address to see and accept this invite. New here?
            Create an account with that email address.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={withReturnPath(buildLoginPath(), invitePath)} className={buttonVariants()}>
                Log in to accept
              </Link>
            <Link
              href={withReturnPath(buildRegisterPath(), invitePath)}
              className={buttonVariants({ variant: 'outline' })}
            >
                Create an account
              </Link>
          </div>
        </>
      );
    }

    // An answer this account gave wins over a later preview error: after a decline the
    // invite is revoked, so the preview answers 404.
    if (preview && invite.isAccepted) {
      return renderJoined(preview.teamId, preview.teamName, 'Invite accepted.');
    }

    if (preview && invite.isDeclined) {
      return renderDeclined(preview.teamName);
    }

    if ([invite.previewError, invite.acceptError, invite.declineError].some(isInviteEmailMismatch)) {
      return renderEmailMismatch();
    }

    if (invite.previewError) {
      return (
        <>
          <p className="text-sm text-destructive">{describeTeamInviteError(invite.previewError)}</p>
          <Link
            href={buildConsoleSettingsPath()}
            className={buttonVariants({ variant: 'outline' })}
          >Open settings</Link>
        </>
      );
    }

    if (!preview) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading invite...
        </div>
      );
    }

    if (preview.status === 'already_member') {
      return renderJoined(
        preview.teamId,
        preview.teamName,
        `You're already a member of ${preview.teamName}.`,
      );
    }

    const inviter = preview.inviterName || preview.inviterEmail || 'An Organization admin';
    const responseError = invite.acceptError ?? invite.declineError;

    return (
      <>
        <div className="space-y-1">
          <p className="text-base font-medium text-foreground">{preview.teamName}</p>
          <p className="text-sm text-muted-foreground">
            {inviter} invited you to join as {formatTeamRole(preview.role)}.
          </p>
          <p className="text-xs text-muted-foreground">
            Accepting does not change your current context. Switch to the Organization when
            you want to work in it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={invite.isResponding} onClick={() => void handleAccept()}>
            {invite.isResponding ? 'Responding...' : 'Accept invite'}
          </Button>
          <Button
            variant="outline"
            disabled={invite.isResponding}
            onClick={() => void handleDecline()}
          >
            Decline
          </Button>
        </div>
        {responseError ? (
          <p className="text-sm text-destructive">{describeTeamInviteError(responseError)}</p>
        ) : null}
      </>
    );
  };

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Organization Invite
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">{renderBody()}</CardContent>
      </Card>
    </main>
  );
}
