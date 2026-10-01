import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import type { TeamMember, TeamMemberStatus, TeamRole } from '@/lib/api';
import { getOrganizationNameError, ORGANIZATION_NAME_MAX } from '@/lib/schemas/nameLimits';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { runTeamWrite } from '@/features/teams/runTeamWrite';
import {
  acceptIncomingTeamInvite,
  saveTeamSettings,
  transferTeamOwnership,
  updateTeamMember,
} from '@/features/teams/teamSettingsRequests';
import { getTeamSettingsUpdate } from '@/features/teams/teamSettingsUpdate';
import { useTeamSettingsForm } from '@/features/teams/useTeamSettingsForm';
import { useTeamSettingsQueries } from '@/features/teams/useTeamSettingsQueries';
import { TeamInvitesPanel } from '@/components/account/TeamInvitesPanel';
import { TeamActivityList } from '@/components/account/TeamActivityList';
import { IncomingInviteList, OrganizationList } from '@/components/account/OrganizationChoices';
import { OrganizationMemberList } from '@/components/account/OrganizationMemberList';
import { QueryErrorNotice } from '@/components/shared/QueryListState';
import { formatRole } from '@/components/account/teamSettingsFormat';
import type { AssignableTeamRole } from '@/features/teams/teamInviteLinks';

const roleDescriptions: Record<TeamRole, string> = {
  owner: 'Owns billing, members, settings, templates, and runs.',
  admin: 'Manages members, settings, templates, and runs.',
  editor: 'Creates and edits shared templates and runs.',
  runner: 'Starts and updates runs without editing templates.',
  viewer: 'Views shared templates and runs.',
};


const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;


