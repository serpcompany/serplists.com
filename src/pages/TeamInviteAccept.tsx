import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { acceptTeamInviteForWorkspace } from '@/features/teams/acceptTeamInvite';
import {
  buildConsoleSettingsPath,
  buildConsoleTemplatesPath,
} from '@/lib/routes';

const INVITE_ACCEPT_TIMEOUT_MS = 15_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

export default function TeamInviteAccept() {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const { refreshTeams, rememberTeam, selectWorkspace } = useWorkspace();
  const [status, setStatus] = useState<'idle' | 'accepting' | 'accepted' | 'error'>('idle');
  const [error, setError] = useState('');
  const startedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      isLoading ||
      !isAuthenticated ||
      !token ||
      startedTokenRef.current === token
    ) {
      return;
    }

    let cancelled = false;
    startedTokenRef.current = token;

    const acceptInvite = async () => {
      setStatus('accepting');
      try {
        await withTimeout(
          acceptTeamInviteForWorkspace(token, {
            refreshTeams,
            rememberTeam,
            selectWorkspace,
          }),
          INVITE_ACCEPT_TIMEOUT_MS,
          'Invite acceptance is taking longer than expected. Refresh this page and try again.',
        );

        if (cancelled) {
          return;
        }

        setStatus('accepted');
        toast.success('Team invite accepted');
      } catch (inviteError) {
        if (cancelled) {
          return;
        }
        setStatus('error');
        startedTokenRef.current = null;
        setError(
          inviteError instanceof Error
            ? inviteError.message
            : 'Unable to accept this invite.',
        );
      }
    };

    void acceptInvite();

    return () => {
      cancelled = true;
    };
  }, [
    isAuthenticated,
    isLoading,
    refreshTeams,
    rememberTeam,
    selectWorkspace,
    token,
  ]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Invite
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!token ? (
            <p className="text-sm text-muted-foreground">
              This invite link is missing a token.
            </p>
          ) : isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking your session...
            </div>
          ) : !isAuthenticated ? (
            <>
              <p className="text-sm text-muted-foreground">
                Log in with the invited email address to join this team.
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
          ) : status === 'accepted' ? (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Invite accepted.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate(buildConsoleTemplatesPath())}>
                  Open templates
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(buildConsoleSettingsPath())}
                >
                  Team settings
                </Button>
              </div>
            </>
          ) : status === 'error' ? (
            <>
              <p className="text-sm text-destructive">{error}</p>
              <Button asChild variant="outline">
                <Link to={buildConsoleSettingsPath()}>Open settings</Link>
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Accepting invite...
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
