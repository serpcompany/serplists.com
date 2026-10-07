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
import { isWithinConsoleArea, type ConsoleContext } from '@/lib/consoleRoutes';
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
import { cn } from '@/lib/utils';

type NavItem = { href: string; icon: typeof FileText; label: string };

const FULL_SIZE_TARGET_CLASS = 'h-11';

const mainItems = (context: ConsoleContext): NavItem[] => [
  { href: buildConsoleTemplatesPath(context), icon: FileText, label: 'Templates' },
  { href: buildConsoleRunsPath(context), icon: Play, label: 'Runs' },
  { href: buildPublicTemplatesPath(), icon: Globe, label: 'Template Library' },
  { href: buildPublicCategoriesPath(), icon: FolderOpen, label: 'Categories' },
];

const secondaryItems = (context: ConsoleContext): NavItem[] => [
  { href: buildConsoleTemplateImportPath(context), icon: Import, label: 'Import Templates' },
  { href: buildConsoleArchivePath(context), icon: Archive, label: 'Archive' },
  { href: buildConsoleSettingsPath(context), icon: Settings, label: 'Settings' },
];

function NavItems({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isPathWithin(pathname, item.href) || isWithinConsoleArea(pathname, item.href);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              className={FULL_SIZE_TARGET_CLASS}
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
    <SidebarMenuButton
      aria-label={accessibleLabel}
      className={FULL_SIZE_TARGET_CLASS}
      tooltip={label}
      onClick={toggle}
      type="button"
    >
      <ThemeIcon />
      <span>{label}</span>
    </SidebarMenuButton>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { canEditTemplates, consoleContext } = useWorkspace();

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
                      className={cn(
                        FULL_SIZE_TARGET_CLASS,
                        'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground',
                      )}
                      render={<Link href={buildConsoleTemplateCreatePath(consoleContext)} />}
                    >
                      <CirclePlus />
                      <span>New Template</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              ) : null}
              <NavItems items={mainItems(consoleContext)} pathname={pathname} />
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <NavItems items={secondaryItems(consoleContext)} pathname={pathname} />
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
