import type { ReactNode } from 'react';

import { PageSection } from '@/components/layout/page-shell';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

type PageEmptyStateProps = {
  // Buttons or links under the text.
  actions?: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
};

// A public page whose record could not be shown (it failed to load or does not exist), in
// place of the page: the shadcn Empty in the narrow page width, its title the page's h1. The
// public template page and the Public Profile.
export function PageEmptyState({ actions, description, icon, title }: PageEmptyStateProps) {
  return (
    <PageSection spacing="spacious" width="narrow">
      <Empty className="border">
        <EmptyHeader>
          {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
          <EmptyTitle className="text-2xl">
            <h1>{title}</h1>
          </EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {actions ? <EmptyContent className="flex-row flex-wrap justify-center">{actions}</EmptyContent> : null}
      </Empty>
    </PageSection>
  );
}

// A public page while its record loads: the shadcn Spinner over what is loading.
export function PageLoadingState({ label }: { label: string }) {
  return (
    <PageSection spacing="spacious" width="narrow">
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <Spinner className="size-8" />
          </EmptyMedia>
          <EmptyDescription>{label}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </PageSection>
  );
}
