import { ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import type { TeamRole } from '@/lib/api';
import { formatInviteExpiration, formatRole } from '@/components/account/teamSettingsFormat';

type InviteItemContentProps = {
  title: string;
  inviterName: string | null | undefined;
  inviterEmail: string | null | undefined;
  role: TeamRole;
  expiresAt: string;
};

export function InviteItemContent({ title, inviterName, inviterEmail, role, expiresAt }: InviteItemContentProps) {
  return (
    <ItemContent className="min-w-0">
      <ItemTitle className="wrap-anywhere">{title}</ItemTitle>
      <ItemDescription className="wrap-anywhere">
        Invited by {inviterName || inviterEmail || 'an Organization admin'}
      </ItemDescription>
      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>{formatRole(role)}</span>
        <span>{formatInviteExpiration(expiresAt)}</span>
      </div>
    </ItemContent>
  );
}
