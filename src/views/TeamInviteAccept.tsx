'use client';

import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Users } from 'lucide-react';
import { toast } from 'sonner';

import { AuthCard } from '@/components/auth/AuthCard';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  describeTeamInviteError,
  formatTeamRole,
  isInviteEmailMismatch,
} from '@/features/teams/teamInviteMessages';
import { useTeamInviteLink } from '@/features/teams/useTeamInviteLink';
import { withReturnPath } from '@/lib/auth/returnPath';
import { organizationConsole, PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import { signOutAndReturn } from '@/features/auth/signOut';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { useCurrentPath } from '@/lib/navigation/useCurrentPath';
import {
  buildConsoleSettingsPath,
  buildConsoleTemplatesPath,
  buildLoginPath,
  buildRegisterPath,
} from '@/lib/routes';
import { createSingleFlight } from '@/lib/utils/singleFlight';

import { Link } from '@/components/navigation/Link';

function StatusLine({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      {icon}
      {children}
    </p>
  );
}

function InviteActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

function InviteError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{message}</AlertTitle>
    </Alert>
  );
}

export default function TeamInviteAccept() {
  const { token } = useParams<{ token: string }>();
  const router = useAppRouter();
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const { consoleContext } = useWorkspace();
  const invite = useTeamInviteLink(token, !isLoading && isAuthenticated ? (user?.id ?? null) : null);
  const preview = invite.preview;
  const invitePath = useCurrentPath();
  const [signOutFlight] = useState(() => createSingleFlight());
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleAccept = async () => {
    const result = await invite.accept().catch(() => null);
    if (result) {
      toast.success('Organization invite accepted');
    }
  };

  const handleDecline = async () => {
    await invite.decline().catch(() => null);
  };

  const handleSignOutAndContinue = () =>
    signOutFlight.run(async () => {
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
    router.push(buildConsoleTemplatesPath(organizationConsole(teamId)));
  };

  const renderJoined = (teamId: string, teamName: string, message: string) => (
    <>
      <StatusLine icon={<CheckCircle2 aria-hidden="true" className="size-4 text-foreground" />}>
        {message}
      </StatusLine>
      <InviteActions>
        <Button onClick={() => handleSwitch(teamId)}>Switch to {teamName}</Button>
        <Button variant="outline" onClick={() => router.push(buildConsoleSettingsPath(organizationConsole(teamId)))}>
          Organization settings
        </Button>
      </InviteActions>
    </>
  );

  const renderDeclined = (teamName: string) => (
    <>
      <p className="text-center text-sm text-muted-foreground">
        Invite declined. You did not join {teamName}.
      </p>
      <InviteActions>
        <Link
          href={buildConsoleTemplatesPath(consoleContext)}
          className={buttonVariants({ variant: 'outline' })}
        >Open templates</Link>
      </InviteActions>
    </>
  );

  const renderEmailMismatch = () => (
    <>
      <p className="text-center text-sm text-muted-foreground">
        {user?.email ? (
          <>
            You&apos;re signed in as <span className="font-medium text-foreground">{user.email}</span>.{' '}
          </>
        ) : null}
        This invite was sent to a different email address. Sign out, then log in or create an
        account with the invited email address to accept it.
      </p>
      <InviteActions>
        <Button disabled={isSigningOut} onClick={() => void handleSignOutAndContinue()}>
          {isSigningOut ? 'Signing out...' : 'Sign out and continue'}
        </Button>
      </InviteActions>
    </>
  );

  const renderBody = () => {
    if (!token) {
      return <p className="text-center text-sm text-muted-foreground">This invite link is missing a token.</p>;
    }

    if (isLoading) {
      return <StatusLine icon={<Spinner />}>Checking your session...</StatusLine>;
    }

    if (!isAuthenticated) {
      return (
        <>
          <p className="text-center text-sm text-muted-foreground">
            Log in with the invited email address to see and accept this invite. New here?
            Create an account with that email address.
          </p>
          <InviteActions>
            <Link href={withReturnPath(buildLoginPath(), invitePath)} className={buttonVariants()}>
              Log in to accept
            </Link>
            <Link
              href={withReturnPath(buildRegisterPath(), invitePath)}
              className={buttonVariants({ variant: 'outline' })}
            >
              Create an account
            </Link>
          </InviteActions>
        </>
      );
    }

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
          <InviteError message={describeTeamInviteError(invite.previewError)} />
          <InviteActions>
            <Link
              href={buildConsoleSettingsPath(PERSONAL_CONSOLE)}
              className={buttonVariants({ variant: 'outline' })}
            >Open settings</Link>
          </InviteActions>
        </>
      );
    }

    if (!preview) {
      return <StatusLine icon={<Spinner />}>Loading invite...</StatusLine>;
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
        <div className="flex flex-col gap-1 text-center">
          <p className="text-base font-medium wrap-anywhere text-foreground">{preview.teamName}</p>
          <p className="text-sm text-muted-foreground">
            {inviter} invited you to join as {formatTeamRole(preview.role)}.
          </p>
          <p className="text-xs text-muted-foreground">
            Accepting does not change your current context. Switch to the Organization when
            you want to work in it.
          </p>
        </div>
        <InviteActions>
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
        </InviteActions>
        {responseError ? <InviteError message={describeTeamInviteError(responseError)} /> : null}
      </>
    );
  };

  return (
    <AuthCard icon={<Users />} title="Organization Invite">
      <div className="flex flex-col gap-4">{renderBody()}</div>
    </AuthCard>
  );
}
