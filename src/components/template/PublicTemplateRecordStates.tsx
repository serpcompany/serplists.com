import type { ReactNode } from 'react';
import { ArrowLeft, FileX } from 'lucide-react';

import { PageEmptyState, PageLoadingState } from '@/components/layout/PageState';
import { Link } from '@/components/navigation/Link';
import { NoIndexMeta } from '@/components/seo/NoIndexMeta';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { TEMPLATE_NOT_FOUND_PAGE_TEXT } from '@/lib/publicPageMeta';
import { buildPublicTemplatesPath } from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

type PublicTemplateRecordStatesProps = {
  children: (template: ChecklistTemplate) => ReactNode;
  loadError: string | null;
  loading: boolean;
  notFound: boolean;
  onRetry: () => void;
  template: ChecklistTemplate | null;
};

export function PublicTemplateRecordStates({
  children,
  loadError,
  loading,
  notFound,
  onRetry,
  template,
}: PublicTemplateRecordStatesProps) {
  if (loading) {
    return <PageLoadingState label="Loading template…" />;
  }

  if (loadError && !template) {
    return (
      <PageEmptyState
        actions={
          <>
            <Button onClick={onRetry}>Try again</Button>
            <Link href={buildPublicTemplatesPath()} className={buttonVariants({ variant: 'outline' })}>
              Browse the Template Library
            </Link>
          </>
        }
        description={loadError}
        title="Unable to load template"
      />
    );
  }

  if (notFound || !template) {
    return (
      <>
        <NoIndexMeta follow={false} />
        <PageEmptyState
          actions={
            <Link href={buildPublicTemplatesPath()} className={buttonVariants()}>
              <ArrowLeft data-icon="inline-start" />
              Browse the Template Library
            </Link>
          }
          description={TEMPLATE_NOT_FOUND_PAGE_TEXT.description}
          icon={<FileX />}
          title={TEMPLATE_NOT_FOUND_PAGE_TEXT.title}
        />
      </>
    );
  }

  return <>{children(template)}</>;
}
