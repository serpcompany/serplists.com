'use client';

import { useId } from 'react';
import { usePathname } from 'next/navigation';

import {
  publicHeaderItems,
  type PublicHeaderItem,
  type PublicSiteLink,
} from '@/components/layout/publicSiteLinks';
import { Link } from '@/components/navigation/Link';
import {
  NavigationMenu,
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
    <NavigationMenu align={align} aria-label="Site" className={className}>
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
    </NavigationMenu>
  );
}
