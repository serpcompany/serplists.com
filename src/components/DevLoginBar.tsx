import React from 'react';
import { Users, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/page-shell';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import {
  DEV_TEST_USERS,
  DEV_TEST_USER_PASSWORD_RESET_COMMAND,
  getDevTestUserPasswordHelp,
  type DevTestUser,
} from '@/lib/auth/devUsers';
import {
  buildConsoleHomePath,
  isBlankTemplateEditorRoute,
  isPublicTemplatesDiscoveryPath,
} from '@/lib/routes';
import { toast } from 'sonner';
import { useLocation, useNavigate } from 'react-router-dom';

function resolveFrontendPort(): string {
  return typeof window === 'undefined' ? '' : window.location.port;
}

export function DevLoginBar(): JSX.Element | null {
  const { login, logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);

  // Only show in development
  if (!import.meta.env.DEV) return null;

  if (isBlankTemplateEditorRoute(location.pathname)) {
    return null;
  }

  if (isPublicTemplatesDiscoveryPath(location.pathname)) {
    return null;
  }

  if (
    location.pathname === '/' ||
    location.pathname.startsWith('/categories') ||
    location.pathname.startsWith('/profile/') ||
    location.pathname.startsWith('/run/') ||
    location.pathname.startsWith('/share/')
  ) {
    return null;
  }

  if (location.pathname.startsWith(buildConsoleHomePath())) {
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
        navigate(buildConsoleHomePath());
      } else {
        toast.error(result.error ?? `Login failed. If this dev password was changed locally, run ${DEV_TEST_USER_PASSWORD_RESET_COMMAND}.`);
      }
    } catch (error) {
      toast.error('Login error - is the API running on port 8788?');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out');
    navigate('/');
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
                onClick={handleLogout}
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
        API: http://localhost:8788 | Frontend: http://localhost:{resolveFrontendPort()} | 
        <span className="ml-1">{getDevTestUserPasswordHelp()}</span>
      </div>
    </div>
  );
}
