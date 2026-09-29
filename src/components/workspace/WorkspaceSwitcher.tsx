import { AlertTriangle, Check, ChevronDown, RotateCw, Settings, User, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkspace, type Workspace } from '@/contexts/WorkspaceContext';
import type { WorkspaceStatus } from '@/contexts/workspaceSelection';
import { buildConsoleSettingsPath } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { Link } from '@/components/navigation/Link';

type SwitcherLabel = { icon: typeof User; label: string };

const getSwitcherLabel = (
  status: WorkspaceStatus | undefined,
  activeWorkspace: Workspace,
): SwitcherLabel => {
  if (status === 'error') return { icon: AlertTriangle, label: 'Organizations unavailable' };
  if (status === 'loading') return { icon: Users, label: 'Loading...' };
  return { icon: activeWorkspace.type === 'team' ? Users : User, label: activeWorkspace.name };
};

export function WorkspaceSwitcher() {
  const {
    activeWorkspace,
    isWorkspaceLoading,
    retryWorkspace,
    selectWorkspace,
    teamsUnavailable,
    workspaces,
    workspaceStatus,
  } = useWorkspace();
  // While the stored Organization is unconfirmed the context falls back to Personal only for
  // display, so never label the tab "Personal" then.
  const isUnresolved = workspaceStatus === 'loading' || workspaceStatus === 'error';
  const active = getSwitcherLabel(workspaceStatus, activeWorkspace);
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button aria-label="Switch context" className="h-9 max-w-[220px] justify-start gap-2 rounded-md px-2" variant="outline" />}
      >
          <ActiveIcon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium">
              {active.label}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
        <DropdownMenuLabel>Personal and Organizations</DropdownMenuLabel>
        {workspaces.map((workspace) => {
          const Icon = workspace.type === 'team' ? Users : User;
          const selected = !isUnresolved && workspace.id === activeWorkspace.id;

          return (
            <DropdownMenuItem
              key={workspace.id}
              className="gap-3"
              // After a failed teams load, Personal stays available as a way out.
              disabled={isWorkspaceLoading && workspaceStatus !== 'error'}
              onClick={() => selectWorkspace(workspace.id)}
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {workspace.name}
                </span>
                <span className="block text-xs capitalize text-muted-foreground">
                  {workspace.type === 'team' ? workspace.role : 'Personal'}
                </span>
              </span>
              <Check
                className={cn(
                  'h-4 w-4 text-primary',
                  selected ? 'opacity-100' : 'opacity-0',
                )}
              />
            </DropdownMenuItem>
          );
        })}
        </DropdownMenuGroup>
        {/* The active context works on, but a failed list must not read as "no Organizations". */}
        {teamsUnavailable && workspaceStatus !== 'error' ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-3 font-normal text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              Couldn&apos;t load your Organizations
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        ) : null}
        {workspaceStatus === 'error' || teamsUnavailable ? (
          <DropdownMenuItem className="gap-3" onClick={retryWorkspace}>
            <RotateCw className="h-4 w-4 text-muted-foreground" />
            Retry loading Organizations
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={buildConsoleSettingsPath()} className="gap-3" />}>
            <Settings className="h-4 w-4 text-muted-foreground" />
            Settings
          </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
