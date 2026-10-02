import { useState, type FormEvent } from 'react';
import { Copy, Info, Link2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { QueryListState } from '@/components/shared/QueryListState';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { assignableRoles, formatInviteExpiration, formatRole } from '@/components/account/teamSettingsFormat';
import { inviteEmailAfterLink, type AssignableTeamRole } from '@/features/teams/teamInviteLinks';
import { useTeamInvites } from '@/features/teams/useTeamInvites';
import { copyTextToClipboard } from '@/lib/clipboard';

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

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
      <form className="grid gap-3 md:grid-cols-[1fr_10rem_auto] md:items-end" onSubmit={handleCreateInvite}>
        <Field>
          <FieldLabel htmlFor="team-invite-email">Invite email</FieldLabel>
          <Input
            id="team-invite-email"
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="teammate@example.com"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="team-invite-role">Role</FieldLabel>
          <Select value={inviteRole} onValueChange={(value) => {
            if (value) setInviteRole(value);
          }}>
            <SelectTrigger className="w-full" id="team-invite-role">
              <SelectValue>{(role: AssignableTeamRole) => formatRole(role)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {assignableRoles.map((role) => (
                <SelectItem key={role} value={role}>
                  {formatRole(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button type="submit" disabled={linkBusy}>
          <Link2 data-icon="inline-start" />
          {isCreating ? 'Creating...' : 'Create link'}
        </Button>
      </form>

      {conflict ? (
        <Alert role="status">
          <Info />
          <AlertDescription className="flex flex-col gap-3">
            <p className="text-foreground">
              An invite is already pending for {conflict.email}, and its link can&apos;t be shown again.
              Create a new link that invites them as {formatRole(conflict.role)}? The previous link will
              stop working.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={linkBusy}
                onClick={() => void handleNewLink(conflict.inviteId, conflict.role)}
              >
                <Link2 data-icon="inline-start" />
                {reissuingInviteId === conflict.inviteId ? 'Creating...' : 'Create new link'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={dismissConflict}>
                Cancel
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {link ? (
        <Field>
          <FieldLabel className="wrap-anywhere" htmlFor="team-invite-link">Invite link for {link.email}</FieldLabel>
          <InputGroup>
            <InputGroupInput aria-label="Invite link" id="team-invite-link" readOnly value={link.url} />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label="Copy invite link"
                onClick={() => void handleCopyInvite(link.url)}
                size="icon-xs"
              >
                <Copy />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      ) : null}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Pending invites</h3>
        <QueryListState
          query={invitesQuery}
          loadingLabel="Loading invites..."
          loadErrorLabel="Couldn't load pending invites."
          refreshErrorLabel="Couldn't refresh pending invites. Showing the last loaded list."
          onRetry={() => void reloadInvites()}
          empty={<p className="text-sm text-muted-foreground">No pending invites.</p>}
        >
          <ItemGroup className="gap-2">
            {invites.map((invite) => (
              <Item key={invite.id} role="listitem" variant="outline">
                <ItemContent className="min-w-0">
                  <ItemTitle className="wrap-anywhere">{invite.email}</ItemTitle>
                  <ItemDescription className="wrap-anywhere">
                    Invited by {invite.inviterName || invite.inviterEmail || 'an Organization admin'}
                  </ItemDescription>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>{formatRole(invite.role)}</span>
                    <span>{formatInviteExpiration(invite.expires_at)}</span>
                  </div>
                </ItemContent>
                <ItemActions>
                  <Button
                    aria-label={`New link for ${invite.email}`}
                    title="Create a new link for this invite. The previous link stops working."
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={linkBusy}
                    onClick={() => void handleNewLink(invite.id)}
                  >
                    <Link2 data-icon="inline-start" />
                    {reissuingInviteId === invite.id ? 'Creating...' : 'New link'}
                  </Button>
                  <Button
                    aria-label={`Revoke invite for ${invite.email}`}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={revokingInviteId === invite.id}
                    onClick={() => void handleRevokeInvite(invite.id)}
                  >
                    <Trash2 />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </QueryListState>
      </section>
    </>
  );
}
