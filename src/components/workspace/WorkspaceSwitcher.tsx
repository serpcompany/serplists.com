import { AlertTriangle, Check, ChevronsUpDown, RotateCw, Settings, User, Users } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
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
  const { isMobile } = useSidebar();
  const isUnresolved = workspaceStatus === 'loading' || workspaceStatus === 'error';
  const active = getSwitcherLabel(workspaceStatus, activeWorkspace);
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            aria-label="Switch context"
            size="lg"
            className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
          />
        }
      >
        <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <ActiveIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-medium">{active.label}</span>
        <ChevronsUpDown className="ml-auto" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72"
        side={isMobile ? 'bottom' : 'right'}
        sideOffset={4}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Personal and Organizations</DropdownMenuLabel>
          {workspaces.map((workspace) => {
            const Icon = workspace.type === 'team' ? Users : User;
            const selected = !isUnresolved && workspace.id === activeWorkspace.id;

            return (
              <DropdownMenuItem
                key={workspace.id}
                className="gap-3"
                disabled={isWorkspaceLoading && workspaceStatus !== 'error'}
                onClick={() => selectWorkspace(workspace.id)}
              >
                <Icon className="text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{workspace.name}</span>
                  <span className="block text-xs text-muted-foreground capitalize">
                    {workspace.type === 'team' ? workspace.role : 'Personal'}
                  </span>
                </span>
                <Check className={cn(selected ? 'opacity-100' : 'opacity-0')} />
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        {teamsUnavailable && workspaceStatus !== 'error' ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-3 font-normal text-muted-foreground">
              <AlertTriangle className="size-4" />
              Couldn&apos;t load your Organizations
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        ) : null}
        {workspaceStatus === 'error' || teamsUnavailable ? (
          <DropdownMenuItem className="gap-3" onClick={retryWorkspace}>
            <RotateCw className="text-muted-foreground" />
            Retry loading Organizations
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-3" render={<Link href={buildConsoleSettingsPath()} />}>
          <Settings className="text-muted-foreground" />
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
