'use client';

import { useState, type ReactElement } from 'react';
import { ChevronsUpDown, LogOut } from 'lucide-react';
import { toast } from 'sonner';

import { Link } from '@/components/navigation/Link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { useSidebar } from '@/components/ui/use-sidebar';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { signOutAndLeave } from '@/features/auth/signOut';
import { leaveAfterConfirmed } from '@/lib/navigation/leaveGuard';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import {
  buildConsoleRunsPath,
  buildConsoleSettingsPath,
  buildConsoleTemplatesPath,
  buildHomePath,
  buildPublicProfilePath,
} from '@/lib/routes';

function AccountMenuContent({
  side,
  trigger,
}: {
  side: 'bottom' | 'right';
  trigger: ReactElement;
}) {
  const { user, logout } = useAuth();
  const router = useAppRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = async () => {
    await leaveAfterConfirmed(async () => {
      setIsSigningOut(true);
      try {
        return await signOutAndLeave({
          logout,
          onSignedOut: () => router.push(buildHomePath()),
          onError: (message) => toast.error(message),
        });
      } finally {
        setIsSigningOut(false);
      }
    });
  };

  return (
    <DropdownMenu>
      {trigger}
      <DropdownMenuContent align="end" className="w-64" side={side} sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5">
            <span className="truncate text-sm font-medium text-popover-foreground">
              {user?.name || 'Your account'}
            </span>
            <span className="truncate text-sm font-normal text-muted-foreground">{user?.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href={buildConsoleTemplatesPath()} />}>
            My Templates
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={buildConsoleRunsPath()} />}>My Runs</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={buildConsoleSettingsPath()} />}>Settings</DropdownMenuItem>
          {user?.username ? (
            <DropdownMenuItem
              render={
                <Link
                  href={buildPublicProfilePath(user.username)}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              Profile
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isSigningOut}
          onClick={() => void handleLogout()}
        >
          <LogOut />
          {isSigningOut ? 'Signing out...' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const useUserInitial = () => {
  const { user } = useAuth();
  return (
    user?.name?.charAt(0)?.toUpperCase() ??
    user?.email?.charAt(0)?.toUpperCase() ??
    'U'
  );
};

function UserAvatar() {
  const { user } = useAuth();
  const initial = useUserInitial();

  return (
    <Avatar size="sm">
      <AvatarImage src={user?.image || undefined} alt="" />
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  );
}

export function AccountMenu() {
  return (
    <AccountMenuContent
      side="bottom"
      trigger={
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu" />}
        >
          <UserAvatar />
        </DropdownMenuTrigger>
      }
    />
  );
}

export function SidebarAccountMenu() {
  const { user } = useAuth();
  const { isMobile } = useSidebar();

  return (
    <AccountMenuContent
      side={isMobile ? 'bottom' : 'right'}
      trigger={
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              aria-label="Account menu"
              size="lg"
              className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
            />
          }
        >
          <UserAvatar />
          <span className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate font-medium">{user?.name || 'Account settings'}</span>
            <span className="truncate text-xs text-muted-foreground">
              {user?.username ? `@${user.username}` : user?.email || 'Account'}
            </span>
          </span>
          <ChevronsUpDown className="ml-auto" />
        </DropdownMenuTrigger>
      }
    />
  );
}
