import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions, linkItems } from '@/components/layouts/shared';
import { BookOpen, Boxes, ClipboardList, Sparkles } from 'lucide-react';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <HomeLayout
      {...baseOptions()}
      links={[
        {
          text: 'Docs Overview',
          url: '/docs/overview',
          icon: <BookOpen />,
          active: 'nested-url',
        },
        {
          text: 'Inventory',
          url: '/docs/inventory',
          icon: <ClipboardList />,
          active: 'nested-url',
        },
        {
          text: 'Features',
          url: '/docs/features',
          icon: <Sparkles />,
          active: 'nested-url',
        },
        {
          text: 'UI Blocks',
          url: '/docs/ui-blocks',
          icon: <Boxes />,
          active: 'nested-url',
        },
        ...linkItems,
      ]}
      className="dark:bg-neutral-950 dark:[--color-fd-background:var(--color-neutral-950)] [--color-fd-primary:var(--color-brand)]"
    >
      {children}
    </HomeLayout>
  );
}
