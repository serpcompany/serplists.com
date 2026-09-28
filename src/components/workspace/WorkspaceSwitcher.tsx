import { AlertTriangle, Check, ChevronDown, RotateCw, Settings, User, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkspace, type Workspace } from '@/contexts/WorkspaceContext';
import type { WorkspaceStatus } from '@/contexts/workspaceSelection';
import { buildConsoleSettingsPath } from '@/lib/routes';
import { cn } from '@/lib/utils';

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
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Switch context"
          className="h-9 max-w-[220px] justify-start gap-2 rounded-md px-2"
          variant="outline"
        >
          <ActiveIcon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium">
              {active.label}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
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
        {workspaceStatus === 'error' ? (
          <DropdownMenuItem className="gap-3" onClick={retryWorkspace}>
            <RotateCw className="h-4 w-4 text-muted-foreground" />
            Retry loading Organizations
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={buildConsoleSettingsPath()} className="gap-3">
            <Settings className="h-4 w-4 text-muted-foreground" />
            Settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
