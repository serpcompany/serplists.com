import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import {
  describeTeamInviteError,
  formatTeamRole,
} from '@/features/teams/teamInviteMessages';
import { useTeamInviteLink } from '@/features/teams/useTeamInviteLink';
import {
  buildConsoleSettingsPath,
  buildConsoleTemplatesPath,
} from '@/lib/routes';

// Opening an invite link only shows what the invite is. Joining takes a click
// on Accept, and switching the active context takes another on "Switch to".
export default function TeamInviteAccept() {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const invite = useTeamInviteLink(token, !isLoading && isAuthenticated);
  const preview = invite.preview;

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

  const handleSwitch = (teamId: string) => {
    invite.switchToOrganization(teamId);
    navigate(buildConsoleTemplatesPath());
  };

  const renderJoined = (teamId: string, teamName: string, message: string) => (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-success" />
        {message}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => handleSwitch(teamId)}>Switch to {teamName}</Button>
        <Button variant="outline" onClick={() => navigate(buildConsoleSettingsPath())}>
          Organization settings
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
      return (
        <>
          <p className="text-sm text-muted-foreground">
            Log in with the invited email address to see and accept this invite.
          </p>
          <Button asChild>
            <Link
              to="/login"
              state={{
                from: {
                  hash: location.hash,
                  pathname: location.pathname,
                  search: location.search,
                },
              }}
            >
              Log in to accept
            </Link>
          </Button>
        </>
      );
    }

    if (invite.previewError) {
      return (
        <>
          <p className="text-sm text-destructive">{describeTeamInviteError(invite.previewError)}</p>
          <Button asChild variant="outline">
            <Link to={buildConsoleSettingsPath()}>Open settings</Link>
          </Button>
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

    if (invite.isAccepted) {
      return renderJoined(preview.teamId, preview.teamName, 'Invite accepted.');
    }

    if (preview.status === 'already_member') {
      return renderJoined(
        preview.teamId,
        preview.teamName,
        `You're already a member of ${preview.teamName}.`,
      );
    }

    if (invite.isDeclined) {
      return (
        <>
          <p className="text-sm text-muted-foreground">
            Invite declined. You did not join {preview.teamName}.
          </p>
          <Button asChild variant="outline">
            <Link to={buildConsoleTemplatesPath()}>Open templates</Link>
          </Button>
        </>
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
            You stay in your Personal context after accepting. Switch to the Organization
            when you want to work in it.
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
