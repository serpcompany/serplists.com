import { useEffect, useState, type FormEvent } from 'react';
import { Copy, Crown, Link2, Trash2, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
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
import { api, type TeamMember, type TeamMemberStatus, type TeamRole } from '@/lib/api';
import { copyTextToClipboard } from '@/lib/clipboard';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { persistAcceptedWorkspace } from '@/features/teams/acceptTeamInvite';

type AssignableTeamRole = Exclude<TeamRole, 'owner'>;

const assignableRoles: AssignableTeamRole[] = [
  'admin',
  'editor',
  'runner',
  'viewer',
];

const memberStatuses: TeamMemberStatus[] = ['active', 'disabled'];

const roleDescriptions: Record<TeamRole, string> = {
  owner: 'Owns billing, members, settings, templates, and runs.',
  admin: 'Manages members, settings, templates, and runs.',
  editor: 'Creates and edits shared templates and runs.',
  runner: 'Starts and updates runs without editing templates.',
  viewer: 'Views shared templates and runs.',
};

const teamActivityActionLabels: Record<string, string> = {
  'checklist_run.created': 'Run created',
  'checklist_run.deleted': 'Run archived',
  'checklist_run.restored': 'Run restored',
  'checklist_run.share_created': 'Run share created',
  'checklist_run.shared_updated': 'Shared run updated',
  'checklist_run.updated': 'Run updated',
  'team.created': 'Organization created',
  'team.owner_transferred': 'Owner transferred',
  'team.updated': 'Organization updated',
  'team_invite.accepted': 'Invite accepted',
  'team_invite.created': 'Invite created',
  'team_invite.revoked': 'Invite revoked',
  'team_member.updated': 'Member updated',
  'template.cloned': 'Template cloned',
  'template.created': 'Template created',
  'template.deleted': 'Template archived',
  'template.imported': 'Template imported',
  'template.restored': 'Template restored',
  'template.updated': 'Template updated',
};

const formatRole = (role: TeamRole): string =>
  role.charAt(0).toUpperCase() + role.slice(1);

const formatMemberStatus = (status: TeamMemberStatus): string =>
  status.charAt(0).toUpperCase() + status.slice(1);

const formatTeamActivityAction = (action: string): string =>
  teamActivityActionLabels[action] ?? action;

const formatInviteExpiration = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown expiration';
  }

  return `Expires ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
};

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

const getActivityActorName = (actor: {
  email?: string | null;
  name?: string | null;
  username?: string | null;
  userId?: string | null;
}): string => actor.name || actor.username || actor.email || actor.userId || 'Unknown user';

const resolveCreatedInviteUrl = (
  invite: Awaited<ReturnType<typeof api.createTeamInvite>>,
): string => {
  if (invite.delivery?.mode === 'link') {
    return invite.delivery.inviteUrl;
  }

  if (invite.inviteUrl) {
    return invite.inviteUrl;
  }

  return typeof window === 'undefined'
    ? invite.invitePath
    : `${window.location.origin}${invite.invitePath}`;
};

export function TeamSettingsSection() {
  const {
    activeTeamId,
    activeWorkspace,
    canManageTeam,
    createTeam,
    isTeamWorkspace,
    refreshTeams,
    rememberTeam,
    selectWorkspace,
    teams = [],
  } = useWorkspace();
  const [teamName, setTeamName] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamSlug, setEditTeamSlug] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AssignableTeamRole>('viewer');
  const [inviteUrl, setInviteUrl] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isUpdatingTeam, setIsUpdatingTeam] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [transferringOwnerMemberId, setTransferringOwnerMemberId] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [acceptingIncomingInviteId, setAcceptingIncomingInviteId] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: ['team-members', activeTeamId],
    queryFn: () => api.getTeamMembers(activeTeamId as string),
    enabled: Boolean(activeTeamId),
    staleTime: 60 * 1000,
  });

  const members = membersQuery.data ?? [];

  const invitesQuery = useQuery({
    queryKey: ['team-invites', activeTeamId],
    queryFn: () => api.getTeamInvites(activeTeamId as string),
    enabled: Boolean(activeTeamId && canManageTeam),
    staleTime: 30 * 1000,
  });

  const invites = invitesQuery.data ?? [];

  const activityQuery = useQuery({
    queryKey: ['team-activity', activeTeamId],
    queryFn: () => api.getTeamActivity(activeTeamId as string),
    enabled: Boolean(activeTeamId && canManageTeam),
    staleTime: 30 * 1000,
  });

  const activity = activityQuery.data ?? [];

  const incomingInvitesQuery = useQuery({
    queryKey: ['incoming-team-invites'],
    queryFn: () => api.getIncomingTeamInvites(),
    staleTime: 30 * 1000,
  });

  const incomingInvites = incomingInvitesQuery.data ?? [];
  const activeMemberId =
    isTeamWorkspace && 'memberId' in activeWorkspace
      ? activeWorkspace.memberId
      : null;
  const canTransferOwnership = isTeamWorkspace && activeWorkspace.role === 'owner';

  useEffect(() => {
    setInviteUrl('');
  }, [activeTeamId]);

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
    if (!name) {
      toast.error('Organization name is required');
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
    if (!name) {
      toast.error('Organization name is required');
      return;
    }

    setIsUpdatingTeam(true);
    try {
      await api.updateTeam(activeTeamId, {
        name,
        slug: slug || undefined,
      });
      await refreshTeams();
      await activityQuery.refetch();
      toast.success('Organization updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update Organization');
    } finally {
      setIsUpdatingTeam(false);
    }
  };

  const handleCreateInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeTeamId) {
      toast.error('Select an Organization before inviting members');
      return;
    }

    const email = inviteEmail.trim();
    if (!email) {
      toast.error('Email is required');
      return;
    }

    setIsCreatingInvite(true);
    try {
      const invite = await api.createTeamInvite(activeTeamId, {
        email,
        role: inviteRole,
      });
      setInviteUrl(resolveCreatedInviteUrl(invite));
      setInviteEmail('');
      await invitesQuery.refetch();
      await activityQuery.refetch();
      toast.success('Invite link created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create invite');
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!activeTeamId) {
      return;
    }

    setRevokingInviteId(inviteId);
    try {
      await api.revokeTeamInvite(activeTeamId, inviteId);
      await invitesQuery.refetch();
      await activityQuery.refetch();
      toast.success('Invite revoked');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke invite');
    } finally {
      setRevokingInviteId(null);
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
      await incomingInvitesQuery.refetch();
      void refreshTeams().catch(() => undefined);
      toast.success('Organization invite accepted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to accept invite');
    } finally {
      setAcceptingIncomingInviteId(null);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteUrl) {
      return;
    }

    if (await copyTextToClipboard(inviteUrl)) {
      toast.success('Invite link copied');
      return;
    }

    toast.error('Unable to copy invite link');
  };

  const handleUpdateMember = async (
    member: TeamMember,
    updates: { role?: AssignableTeamRole; status?: TeamMemberStatus },
  ) => {
    if (!activeTeamId) {
      return;
    }

    setUpdatingMemberId(member.id);
    try {
      await api.updateTeamMember(activeTeamId, member.id, updates);
      await membersQuery.refetch();
      await refreshTeams();
      await activityQuery.refetch();
      toast.success('Member updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update member');
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

    setTransferringOwnerMemberId(member.id);
    try {
      await api.transferTeamOwnership(activeTeamId, member.id);
      await membersQuery.refetch();
      await refreshTeams();
      await activityQuery.refetch();
      toast.success('Organization ownership transferred');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to transfer ownership');
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

            {canManageTeam ? (
              <form className="grid gap-3 md:grid-cols-[1fr_160px_auto]" onSubmit={handleCreateInvite}>
                <div className="space-y-2">
                  <Label htmlFor="team-invite-email">Invite email</Label>
                  <Input
                    id="team-invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="teammate@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team-invite-role">Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole(value as AssignableTeamRole)}
                  >
                    <SelectTrigger id="team-invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {formatRole(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={isCreatingInvite} className="w-full">
                    <Link2 className="mr-2 h-4 w-4" />
                    {isCreatingInvite ? 'Creating...' : 'Create link'}
                  </Button>
                </div>
              </form>
            ) : null}

            {inviteUrl ? (
              <div className="flex items-center gap-2">
                <Input aria-label="Invite link" readOnly value={inviteUrl} />
                <Button
                  aria-label="Copy invite link"
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyInvite}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ) : null}

            {!canManageTeam ? (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                Owners and admins manage Organization settings, invites, and activity.
              </div>
            ) : null}

            {canManageTeam ? (
              <div className="space-y-3">
                <div className="text-sm font-medium text-foreground">Pending invites</div>
                {invitesQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading invites...</div>
                ) : invites.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No pending invites.</div>
                ) : (
                  <div className="divide-y rounded-md border border-border">
                    {invites.map((invite) => (
                      <div
                        key={invite.id}
                        className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_120px_160px_auto]"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {invite.email}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            Invited by {invite.inviterName || invite.inviterEmail || 'an Organization admin'}
                          </div>
                        </div>
                        <div className="text-sm capitalize text-muted-foreground">
                          {formatRole(invite.role)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatInviteExpiration(invite.expires_at)}
                        </div>
                        <Button
                          aria-label={`Revoke invite for ${invite.email}`}
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={revokingInviteId === invite.id}
                          onClick={() => void handleRevokeInvite(invite.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
                            <SelectTrigger aria-label="Member role">
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
                            <SelectTrigger aria-label="Member status">
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
                            {getActivityActorName(event.actor)}
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
