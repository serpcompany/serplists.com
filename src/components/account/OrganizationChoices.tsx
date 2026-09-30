import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import type { IncomingTeamInvite, TeamSummary } from '@/lib/api';
import { formatInviteExpiration, formatRole } from '@/components/account/teamSettingsFormat';

type IncomingInviteListProps = {
  acceptingInviteId: string | null;
  invites: IncomingTeamInvite[];
  onAccept: (inviteId: string) => void;
};

// Invites to other Organizations waiting for the user: who invited them, as what, until when.
export function IncomingInviteList({ acceptingInviteId, invites, onAccept }: IncomingInviteListProps) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Incoming invites</h3>
      <ItemGroup className="gap-2">
        {invites.map((invite) => (
          <Item key={invite.id} role="listitem" variant="outline">
            <ItemContent className="min-w-0">
              <ItemTitle className="wrap-anywhere">{invite.teamName}</ItemTitle>
              <ItemDescription className="wrap-anywhere">
                Invited by {invite.inviterName || invite.inviterEmail || 'an Organization admin'}
              </ItemDescription>
              <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>{formatRole(invite.role)}</span>
                <span>{formatInviteExpiration(invite.expiresAt)}</span>
              </div>
            </ItemContent>
            <ItemActions>
              <Button
                aria-label={`Accept invite to ${invite.teamName}`}
                type="button"
                size="sm"
                disabled={acceptingInviteId === invite.id}
                onClick={() => onAccept(invite.id)}
              >
                {acceptingInviteId === invite.id ? 'Accepting...' : 'Accept'}
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </section>
  );
}

type OrganizationListProps = {
  // The Organization the user acts in, or null in Personal.
  activeTeamId: string | null;
  onSelect: (teamId: string) => void;
  teams: TeamSummary[];
};

// The user's Organizations, each a button that makes it the active context.
export function OrganizationList({ activeTeamId, onSelect, teams }: OrganizationListProps) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Your Organizations</h3>
      <div className="flex flex-col gap-2">
        {teams.map((team) => {
          const selected = activeTeamId === team.id;

          return (
            <Item
              key={team.id}
              className="w-full text-left hover:bg-muted"
              render={<button type="button" onClick={() => onSelect(team.id)} />}
              variant="outline"
            >
              <ItemContent className="min-w-0">
                <ItemTitle className="wrap-anywhere">{team.name}</ItemTitle>
                <ItemDescription>{formatRole(team.role)}</ItemDescription>
              </ItemContent>
              <ItemActions className="text-xs text-muted-foreground">
                {selected ? 'Selected' : 'Select'}
              </ItemActions>
            </Item>
          );
        })}
      </div>
    </section>
  );
}
