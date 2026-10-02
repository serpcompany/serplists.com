'use client';

import { useId, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { NavigationMenu as NavigationMenuPrimitive } from '@base-ui/react/navigation-menu';

import {
  publicHeaderItems,
  type PublicHeaderItem,
  type PublicSiteLink,
} from '@/components/layout/publicSiteLinks';
import { Link } from '@/components/navigation/Link';
import {
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import { navigationMenuTriggerStyle } from '@/components/ui/navigation-menu-trigger-style';
import { isPathWithin } from '@/lib/routes';
import { cn } from '@/lib/utils';

const isHeaderItemActive = (pathname: string, item: PublicHeaderItem): boolean =>
  item.kind === 'link'
    ? isPathWithin(pathname, item.link.href)
    : item.links.some((link) => isPathWithin(pathname, link.href)) ||
      (item.sectionPath !== undefined && isPathWithin(pathname, item.sectionPath));

function MenuLink({ link, pathname }: { link: PublicSiteLink; pathname: string }) {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = link.description ? `${id}-description` : undefined;

  return (
    <li>
      <NavigationMenuLink
        active={isPathWithin(pathname, link.href)}
        aria-describedby={descriptionId}
        aria-labelledby={labelId}
        closeOnClick
        render={<Link href={link.href} />}
      >
        <div className="flex flex-col gap-1">
          <div className="leading-none font-medium" id={labelId}>
            {link.label}
          </div>
          {link.description ? (
            <div className="line-clamp-2 text-muted-foreground" id={descriptionId}>
              {link.description}
            </div>
          ) : null}
        </div>
      </NavigationMenuLink>
    </li>
  );
}

function SiteNavigationMenuRoot({
  align,
  children,
  className,
}: {
  align: 'start' | 'center' | 'end';
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <NavigationMenuPrimitive.Root
      aria-label="Site"
      data-slot="navigation-menu"
      className={cn('group/navigation-menu relative flex max-w-max flex-1 items-center justify-center', className)}
    >
      {children}
      <NavigationMenuPrimitive.Portal>
        <NavigationMenuPrimitive.Positioner
          align={align}
          alignOffset={0}
          side="bottom"
          sideOffset={8}
          className="isolate z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) transition-[top,left,right,bottom] duration-[0.35s] ease-[cubic-bezier(0.22,1,0.36,1)] data-instant:transition-none data-[side=bottom]:before:top-[-10px] data-[side=bottom]:before:right-0 data-[side=bottom]:before:left-0"
        >
          <NavigationMenuPrimitive.Popup
            render={<div />}
            className="data-[ending-style]:easing-[ease] xs:w-(--popup-width) relative h-(--popup-height) w-(--popup-width) origin-(--transform-origin) rounded-lg bg-popover text-popover-foreground shadow ring-1 ring-foreground/10 transition-[opacity,transform,width,height,scale,translate] duration-[0.35s] ease-[cubic-bezier(0.22,1,0.36,1)] outline-none data-ending-style:scale-90 data-ending-style:opacity-0 data-ending-style:duration-150 data-starting-style:scale-90 data-starting-style:opacity-0"
          >
            <NavigationMenuPrimitive.Viewport className="relative size-full overflow-hidden" />
          </NavigationMenuPrimitive.Popup>
        </NavigationMenuPrimitive.Positioner>
      </NavigationMenuPrimitive.Portal>
    </NavigationMenuPrimitive.Root>
  );
}

export function SiteNavigationMenu({
  align = 'start',
  className,
}: {
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <SiteNavigationMenuRoot align={align} className={className}>
      <NavigationMenuList>
        {publicHeaderItems.map((item) => {
          const active = isHeaderItemActive(pathname, item);

          if (item.kind === 'link') {
            return (
              <NavigationMenuItem key={item.link.href}>
                <NavigationMenuLink
                  active={active}
                  className={navigationMenuTriggerStyle()}
                  render={<Link href={item.link.href} />}
                >
                  {item.link.label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            );
          }

          return (
            <NavigationMenuItem key={item.label}>
              <NavigationMenuTrigger className="data-active:bg-muted/50" data-active={active ? '' : undefined}>
                {item.label}
              </NavigationMenuTrigger>
              <NavigationMenuContent keepMounted>
                <ul className={cn('grid gap-1', item.links.length > 2 ? 'w-[36rem] grid-cols-2' : 'w-80')}>
                  {item.links.map((link) => (
                    <MenuLink key={link.href} link={link} pathname={pathname} />
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </SiteNavigationMenuRoot>
  );
}
