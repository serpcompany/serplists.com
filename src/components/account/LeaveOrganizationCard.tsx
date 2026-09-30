import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useLeaveOrganization } from '@/features/teams/useLeaveOrganization';

// Lets a non-owner member leave the selected Organization. Owners transfer
// ownership first (the API refuses an owner with `owner_must_transfer`).
export function LeaveOrganizationCard() {
  const { activeWorkspace } = useWorkspace();
  const { isLeaving, leaveOrganization } = useLeaveOrganization();

  if (activeWorkspace.type !== 'team' || activeWorkspace.role === 'owner') {
    return null;
  }

  const { name, teamId } = activeWorkspace;

  const handleLeave = async () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Leave ${name}? You will lose access to its Templates and Runs.`)
    ) {
      return;
    }

    try {
      await leaveOrganization(teamId);
      toast.success(`You left ${name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to leave the Organization');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Leave Organization</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Leave {name} and return to your Personal context. Templates and Runs you created stay
          with the Organization. An admin can invite you again later.
        </p>
        <Button
          className="sm:shrink-0"
          type="button"
          variant="destructive"
          disabled={isLeaving}
          onClick={() => void handleLeave()}
        >
          {isLeaving ? 'Leaving...' : 'Leave Organization'}
        </Button>
      </CardContent>
    </Card>
  );
}
