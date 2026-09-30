import type { ReactNode } from 'react';

import { IconTile } from '@/components/layout/IconTile';
import { PageSection } from '@/components/layout/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { FieldDescription } from '@/components/ui/field';
import { cn } from '@/lib/utils';

type AuthCardProps = {
  // Beside the content from lg (hidden below it), as the image in shadcn's login block.
  aside?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  // A short line above the title, such as the brand name.
  eyebrow?: ReactNode;
  // A line under the content, such as a link to the other sign-in page.
  footer?: ReactNode;
  icon: ReactNode;
  title: ReactNode;
};

// A card centered in the window with a page's own short task: an icon tile, the page's h1 and
// description, the content (a form, a message) and a footer line, with an optional aside
// beside them from lg. shadcn's login block: the sign-in pages and the Organization invite.
export function AuthCard({ aside, children, description, eyebrow, footer, icon, title }: AuthCardProps) {
  return (
    <PageSection
      className="flex min-h-[calc(100svh-3.5rem)] items-center"
      containerClassName="flex justify-center"
      spacing="compact"
      width="shell"
    >
      <Card className={cn('w-full p-0', aside ? 'max-w-md lg:max-w-4xl' : 'max-w-md')} data-slot="auth-card">
        <CardContent className={cn('grid p-0', aside && 'lg:grid-cols-2')}>
          <div className="flex min-w-0 flex-col gap-6 p-6 md:p-8">
            <header className="flex flex-col items-center gap-3 text-center">
              <IconTile>{icon}</IconTile>
              <div className="flex flex-col gap-1">
                {eyebrow ? <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p> : null}
                <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
                {description ? (
                  <p className="text-sm text-balance text-muted-foreground">{description}</p>
                ) : null}
              </div>
            </header>
            {children}
            {footer ? <FieldDescription className="text-center">{footer}</FieldDescription> : null}
          </div>
          {aside ? <aside className="hidden border-l bg-muted p-8 lg:flex">{aside}</aside> : null}
        </CardContent>
      </Card>
    </PageSection>
  );
}
