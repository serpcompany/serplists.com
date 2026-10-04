import { Calendar, Clock, Globe, History, Tag } from 'lucide-react';

import { ActivityList, type ActivityViewAll } from '@/components/shared/ActivityList';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { TemplateHistoryTimelineEntry } from '@/features/template-detail/templateHistoryTimeline';
import { formatLocalDateTime } from '@/lib/utils/dbTimestamp';

type TemplateDetailsCardProps = {
  createdDate: string;
  isPublic: boolean;
  onVisibilityChange: (isPublic: boolean) => void;
  updatedDate: string;
  visibilityDisabled: boolean;
};

export function TemplateDetailsCard({
  createdDate,
  isPublic,
  onVisibilityChange,
  updatedDate,
  visibilityDisabled,
}: TemplateDetailsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <Calendar aria-hidden="true" className="size-4" />
              Created
            </dt>
            <dd>{createdDate}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <Clock aria-hidden="true" className="size-4" />
              Last updated
            </dt>
            <dd>{updatedDate}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <Globe aria-hidden="true" className="size-4" />
              Visibility
            </dt>
            <dd className="flex items-center gap-2">
              <Switch
                nativeButton
                render={<button type="button" />}
                id="template-visibility"
                checked={isPublic}
                disabled={visibilityDisabled}
                onCheckedChange={onVisibilityChange}
              />
              <Label htmlFor="template-visibility">{isPublic ? 'Public' : 'Private'}</Label>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export function TemplateCategoriesCard({ categories, tags }: { categories: string[]; tags: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Categories &amp; Tags</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Categories</p>
          <div className="flex flex-wrap gap-2">
            {categories.length ? (
              categories.map((category) => (
                <Badge key={category} variant="secondary">
                  {category}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No categories assigned</p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Tags</p>
          <div className="flex flex-wrap gap-2">
            {tags.length ? (
              tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  <Tag data-icon="inline-start" />
                  {tag}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No tags assigned</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type TemplateHistoryCardProps = {
  className?: string;
  entries: TemplateHistoryTimelineEntry[];
  isError: boolean;
  isLoading: boolean;
  viewAll?: ActivityViewAll | undefined;
};

export function TemplateHistoryCard({ className, entries, isError, isLoading, viewAll }: TemplateHistoryCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <History aria-hidden="true" className="size-4 text-muted-foreground" />
          Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ActivityList
          emptyLabel="No template history has been recorded yet."
          entries={entries.map((entry) => ({
            actor: entry.actorName,
            key: entry.key,
            label: entry.label,
            time: formatLocalDateTime(entry.createdAt),
          }))}
          errorLabel="Template history is unavailable right now."
          isError={isError}
          isLoading={isLoading}
          loadingLabel="Loading template history..."
          viewAll={viewAll}
        />
      </CardContent>
    </Card>
  );
}
