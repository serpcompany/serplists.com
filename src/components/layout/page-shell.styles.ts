import { cva, type VariantProps } from 'class-variance-authority';

// The page width every shell and page lines up to: the site header and footer, the sidebar
// inset's content, and each page's sections.
export const pageContainerVariants = cva(
  'mx-auto w-full px-4 md:px-6',
  {
    variants: {
      width: {
        shell: 'max-w-6xl',
        content: 'max-w-6xl',
        narrow: 'max-w-4xl',
        wide: 'max-w-7xl',
        docs: 'max-w-4xl',
      },
    },
    defaultVariants: {
      width: 'content',
    },
  },
);

export const pageSectionVariants = cva('', {
  variants: {
    spacing: {
      compact: 'py-6',
      default: 'py-8',
      spacious: 'py-12',
      hero: 'pb-10 pt-12 sm:pb-12 sm:pt-16',
    },
  },
  defaultVariants: {
    spacing: 'default',
  },
});

export const pageHeroVariants = cva('flex flex-col gap-4', {
  variants: {
    align: {
      left: 'items-start text-left',
      center: 'items-center text-center',
    },
  },
  defaultVariants: {
    align: 'left',
  },
});

// A square tile holding an icon: the shadcn muted media tile (EmptyMedia's icon variant) in
// three sizes. The `card` tone sits a tile on a muted area, as in a card's media.
export const iconTileVariants = cva(
  "flex shrink-0 items-center justify-center rounded-lg text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      size: {
        sm: "size-8 [&_svg:not([class*='size-'])]:size-4",
        md: "size-10 [&_svg:not([class*='size-'])]:size-5",
        lg: "size-14 rounded-xl [&_svg:not([class*='size-'])]:size-6",
      },
      tone: {
        muted: 'bg-muted',
        card: 'bg-card ring-1 ring-foreground/10',
      },
    },
    defaultVariants: {
      size: 'md',
      tone: 'muted',
    },
  },
);

export type PageContainerWidth = VariantProps<
  typeof pageContainerVariants
>['width'];
export type PageSectionSpacing = VariantProps<
  typeof pageSectionVariants
>['spacing'];
export type PageHeroAlign = VariantProps<typeof pageHeroVariants>['align'];
export type IconTileSize = VariantProps<typeof iconTileVariants>['size'];
