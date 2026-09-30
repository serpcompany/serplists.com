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
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import { isPathWithin } from '@/lib/routes';
import { cn } from '@/lib/utils';

/** True on the page a header item links to, or on any page of a menu's links or section. */
const isHeaderItemActive = (pathname: string, item: PublicHeaderItem): boolean =>
  item.kind === 'link'
    ? isPathWithin(pathname, item.link.href)
    : item.links.some((link) => isPathWithin(pathname, link.href)) ||
      (item.section !== undefined && isPathWithin(pathname, item.section));

// A link in a menu: its label names it and its description describes it, so a screen reader
// reads "Categories, link" and then the line under it.
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

// shadcn's NavigationMenu (src/components/ui/navigation-menu.tsx) with the same classes, except
// that the popup the open menu shows in is a div. Base UI renders that popup as a <nav>, and the
// menu's trigger claims the links inside it (aria-owns), so screen readers read them in the "Site"
// navigation and the popup was left an empty, unlabelled navigation landmark after the page.
// The shadcn component cannot pass the popup a `render`, so the root is composed here.
function SiteNavigationMenuRoot({
  align,
  children,
  className,
}: {
  align: 'start' | 'center' | 'end';
  children: ReactNode;
  className?: string;
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

// The site's navigation in the public header and the console's top bar: "Templates" and
// "Features" open menus of their pages, "Pricing" is a link. Menu content stays in the HTML
// (hidden) while closed, so crawlers find every page it links. The current page's link is
// marked, and so is the menu that holds it.
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
