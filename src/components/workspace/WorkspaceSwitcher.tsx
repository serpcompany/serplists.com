import { Check, ChevronDown, Settings, User, Users } from 'lucide-react';
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
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { buildConsoleSettingsPath } from '@/lib/routes';
import { cn } from '@/lib/utils';

export function WorkspaceSwitcher() {
  const {
    activeWorkspace,
    isWorkspaceLoading,
    selectWorkspace,
    workspaces,
  } = useWorkspace();
  const ActiveIcon = activeWorkspace.type === 'team' ? Users : User;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Switch workspace"
          className="h-9 max-w-[220px] justify-start gap-2 rounded-md px-2"
          variant="outline"
        >
          <ActiveIcon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium">
              {activeWorkspace.name}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        {workspaces.map((workspace) => {
          const Icon = workspace.type === 'team' ? Users : User;
          const selected = workspace.id === activeWorkspace.id;

          return (
            <DropdownMenuItem
              key={workspace.id}
              className="gap-3"
              disabled={isWorkspaceLoading}
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
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={buildConsoleSettingsPath()} className="gap-3">
            <Settings className="h-4 w-4 text-muted-foreground" />
            Team settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
