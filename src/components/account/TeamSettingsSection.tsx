import { useEffect, useState, type FormEvent } from 'react';
import { Crown, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { api, type TeamActivityEvent, type TeamMember, type TeamMemberStatus, type TeamRole } from '@/lib/api';
import { getAuditActorName } from '@/lib/auditLabels';
import { getOrganizationNameError, ORGANIZATION_NAME_MAX } from '@/lib/schemas/nameLimits';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { persistAcceptedWorkspace } from '@/features/teams/acceptTeamInvite';
import { runTeamWrite } from '@/features/teams/runTeamWrite';
import { useTeamSettingsQueries } from '@/features/teams/useTeamSettingsQueries';
import { formatTeamActivityAction } from '@/components/account/teamActivityLabels';
import { TeamInvitesPanel } from '@/components/account/TeamInvitesPanel';
import {
  assignableRoles,
  describeMemberForControls,
  formatInviteExpiration,
  formatRole,
} from '@/components/account/teamSettingsFormat';
import type { AssignableTeamRole } from '@/features/teams/teamInviteLinks';

const memberStatuses: TeamMemberStatus[] = ['active', 'disabled'];

const roleDescriptions: Record<TeamRole, string> = {
  owner: 'Owns billing, members, settings, templates, and runs.',
  admin: 'Manages members, settings, templates, and runs.',
  editor: 'Creates and edits shared templates and runs.',
  runner: 'Starts and updates runs without editing templates.',
  viewer: 'Views shared templates and runs.',
};

const formatMemberStatus = (status: TeamMemberStatus): string =>
  status.charAt(0).toUpperCase() + status.slice(1);

const formatActivityTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const getActivityActorName = (event: TeamActivityEvent): string =>
  getAuditActorName(event.actor, event.metadata, event.actor.userId || undefined);

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
    selectWorkspace,
    teams = [],
  } = useWorkspace();
  const [teamName, setTeamName] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamSlug, setEditTeamSlug] = useState('');
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
  const activity = activityQuery.data ?? [];
  const incomingInvites = incomingInvitesQuery.data ?? [];
  const queryClient = useQueryClient();
  const memberChangeRefreshes = [reload.members, refreshTeams, reload.activity];
  // The change is saved; only the follow-up refresh failed. Mark the
  // Organization list stale so it refetches on the next focus or visit.
  const warnRefreshFailed = () => {
    void queryClient.invalidateQueries({ queryKey: ['teams'], refetchType: 'none' });
    toast.warning('Saved, but refreshing failed. Reload to see the latest state.');
  };
  const activeMemberId =
    isTeamWorkspace && 'memberId' in activeWorkspace
      ? activeWorkspace.memberId
      : null;
  const canTransferOwnership = isTeamWorkspace && activeWorkspace.role === 'owner';

  useEffect(() => {
    if (!isTeamWorkspace) {
      setEditTeamName('');
      setEditTeamSlug('');
      return;
    }

    setEditTeamName(activeWorkspace.name);
    setEditTeamSlug('slug' in activeWorkspace && activeWorkspace.slug ? activeWorkspace.slug : '');
  }, [activeWorkspace, isTeamWorkspace]);

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

    const name = editTeamName.trim();
    const slug = editTeamSlug.trim();
    const nameError = getOrganizationNameError(name);
    if (nameError) {
      toast.error(nameError);
      return;
    }

    const teamId = activeTeamId;
    setIsUpdatingTeam(true);
    try {
      await runTeamWrite({
        write: () => api.updateTeam(teamId, { name, slug: slug || undefined }),
        onSaved: (result) => {
          // The response has the saved name and slug (the server may adjust the slug).
          const team = result?.team;
          if (team) patchTeam(teamId, { name: team.name, slug: team.slug ?? null });
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
      const acceptedInvite = await api.acceptIncomingTeamInvite(inviteId);

      if (acceptedInvite.team) {
        rememberTeam(acceptedInvite.team);
      }

      persistAcceptedWorkspace(acceptedInvite.teamId);
      selectWorkspace(acceptedInvite.teamId);
      await reload.incomingInvites();
      void refreshTeams().catch(() => undefined);
      toast.success('Organization invite accepted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to accept invite');
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
        write: () => api.updateTeamMember(teamId, member.id, updates),
        onSaved: () => toast.success('Member updated'),
        refreshes: memberChangeRefreshes,
        onRefreshFailed: warnRefreshFailed,
        onWriteFailed: (error) => toast.error(errorMessage(error, 'Failed to update member')),
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
        write: () => api.transferTeamOwnership(teamId, member.id),
        onSaved: () => {
          // The previous owner is now an admin. Apply it now so the owner-only
          // controls go away even if the Organization list cannot be refetched.
          patchTeam(teamId, { role: 'admin' });
          toast.success('Organization ownership transferred');
        },
        refreshes: memberChangeRefreshes,
        onRefreshFailed: warnRefreshFailed,
        onWriteFailed: (error) => toast.error(errorMessage(error, 'Failed to transfer ownership')),
      });
    } finally {
      setTransferringOwnerMemberId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Organizations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {incomingInvites.length > 0 ? (
          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">Incoming invites</div>
            <div className="divide-y rounded-md border border-border">
              {incomingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_120px_160px_auto]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {invite.teamName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      Invited by {invite.inviterName || invite.inviterEmail || 'an Organization admin'}
                    </div>
                  </div>
                  <div className="text-sm capitalize text-muted-foreground">
                    {formatRole(invite.role)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatInviteExpiration(invite.expiresAt)}
                  </div>
                  <Button
                    aria-label={`Accept invite to ${invite.teamName}`}
                    type="button"
                    size="sm"
                    disabled={acceptingIncomingInviteId === invite.id}
                    onClick={() => void handleAcceptIncomingInvite(invite.id)}
                  >
                    {acceptingIncomingInviteId === invite.id ? 'Accepting...' : 'Accept'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleCreateTeam}>
          <div className="space-y-2">
            <Label htmlFor="team-name">Organization name</Label>
            <Input
              id="team-name"
              maxLength={ORGANIZATION_NAME_MAX}
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Agency operations"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-slug">Slug</Label>
            <Input
              id="team-slug"
              value={teamSlug}
              onChange={(event) => setTeamSlug(event.target.value)}
              placeholder="agency-ops"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={isCreatingTeam} className="w-full">
              {isCreatingTeam ? 'Creating...' : 'Create Organization'}
            </Button>
          </div>
        </form>

        {teams.length > 0 ? (
          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">Your Organizations</div>
            <div className="divide-y rounded-md border border-border">
              {teams.map((team) => {
                const selected = activeWorkspace.type === 'team' && activeWorkspace.teamId === team.id;

                return (
                  <button
                    key={team.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 p-3 text-left transition hover:bg-muted/50"
                    onClick={() => selectWorkspace(team.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {team.name}
                      </span>
                      <span className="block text-xs capitalize text-muted-foreground">
                        {formatRole(team.role)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {selected ? 'Selected' : 'Select'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <Separator />

        {isTeamWorkspace ? (
          <div className="space-y-5">
            <div>
              <div className="text-sm font-medium text-foreground">
                {activeWorkspace.name}
              </div>
              <div className="text-sm capitalize text-muted-foreground">
                Your role: {formatRole(activeWorkspace.role)}
              </div>
              <div className="text-xs text-muted-foreground">
                {roleDescriptions[activeWorkspace.role]}
              </div>
            </div>

            {canManageTeam ? (
              <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleUpdateTeam}>
                <div className="space-y-2">
                  <Label htmlFor="team-settings-name">Organization name</Label>
                  <Input
                    id="team-settings-name"
                    maxLength={ORGANIZATION_NAME_MAX}
                    value={editTeamName}
                    onChange={(event) => setEditTeamName(event.target.value)}
                    placeholder="Agency operations"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team-settings-slug">Slug</Label>
                  <Input
                    id="team-settings-slug"
                    value={editTeamSlug}
                    onChange={(event) => setEditTeamSlug(event.target.value)}
                    placeholder="agency-ops"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={isUpdatingTeam} className="w-full">
                    {isUpdatingTeam ? 'Saving...' : 'Save Organization'}
                  </Button>
                </div>
              </form>
            ) : null}

            {canManageTeam && activeTeamId ? <TeamInvitesPanel teamId={activeTeamId} /> : null}

            {!canManageTeam ? (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                Owners and admins manage Organization settings, invites, and activity.
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="text-sm font-medium text-foreground">Members</div>
              {membersQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading members...</div>
              ) : members.length === 0 ? (
                <div className="text-sm text-muted-foreground">No members found.</div>
              ) : (
                <div className="divide-y rounded-md border border-border">
                  {members.map((member) => {
                    const isOwner = member.role === 'owner';
                    const isCurrentMember = member.id === activeMemberId;
                    const controlsDisabled =
                      isOwner || isCurrentMember || updatingMemberId === member.id;
                    const memberLabel = describeMemberForControls(member);

                    return (
                      <div
                        key={member.id}
                        className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_150px_150px_auto]"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {member.name || member.email || member.user_id}
                            {isCurrentMember ? (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                You
                              </span>
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {member.email || member.user_id}
                          </div>
                        </div>
                        {canManageTeam ? (
                          <Select
                            value={member.role}
                            disabled={controlsDisabled}
                            onValueChange={(value) =>
                              void handleUpdateMember(member, {
                                role: value as AssignableTeamRole,
                              })
                            }
                          >
                            <SelectTrigger aria-label={`Role for ${memberLabel}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {isOwner ? (
                                <SelectItem value="owner">Owner</SelectItem>
                              ) : null}
                              {assignableRoles.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {formatRole(role)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {formatRole(member.role)}
                          </div>
                        )}
                        {canManageTeam ? (
                          <Select
                            value={member.status}
                            disabled={controlsDisabled}
                            onValueChange={(value) =>
                              void handleUpdateMember(member, {
                                status: value as TeamMemberStatus,
                              })
                            }
                          >
                            <SelectTrigger aria-label={`Status for ${memberLabel}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {memberStatuses.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {formatMemberStatus(status)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {formatMemberStatus(member.status)}
                          </div>
                        )}
                        <div className="flex items-center justify-end">
                          {canTransferOwnership && !isOwner && !isCurrentMember && member.status === 'active' ? (
                            <Button
                              aria-label={`Make owner: ${memberLabel}`}
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={transferringOwnerMemberId === member.id}
                              onClick={() => void handleTransferOwnership(member)}
                            >
                              <Crown className="mr-2 h-4 w-4" />
                              Make owner
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {canManageTeam ? (
              <div className="space-y-3">
                <div className="text-sm font-medium text-foreground">Activity</div>
                {activityQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading activity...</div>
                ) : activity.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No Organization activity recorded yet.</div>
                ) : (
                  <div className="divide-y rounded-md border border-border">
                    {activity.slice(0, 10).map((event) => (
                      <div
                        key={event.id}
                        className="grid gap-1 p-3 md:grid-cols-[minmax(0,1fr)_180px]"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {formatTeamActivityAction(event.action)}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {getActivityActorName(event)}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground md:text-right">
                          {formatActivityTime(event.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Create or select an Organization to share templates and runs.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
