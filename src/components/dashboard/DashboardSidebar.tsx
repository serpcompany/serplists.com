import { Link, useLocation } from 'react-router-dom';
import {
  FileText,
  Globe,
  Import,
  LayoutGrid,
  Play,
  PlusCircle,
  Settings,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  buildConsoleProfilePath,
  buildConsoleRunsPath,
  buildConsoleSettingsPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplateImportPath,
  buildConsoleTemplatesPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { APP_BRAND_NAME } from '@/lib/brand';

const navItems = [
  {
    href: buildConsoleTemplatesPath(),
    icon: FileText,
    label: 'Templates',
  },
  {
    href: buildConsoleRunsPath(),
    icon: Play,
    label: 'Runs',
  },
  {
    href: buildPublicTemplatesPath(),
    icon: Globe,
    label: 'Discover',
  },
];

const secondaryNavItems = [
  {
    href: buildConsoleProfilePath(),
    icon: User,
    label: 'Profile',
  },
  {
    href: buildConsoleSettingsPath(),
    icon: Settings,
    label: 'Settings',
  },
];

const isActivePath = (pathname: string, href: string) =>
  pathname === href ||
  pathname.startsWith(`${href}/`) ||
  (href === buildConsoleRunsPath() && pathname.startsWith('/run/'));

export function DashboardSidebar() {
  const location = useLocation();
  const importTemplatesPath = buildConsoleTemplateImportPath();
  const importTemplatesActive = isActivePath(location.pathname, importTemplatesPath);

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <LayoutGrid className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {APP_BRAND_NAME}
        </span>
      </div>

      <div className="p-3">
        <Button asChild className="w-full justify-start gap-2">
          <Link to={buildConsoleTemplateCreatePath()}>
            <PlusCircle className="h-4 w-4" />
            New Template
          </Link>
        </Button>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = isActivePath(location.pathname, item.href);

            return (
              <li key={item.href}>
                <Link
                  to={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-secondary font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="my-4 border-t border-border" />

        <ul className="space-y-1">
          {secondaryNavItems.map((item) => {
            const active = isActivePath(location.pathname, item.href);

            return (
              <li key={item.href}>
                <Link
                  to={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-secondary font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-2 border-t border-border p-3">
        <ThemeToggle showLabel />
        <Button
          asChild
          variant={importTemplatesActive ? 'secondary' : 'outline'}
          className="w-full justify-start gap-2"
        >
          <Link to={importTemplatesPath}>
            <Import className="h-4 w-4" />
            Import Templates
          </Link>
        </Button>
      </div>
    </aside>
  );
}
