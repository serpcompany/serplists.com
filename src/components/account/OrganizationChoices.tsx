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
import { formatRole } from '@/components/account/teamSettingsFormat';
import { InviteItemContent } from '@/components/account/InviteItemContent';

type IncomingInviteListProps = {
  acceptingInviteId: string | null;
  invites: IncomingTeamInvite[];
  onAccept: (inviteId: string) => void;
};

export function IncomingInviteList({ acceptingInviteId, invites, onAccept }: IncomingInviteListProps) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Incoming invites</h3>
      <ItemGroup className="gap-2">
        {invites.map((invite) => (
          <Item key={invite.id} role="listitem" variant="outline">
            <InviteItemContent
              title={invite.teamName}
              inviterName={invite.inviterName}
              inviterEmail={invite.inviterEmail}
              role={invite.role}
              expiresAt={invite.expiresAt}
            />
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
  onSelect: (teamId: string) => void;
  teams: TeamSummary[];
};

export function OrganizationList({ onSelect, teams }: OrganizationListProps) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Your Organizations</h3>
      <div className="flex flex-col gap-2">
        {teams.map((team) => (
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
            <ItemActions className="text-xs text-muted-foreground">Select</ItemActions>
          </Item>
        ))}
      </div>
    </section>
  );
}
