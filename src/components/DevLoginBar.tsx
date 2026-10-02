'use client';

import type { JSX } from 'react';
import React from 'react';
import { Users, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/page-shell';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { signOutAndLeave } from '@/features/auth/signOut';
import {
  DEV_TEST_USERS,
  DEV_TEST_USER_PASSWORD_RESET_COMMAND,
  getDevTestUserPasswordHelp,
  type DevTestUser,
} from '@/lib/auth/devUsers';
import {
  buildConsoleHomePath,
  buildHomePath,
  buildPublicCategoriesPath,
  DASHBOARD_PATH,
  isBlankTemplateEditorRoute,
  isPathWithin,
  isPublicTemplatesDiscoveryPath,
} from '@/lib/routes';
import { toast } from 'sonner';
import { usePathname } from 'next/navigation';

import { useIsClient } from '@/hooks/useIsClient';
import { useAppRouter } from '@/lib/navigation/useAppRouter';

function resolveOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

export function DevLoginBar(): JSX.Element | null {
  const { login, logout, user } = useAuth();
  const pathname = usePathname();
  const router = useAppRouter();
  const hydrated = useIsClient();
  const [isVisible, setIsVisible] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);

  if (process.env.NODE_ENV === 'production' || !hydrated) return null;

  if (isBlankTemplateEditorRoute(pathname)) {
    return null;
  }

  if (isPublicTemplatesDiscoveryPath(pathname)) {
    return null;
  }

  if (
    [buildHomePath(), buildPublicCategoriesPath(), '/profile/', '/share/', DASHBOARD_PATH].some(
      (section) => isPathWithin(pathname, section),
    )
  ) {
    return null;
  }

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 left-4 z-50 bg-yellow-500 text-black p-2 rounded-full shadow-lg hover:bg-yellow-400 transition-colors"
        title="Show Dev Login Bar"
      >
        <Users className="h-5 w-5" />
      </button>
    );
  }

  const handleQuickLogin = async (testUser: DevTestUser) => {
    setIsLoading(true);
    try {
      const result = await login(testUser.email, testUser.password);
      if (result.ok) {
        toast.success(`Logged in as ${testUser.name}`);
        router.push(buildConsoleHomePath());
      } else {
        toast.error(result.error ?? `Login failed. If this dev password was changed locally, run ${DEV_TEST_USER_PASSWORD_RESET_COMMAND}.`);
      }
    } catch (error) {
      toast.error('Login error - check the dev server log (tmp/logs/dev-all.log).');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await signOutAndLeave({
        logout,
        onSignedOut: () => {
          toast.success('Logged out');
          router.push('/');
        },
        onError: (message) => toast.error(message),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-yellow-100 dark:bg-yellow-900 border-t-4 border-yellow-500 p-3 shadow-lg">
      <PageContainer className="flex items-center justify-between px-0 sm:px-0 lg:px-0" width="shell">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-yellow-800 dark:text-yellow-200">
              🧪 DEV MODE
            </span>
            {user && (
              <span className="text-sm text-yellow-700 dark:text-yellow-300">
                | Logged in as: <strong>{user.name || user.email}</strong>
              </span>
            )}
          </div>
          
          <div className="flex gap-2">
            {DEV_TEST_USERS.map((testUser: DevTestUser) => (
              <Button
                key={testUser.email}
                size="sm"
                variant="outline"
                onClick={() => handleQuickLogin(testUser)}
                disabled={isLoading || user?.email === testUser.email}
                className={`
                  ${user?.email === testUser.email ? 'ring-2 ring-offset-2 ring-yellow-500' : ''}
                  hover:bg-white dark:hover:bg-gray-800
                `}
              >
                <div className={`w-2 h-2 rounded-full ${testUser.color} mr-2`} />
                {testUser.name}
              </Button>
            ))}
            
            {user && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void handleLogout()}
                disabled={isLoading}
              >
                Logout
              </Button>
            )}
          </div>
        </div>

        <button
          onClick={() => setIsVisible(false)}
          className="text-yellow-700 hover:text-yellow-900 dark:text-yellow-300 dark:hover:text-yellow-100"
          title="Hide Dev Bar"
        >
          <X className="h-4 w-4" />
        </button>
      </PageContainer>
      
      <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-2 text-center">
        App and API: {resolveOrigin()} | 
        <span className="ml-1">{getDevTestUserPasswordHelp()}</span>
      </div>
    </div>
  );
}
