import { Calendar, Clock, Globe, History, Tag } from 'lucide-react';

import { ChangelogList } from '@/components/shared/ChangelogList';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { TemplateHistoryTimelineEntry } from '@/features/template-detail/templateHistoryTimeline';
import { formatLocalDateTime } from '@/lib/utils/dbTimestamp';

// Template detail's cards under its structure: Details, Categories & Tags and Changelog.

type TemplateDetailsCardProps = {
  createdDate: string;
  isPublic: boolean;
  onVisibilityChange: (isPublic: boolean) => void;
  updatedDate: string;
  // The switch waits for an edit role, and while Share or a change is in flight.
  visibilityDisabled: boolean;
};

// Created, Last updated and the visibility switch, as rows of a label and a value.
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
                // A native button, so the Label's htmlFor names it.
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

// The categories as badges and the tags as outline badges, or a line saying there are none.
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
};

// The Template's versions and the events no version records, newest first.
export function TemplateHistoryCard({ className, entries, isError, isLoading }: TemplateHistoryCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <History aria-hidden="true" className="size-4 text-muted-foreground" />
          Changelog
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChangelogList
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
        />
      </CardContent>
    </Card>
  );
}