export function TeamSettingsSection() {
  const {
    activeTeamId,
    activeWorkspace,
    canManageTeam,
    createTeam,
    isTeamWorkspace,
    patchTeam,
    refreshTeams,
    rememberTeam,
    retryWorkspace,
    selectWorkspace,
    teams = [],
    teamsUnavailable,
  } = useWorkspace();
  const [teamName, setTeamName] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const teamSettingsForm = useTeamSettingsForm(
    activeWorkspace.type === 'team'
      ? { teamId: activeWorkspace.teamId, name: activeWorkspace.name, slug: activeWorkspace.slug ?? '' }
      : null,
  );
  const { name: editTeamName, slug: editTeamSlug } = teamSettingsForm.values;
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isUpdatingTeam, setIsUpdatingTeam] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [transferringOwnerMemberId, setTransferringOwnerMemberId] = useState<string | null>(null);
  const [acceptingIncomingInviteId, setAcceptingIncomingInviteId] = useState<string | null>(null);

  const { membersQuery, activityQuery, incomingInvitesQuery, reload } = useTeamSettingsQueries({
    activeTeamId,
    canManageTeam,
  });
  const members = membersQuery.data ?? [];
  const incomingInvites = incomingInvitesQuery.data ?? [];
  const queryClient = useQueryClient();
  const memberChangeRefreshes = [reload.members, refreshTeams, reload.activity];
  const markOrganizationListStale = () =>
    queryClient.invalidateQueries({ queryKey: ['teams'], refetchType: 'none' });
  const warnRefreshFailed = () => {
    void markOrganizationListStale();
    toast.warning('Saved, but refreshing failed. Reload to see the latest state.');
  };
  const activeMemberId =
    isTeamWorkspace && 'memberId' in activeWorkspace
      ? activeWorkspace.memberId
      : null;
  const canTransferOwnership = isTeamWorkspace && activeWorkspace.role === 'owner';
  const changedTeamSettings = isTeamWorkspace
    ? getTeamSettingsUpdate({ name: editTeamName, slug: editTeamSlug }, activeWorkspace)
    : null;

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

  const handleUpdateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeTeamId) {
      toast.error('Select an Organization before updating its settings');
      return;
    }

    const update = changedTeamSettings;
    if (!update) {
      return;
    }
    const nameError = update.name === undefined ? null : getOrganizationNameError(update.name);
    if (nameError) {
      toast.error(nameError);
      return;
    }

    const teamId = activeTeamId;
    const submitted = { name: editTeamName, slug: editTeamSlug };
    setIsUpdatingTeam(true);
    try {
      await runTeamWrite({
        write: () => saveTeamSettings(teamId, update),
        onSaved: (result) => {
          const team = result?.team;
          if (team) {
            teamSettingsForm.applySaved(teamId, submitted, { name: team.name, slug: team.slug ?? '' });
            patchTeam(teamId, { name: team.name, slug: team.slug ?? null });
          }
          toast.success('Organization updated');
        },
        refreshes: [refreshTeams, reload.activity],
        onRefreshFailed: warnRefreshFailed,
        onWriteFailed: (error) => toast.error(errorMessage(error, 'Failed to update Organization')),
      });
    } finally {
      setIsUpdatingTeam(false);
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
      await reload.incomingInvites();
      void refreshTeams().catch(() => undefined);
      toast.success('Organization invite accepted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to accept invite');
      await reload.incomingInvites().catch(() => undefined);
    } finally {
      setAcceptingIncomingInviteId(null);
    }
  };

  const handleUpdateMember = async (
    member: TeamMember,
    updates: { role?: AssignableTeamRole; status?: TeamMemberStatus },
  ) => {
    if (!activeTeamId) {
      return;
    }

    const teamId = activeTeamId;
    setUpdatingMemberId(member.id);
    try {
      await runTeamWrite({
        write: () => updateTeamMember(teamId, member.id, updates),
        onSaved: () => toast.success('Member updated'),
        refreshes: [...memberChangeRefreshes, reload.invites],
        onRefreshFailed: warnRefreshFailed,
        onWriteFailed: (error) => {
          toast.error(errorMessage(error, 'Failed to update member'));
          void reload.members().catch(() => undefined);
        },
      });
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleTransferOwnership = async (member: TeamMember) => {
    if (!activeTeamId) {
      return;
    }

    const memberName = member.name || member.email || member.user_id;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Transfer Organization ownership to ${memberName}? You will become an admin.`)
    ) {
      return;
    }

    const teamId = activeTeamId;
    setTransferringOwnerMemberId(member.id);
    try {
      await runTeamWrite({
        write: () => transferTeamOwnership(teamId, member.id),
        onSaved: () => {
          patchTeam(teamId, { role: 'admin' });
          toast.success('Organization ownership transferred');
        },
        refreshes: memberChangeRefreshes,
        onRefreshFailed: warnRefreshFailed,
        onWriteFailed: (error) => {
          toast.error(errorMessage(error, 'Failed to transfer ownership'));
          void refreshTeams().catch(() => undefined);
          void reload.members().catch(() => undefined);
        },
      });
    } finally {
      setTransferringOwnerMemberId(null);
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

        {teams.length > 0 ? (
          <OrganizationList
            activeTeamId={activeWorkspace.type === 'team' ? activeWorkspace.teamId : null}
            onSelect={selectWorkspace}
            teams={teams}
          />
        ) : null}

        <Separator />

        {isTeamWorkspace ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium wrap-anywhere">{activeWorkspace.name}</h3>
              <p className="text-sm text-muted-foreground">
                Your role: {formatRole(activeWorkspace.role)}
              </p>
              <p className="text-xs text-muted-foreground">
                {roleDescriptions[activeWorkspace.role]}
              </p>
            </div>

            {canManageTeam ? (
              <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={handleUpdateTeam}>
                <Field>
                  <FieldLabel htmlFor="team-settings-name">Organization name</FieldLabel>
                  <Input
                    id="team-settings-name"
                    maxLength={ORGANIZATION_NAME_MAX}
                    value={editTeamName}
                    onChange={(event) => teamSettingsForm.setName(event.target.value)}
                    placeholder="Agency operations"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="team-settings-slug">Slug</FieldLabel>
                  <Input
                    id="team-settings-slug"
                    value={editTeamSlug}
                    onChange={(event) => teamSettingsForm.setSlug(event.target.value)}
                    placeholder="agency-ops"
                  />
                </Field>
                <Button type="submit" disabled={isUpdatingTeam || !changedTeamSettings}>
                  {isUpdatingTeam ? 'Saving...' : 'Save Organization'}
                </Button>
              </form>
            ) : null}

            {canManageTeam && activeTeamId ? <TeamInvitesPanel teamId={activeTeamId} /> : null}

            {!canManageTeam ? (
              <p className="text-sm text-muted-foreground">
                Owners and admins manage Organization settings, invites, and activity.
              </p>
            ) : null}

            <OrganizationMemberList
              activeMemberId={activeMemberId}
              canManageTeam={canManageTeam}
              canTransferOwnership={canTransferOwnership}
              members={members}
              membersQuery={membersQuery}
              onRetry={() => void reload.members()}
              onTransferOwnership={(member) => void handleTransferOwnership(member)}
              onUpdateMember={(member, updates) => void handleUpdateMember(member, updates)}
              transferringOwnerMemberId={transferringOwnerMemberId}
              updatingMemberId={updatingMemberId}
            />

            {canManageTeam ? (
              <TeamActivityList query={activityQuery} onRetry={() => void reload.activity()} />
            ) : null}
          </div>
        ) : teamsUnavailable ? null : (
          <p className="text-sm text-muted-foreground">
            Create or select an Organization to share templates and runs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
