'use client';

import { usePathname } from 'next/navigation';
import {
  Archive,
  FileText,
  Globe,
  Import,
  LayoutGrid,
  Play,
  PlusCircle,
  Settings,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { cn } from '@/lib/utils';
import {
  buildConsoleArchivePath,
  buildConsoleRunsPath,
  buildConsoleSettingsPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplateImportPath,
  buildConsoleTemplatesPath,
  buildPublicTemplatesPath,
  isPathWithin,
} from '@/lib/routes';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { APP_BRAND_NAME } from '@/lib/brand';

import { Link } from '@/components/navigation/Link';

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
    href: buildConsoleArchivePath(),
    icon: Archive,
    label: 'Archive',
  },
  {
    href: buildConsoleSettingsPath(),
    icon: Settings,
    label: 'Settings',
  },
];

// A run's own page (/run/<id>/) belongs to Runs.
const isActivePath = (pathname: string, href: string) =>
  isPathWithin(pathname, href) ||
  (href === buildConsoleRunsPath() && isPathWithin(pathname, '/run/'));

export function DashboardSidebar() {
  const pathname = usePathname();
  const { canEditTemplates } = useWorkspace();
  const importTemplatesPath = buildConsoleTemplateImportPath();
  const importTemplatesActive = isActivePath(pathname, importTemplatesPath);

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <LayoutGrid className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {APP_BRAND_NAME}
        </span>
      </div>

      {canEditTemplates ? (
        <div className="p-3">
          <Button asChild className="w-full justify-start gap-2">
            <Link href={buildConsoleTemplateCreatePath()}>
              <PlusCircle className="h-4 w-4" />
              New Template
            </Link>
          </Button>
        </div>
      ) : null}

      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <li key={item.href}>
                <Button
                  asChild
                  variant={active ? 'secondary' : 'ghost'}
                  className={cn(
                    'min-h-11 w-full justify-start gap-2 px-3 text-sm',
                    active
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Link href={item.href}>
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>

        <div className="my-4 border-t border-border" />

        <ul className="space-y-1">
          {secondaryNavItems.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <li key={item.href}>
                <Button
                  asChild
                  variant={active ? 'secondary' : 'ghost'}
                  className={cn(
                    'min-h-11 w-full justify-start gap-2 px-3 text-sm',
                    active
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Link href={item.href}>
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </Button>
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
          <Link href={importTemplatesPath}>
            <Import className="h-4 w-4" />
            Import Templates
          </Link>
        </Button>
      </div>
    </aside>
  );
}
