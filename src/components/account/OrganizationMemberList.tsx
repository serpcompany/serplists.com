import { useId } from 'react';
import { Crown } from 'lucide-react';

import { QueryListState } from '@/components/shared/QueryListState';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TeamMember, TeamMemberStatus } from '@/lib/api';
import type { AssignableTeamRole } from '@/features/teams/teamInviteLinks';
import {
  assignableRoles,
  describeMemberForControls,
  formatRole,
} from '@/components/account/teamSettingsFormat';

const memberStatuses: TeamMemberStatus[] = ['active', 'disabled'];

const formatMemberStatus = (status: TeamMemberStatus): string =>
  status.charAt(0).toUpperCase() + status.slice(1);

type OrganizationMemberListProps = {
  activeMemberId: string | null;
  canManageTeam: boolean;
  canTransferOwnership: boolean;
  members: TeamMember[];
  membersQuery: { data: TeamMember[] | undefined; isError: boolean; isLoading: boolean };
  onRetry: () => void;
  onTransferOwnership: (member: TeamMember) => void;
  onUpdateMember: (
    member: TeamMember,
    updates: { role?: AssignableTeamRole; status?: TeamMemberStatus },
  ) => void;
  transferringOwnerMemberId: string | null;
  updatingMemberId: string | null;
};

// The active Organization's members. Owners and admins change a member's role and status
// (never their own or the owner's), and the owner can hand ownership to an active member.
export function OrganizationMemberList({
  activeMemberId,
  canManageTeam,
  canTransferOwnership,
  members,
  membersQuery,
  onRetry,
  onTransferOwnership,
  onUpdateMember,
  transferringOwnerMemberId,
  updatingMemberId,
}: OrganizationMemberListProps) {
  const fieldId = useId();

  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-sm font-medium">Members</h4>
      <QueryListState
        query={membersQuery}
        loadingLabel="Loading members..."
        loadErrorLabel="Couldn't load members."
        refreshErrorLabel="Couldn't refresh members. Showing the last loaded list."
        onRetry={onRetry}
        empty={<p className="text-sm text-muted-foreground">No members found.</p>}
      >
        <ItemGroup className="gap-2">
          {members.map((member) => {
            const isOwner = member.role === 'owner';
            const isCurrentMember = member.id === activeMemberId;
            const controlsDisabled = isOwner || isCurrentMember || updatingMemberId === member.id;
            const memberLabel = describeMemberForControls(member);
            const roleId = `${fieldId}-${member.id}-role`;
            const statusId = `${fieldId}-${member.id}-status`;

            return (
              <Item key={member.id} role="listitem" variant="outline">
                <ItemContent className="min-w-0">
                  <ItemTitle className="flex-wrap wrap-anywhere">
                    {member.name || member.email || member.user_id}
                    {isCurrentMember ? (
                      <span className="text-xs font-normal text-muted-foreground">You</span>
                    ) : null}
                  </ItemTitle>
                  <ItemDescription className="wrap-anywhere">{member.email || member.user_id}</ItemDescription>
                </ItemContent>

                <ItemActions className="basis-full flex-wrap sm:basis-auto">
                  {canManageTeam ? (
                    <>
                      {/* The visible labels help on a phone, where the fields stack; the
                          controls' names say whose role and status they are. */}
                      <Field className="w-full sm:w-36">
                        <FieldLabel className="sm:sr-only" htmlFor={roleId}>Role</FieldLabel>
                        <Select
                          value={member.role}
                          disabled={controlsDisabled}
                          onValueChange={(value) =>
                            onUpdateMember(member, { role: value as AssignableTeamRole })
                          }
                        >
                          <SelectTrigger aria-label={`Role for ${memberLabel}`} className="w-full" id={roleId}>
                            <SelectValue>{(role: TeamMember['role']) => formatRole(role)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {isOwner ? <SelectItem value="owner">Owner</SelectItem> : null}
                            {assignableRoles.map((role) => (
                              <SelectItem key={role} value={role}>
                                {formatRole(role)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field className="w-full sm:w-36">
                        <FieldLabel className="sm:sr-only" htmlFor={statusId}>Status</FieldLabel>
                        <Select
                          value={member.status}
                          disabled={controlsDisabled}
                          onValueChange={(value) =>
                            onUpdateMember(member, { status: value as TeamMemberStatus })
                          }
                        >
                          <SelectTrigger aria-label={`Status for ${memberLabel}`} className="w-full" id={statusId}>
                            <SelectValue>{(status: TeamMemberStatus) => formatMemberStatus(status)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {memberStatuses.map((status) => (
                              <SelectItem key={status} value={status}>
                                {formatMemberStatus(status)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </>
                  ) : (
                    <div className="flex gap-3 text-sm text-muted-foreground">
                      <span>{formatRole(member.role)}</span>
                      <span>{formatMemberStatus(member.status)}</span>
                    </div>
                  )}
                  {canTransferOwnership && !isOwner && !isCurrentMember && member.status === 'active' ? (
                    <Button
                      aria-label={`Make owner: ${memberLabel}`}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={transferringOwnerMemberId === member.id}
                      onClick={() => onTransferOwnership(member)}
                    >
                      <Crown data-icon="inline-start" />
                      Make owner
                    </Button>
                  ) : null}
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      </QueryListState>
    </section>
  );
}
