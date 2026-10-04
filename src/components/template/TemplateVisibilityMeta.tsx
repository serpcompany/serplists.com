import { Globe, Lock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buildCanonicalPublicTemplatePath } from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

import { Link } from '@/components/navigation/Link';

type TemplateVisibilityMetaProps = {
  template: Pick<ChecklistTemplate, 'id' | 'isPublic' | 'ownerProfile' | 'slug' | 'userId'>;
};

export function TemplateVisibilityMeta({ template }: TemplateVisibilityMetaProps) {
  if (!template.isPublic) {
    return (
      <Badge variant="secondary">
        <Lock data-icon="inline-start" />
        Private
      </Badge>
    );
  }

  const publicPath = buildCanonicalPublicTemplatePath(template);
  return (
    <>
      <Badge variant="secondary">
        <Globe data-icon="inline-start" />
        Public
      </Badge>
      {publicPath ? (
        <Link href={publicPath} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          View public template
        </Link>
      ) : (
        <span className="text-sm text-muted-foreground">Public page unavailable until its creator sets a username</span>
      )}
    </>
  );
}
