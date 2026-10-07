import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { getOrganizationNameError, ORGANIZATION_NAME_MAX } from '@/lib/schemas/nameLimits';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { acceptIncomingTeamInvite } from '@/features/teams/teamSettingsRequests';
import { useIncomingTeamInvites } from '@/features/teams/useTeamSettingsQueries';
import { IncomingInviteList, OrganizationList } from '@/components/account/OrganizationChoices';
import { QueryErrorNotice } from '@/components/shared/QueryListState';

export function AccountOrganizationsSection() {
  const {
    createTeam,
    refreshTeams,
    rememberTeam,
    retryWorkspace,
    selectWorkspace,
    teams = [],
    teamsUnavailable,
  } = useWorkspace();
  const [teamName, setTeamName] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [acceptingIncomingInviteId, setAcceptingIncomingInviteId] = useState<string | null>(null);
  const { incomingInvitesQuery, reloadIncomingInvites } = useIncomingTeamInvites();
  const incomingInvites = incomingInvitesQuery.data ?? [];

  const handleCreateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = teamName.trim();
    const nameError = getOrganizationNameError(name);
    if (nameError) {
      toast.error(nameError);
      return;
    }

    setIsCreatingTeam(true);
    try {
      await createTeam({
        name,
        slug: teamSlug.trim() || undefined,
      });
      setTeamName('');
      setTeamSlug('');
      toast.success('Organization created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create Organization');
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const handleAcceptIncomingInvite = async (inviteId: string) => {
    setAcceptingIncomingInviteId(inviteId);
    try {
      const acceptedInvite = await acceptIncomingTeamInvite(inviteId);

      if (acceptedInvite.team) {
        rememberTeam(acceptedInvite.team);
      }

      selectWorkspace(acceptedInvite.teamId);
      await reloadIncomingInvites();
      void refreshTeams().catch(() => undefined);
      toast.success('Organization invite accepted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to accept invite');
      await reloadIncomingInvites().catch(() => undefined);
    } finally {
      setAcceptingIncomingInviteId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Organizations</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {incomingInvites.length > 0 ? (
          <IncomingInviteList
            acceptingInviteId={acceptingIncomingInviteId}
            invites={incomingInvites}
            onAccept={(inviteId) => void handleAcceptIncomingInvite(inviteId)}
          />
        ) : null}

        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={handleCreateTeam}>
          <Field>
            <FieldLabel htmlFor="team-name">Organization name</FieldLabel>
            <Input
              id="team-name"
              maxLength={ORGANIZATION_NAME_MAX}
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Agency operations"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="team-slug">Slug</FieldLabel>
            <Input
              id="team-slug"
              value={teamSlug}
              onChange={(event) => setTeamSlug(event.target.value)}
              placeholder="agency-ops"
            />
          </Field>
          <Button type="submit" disabled={isCreatingTeam}>
            {isCreatingTeam ? 'Creating...' : 'Create Organization'}
          </Button>
        </form>

        {teamsUnavailable ? (
          <QueryErrorNotice message="Couldn't load your Organizations." onRetry={retryWorkspace} />
        ) : null}

        {teams.length > 0 ? <OrganizationList onSelect={selectWorkspace} teams={teams} /> : null}

        <Separator />

        {teamsUnavailable ? null : (
          <p className="text-sm text-muted-foreground">
            Create or select an Organization to share templates and runs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
