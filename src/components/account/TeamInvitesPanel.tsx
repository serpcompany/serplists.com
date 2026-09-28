import { useState, type FormEvent } from 'react';
import { Copy, Link2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { QueryListState } from '@/components/shared/QueryListState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { assignableRoles, formatInviteExpiration, formatRole } from '@/components/account/teamSettingsFormat';
import { inviteEmailAfterLink, type AssignableTeamRole } from '@/features/teams/teamInviteLinks';
import { useTeamInvites } from '@/features/teams/useTeamInvites';
import { copyTextToClipboard } from '@/lib/clipboard';

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

// Invite form, the link just created, and the pending invites of the active
// Organization. Shown to owners and admins only.
export function TeamInvitesPanel({ teamId }: { teamId: string }) {
  const {
    invites,
    invitesQuery,
    reloadInvites,
    link,
    conflict,
    dismissConflict,
    isCreating,
    reissuingInviteId,
    revokingInviteId,
    createInvite,
    reissueLink,
    revokeInvite,
  } = useTeamInvites(teamId, true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AssignableTeamRole>('viewer');
  const linkBusy = isCreating || reissuingInviteId !== null;

  const handleCreateInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const email = inviteEmail.trim();
    if (!email) {
      toast.error('Email is required');
      return;
    }

    try {
      const result = await createInvite(teamId, email, inviteRole);
      if (result?.kind === 'created') {
        // The link shows before the lists reload; keep an address typed meanwhile.
        setInviteEmail((current) => inviteEmailAfterLink(current, email));
        toast.success('Invite link created');
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to create invite'));
    }
  };

  const handleNewLink = async (inviteId: string, role?: AssignableTeamRole) => {
    try {
      const nextLink = await reissueLink(teamId, inviteId, role);
      if (nextLink) {
        setInviteEmail((current) => inviteEmailAfterLink(current, nextLink.email));
        toast.success('New invite link created. The previous link no longer works.');
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to create a new invite link'));
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await revokeInvite(teamId, inviteId);
      toast.success('Invite revoked');
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to revoke invite'));
    }
  };

  const handleCopyInvite = async (url: string) => {
    if (await copyTextToClipboard(url)) {
      toast.success('Invite link copied');
      return;
    }

    toast.error('Unable to copy invite link');
  };

  return (
    <>
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
          <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as AssignableTeamRole)}>
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
          <Button type="submit" disabled={linkBusy} className="w-full">
            <Link2 className="mr-2 h-4 w-4" />
            {isCreating ? 'Creating...' : 'Create link'}
          </Button>
        </div>
      </form>

      {conflict ? (
        <div role="status" className="space-y-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <p className="text-foreground">
            An invite is already pending for {conflict.email}, and its link can&apos;t be shown again.
            Create a new link that invites them as {formatRole(conflict.role)}? The previous link will
            stop working.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={linkBusy}
              onClick={() => void handleNewLink(conflict.inviteId, conflict.role)}
            >
              <Link2 className="mr-2 h-4 w-4" />
              {reissuingInviteId === conflict.inviteId ? 'Creating...' : 'Create new link'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={dismissConflict}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {link ? (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Invite link for {link.email}</div>
          <div className="flex items-center gap-2">
            <Input aria-label="Invite link" readOnly value={link.url} />
            <Button
              aria-label="Copy invite link"
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void handleCopyInvite(link.url)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="text-sm font-medium text-foreground">Pending invites</div>
        <QueryListState
          query={invitesQuery}
          loadingLabel="Loading invites..."
          loadErrorLabel="Couldn't load pending invites."
          refreshErrorLabel="Couldn't refresh pending invites. Showing the last loaded list."
          onRetry={() => void reloadInvites()}
          empty={<div className="text-sm text-muted-foreground">No pending invites.</div>}
        >
          <div className="divide-y rounded-md border border-border">
            {invites.map((invite) => (
              <div key={invite.id} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_120px_160px_auto]">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{invite.email}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    Invited by {invite.inviterName || invite.inviterEmail || 'an Organization admin'}
                  </div>
                </div>
                <div className="text-sm capitalize text-muted-foreground">{formatRole(invite.role)}</div>
                <div className="text-sm text-muted-foreground">{formatInviteExpiration(invite.expires_at)}</div>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    aria-label={`New link for ${invite.email}`}
                    title="Create a new link for this invite. The previous link stops working."
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={linkBusy}
                    onClick={() => void handleNewLink(invite.id)}
                  >
                    <Link2 className="mr-1 h-4 w-4" />
                    {reissuingInviteId === invite.id ? 'Creating...' : 'New link'}
                  </Button>
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
              </div>
            ))}
          </div>
        </QueryListState>
      </div>
    </>
  );
}
