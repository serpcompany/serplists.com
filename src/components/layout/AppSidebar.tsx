'use client';

import { usePathname } from 'next/navigation';
import {
  Archive,
  CirclePlus,
  FileText,
  FolderOpen,
  Globe,
  Import,
  Play,
  Settings,
} from 'lucide-react';

import { SidebarAccountMenu } from '@/components/layout/AccountMenu';
import { BrandMark } from '@/components/layout/BrandLink';
import { Link } from '@/components/navigation/Link';
import { ThemeIcon } from '@/components/theme/ThemeToggle';
import { useThemeToggle } from '@/components/theme/useThemeToggle';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { APP_BRAND_NAME } from '@/lib/brand';
import {
  buildConsoleArchivePath,
  buildConsoleRunsPath,
  buildConsoleSettingsPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplateImportPath,
  buildConsoleTemplatesPath,
  buildHomePath,
  buildPublicCategoriesPath,
  buildPublicTemplatesPath,
  isPathWithin,
} from '@/lib/routes';

type NavItem = { href: string; icon: typeof FileText; label: string };

const mainItems: NavItem[] = [
  { href: buildConsoleTemplatesPath(), icon: FileText, label: 'Templates' },
  { href: buildConsoleRunsPath(), icon: Play, label: 'Runs' },
  { href: buildPublicTemplatesPath(), icon: Globe, label: 'Discover' },
  { href: buildPublicCategoriesPath(), icon: FolderOpen, label: 'Categories' },
];

const secondaryItems: NavItem[] = [
  { href: buildConsoleTemplateImportPath(), icon: Import, label: 'Import Templates' },
  { href: buildConsoleArchivePath(), icon: Archive, label: 'Archive' },
  { href: buildConsoleSettingsPath(), icon: Settings, label: 'Settings' },
];

// A run's own page (/run/<id>/) belongs to Runs.
const isActivePath = (pathname: string, href: string) =>
  isPathWithin(pathname, href) ||
  (href === buildConsoleRunsPath() && isPathWithin(pathname, '/run/'));

function NavItems({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={active}
              tooltip={item.label}
              render={<Link href={item.href} aria-current={active ? 'page' : undefined} />}
            >
              <item.icon />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function ThemeMenuButton() {
  const { accessibleLabel, label, toggle } = useThemeToggle();

  return (
    <SidebarMenuButton aria-label={accessibleLabel} tooltip={label} onClick={toggle} type="button">
      <ThemeIcon />
      <span>{label}</span>
    </SidebarMenuButton>
  );
}

// The console sidebar (the shadcn Sidebar block, collapsible to icons): the brand and the
// context switcher, the console navigation, and the theme switch and account menu. On
// phones it opens as a sheet from the top bar's trigger.
export function AppSidebar() {
  const pathname = usePathname();
  const { canEditTemplates } = useWorkspace();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={APP_BRAND_NAME}
              render={<Link href={buildHomePath()} />}
            >
              <BrandMark className="size-8 rounded-lg" />
              <span className="truncate font-semibold">{APP_BRAND_NAME}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <WorkspaceSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Dashboard" className="flex min-h-0 flex-1 flex-col">
          <SidebarGroup>
            <SidebarGroupContent className="flex flex-col gap-2">
              {canEditTemplates ? (
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="New Template"
                      className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                      render={<Link href={buildConsoleTemplateCreatePath()} />}
                    >
                      <CirclePlus />
                      <span>New Template</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              ) : null}
              <NavItems items={mainItems} pathname={pathname} />
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <NavItems items={secondaryItems} pathname={pathname} />
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeMenuButton />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarAccountMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
