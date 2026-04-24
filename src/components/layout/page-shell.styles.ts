import { cva, type VariantProps } from 'class-variance-authority';

export const pageContainerVariants = cva(
  'mx-auto w-full px-4',
  {
    variants: {
      width: {
        shell: 'max-w-6xl',
        content: 'max-w-6xl',
        narrow: 'max-w-4xl',
        wide: 'max-w-[var(--layout-wide-max)]',
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
      hero: 'py-8 sm:py-10',
    },
  },
  defaultVariants: {
    spacing: 'default',
  },
});

export const pageHeroVariants = cva('space-y-4', {
  variants: {
    align: {
      left: 'text-left',
      center: 'text-center',
    },
  },
  defaultVariants: {
    align: 'left',
  },
});

export const surfaceVariants = cva(
  'text-card-foreground',
  {
    variants: {
      tone: {
        default:
          'rounded-[var(--layout-card-radius)] border border-border bg-card shadow-none',
        glass:
          'rounded-[var(--layout-card-radius)] border border-border bg-card shadow-none',
        metric:
          'rounded-[var(--layout-card-radius)] border border-border bg-card shadow-none',
        console:
          'rounded-[var(--layout-card-radius)] border border-border bg-card shadow-none',
        docs: 'rounded-[var(--layout-card-radius)] border border-border bg-card shadow-none',
        flat: 'bg-transparent border-0 rounded-none shadow-none',
      },
      padding: {
        none: '',
        sm: 'p-4 sm:p-5',
        md: 'p-6',
        lg: 'p-8',
        xl: 'p-10',
      },
    },
    defaultVariants: {
      tone: 'default',
      padding: 'md',
    },
  },
);

export const iconBadgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border border-primary/10 bg-primary/10 text-primary',
  {
    variants: {
      size: {
        sm: 'h-10 w-10',
        md: 'h-12 w-12',
        lg: 'h-14 w-14',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

export const pageEyebrowClassName =
  'text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground';

export const pageTitleClassName =
  'text-3xl font-semibold tracking-tight text-foreground sm:text-4xl';

export const pageDescriptionClassName =
  'text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7';

export const sectionTitleClassName =
  'text-2xl font-semibold tracking-tight text-foreground';

export type PageContainerWidth = VariantProps<
  typeof pageContainerVariants
>['width'];
export type PageSectionSpacing = VariantProps<
  typeof pageSectionVariants
>['spacing'];
export type PageHeroAlign = VariantProps<typeof pageHeroVariants>['align'];
export type SurfaceTone = VariantProps<typeof surfaceVariants>['tone'];
export type SurfacePadding = VariantProps<typeof surfaceVariants>['padding'];
export type IconBadgeSize = VariantProps<typeof iconBadgeVariants>['size'];
