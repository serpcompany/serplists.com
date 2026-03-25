import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BadgeCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PublicPill } from '@/components/shared/PublicPill';
import { UserInfo } from '@/components/shared/UserInfo';
import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';
import { buildPublicCategoryPath, buildPublicProfilePath } from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

interface TemplateCardProps {
  template: ChecklistTemplate;
  viewMode: 'grid' | 'list';
  onTemplateClick: (template: ChecklistTemplate) => void;
}

const countTemplateItems = (template: ChecklistTemplate) =>
  template.sections.reduce((total, section) => total + section.items.length, 0);

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  viewMode,
  onTemplateClick,
}) => {
  const navigate = useNavigate();

  const handleCategoryClick = (event: React.MouseEvent, category: string) => {
    event.preventDefault();
    event.stopPropagation();
    navigate(buildPublicCategoryPath(category));
  };

  const totalItems = countTemplateItems(template);
  const categories = template.categories || [];
  const ownerLabel =
    template.ownerProfile?.full_name || template.ownerProfile?.username;
  const ownerProfilePath = template.ownerProfile?.username
    ? buildPublicProfilePath(template.ownerProfile.username)
    : null;
  const isOfficial =
    template.userId === REPO_TEMPLATE_USER_ID ||
    template.id.startsWith('repo:');

  if (viewMode === 'list') {
    return (
      <Card
        className="group overflow-hidden rounded-2xl border-border bg-card shadow-[0_18px_48px_-34px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_24px_60px_-36px_rgba(15,23,42,0.24)]"
        onClick={() => onTemplateClick(template)}
      >
        <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {isOfficial ? (
                <Badge className="rounded-full border border-border bg-secondary px-3 text-secondary-foreground hover:bg-secondary">
                  <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                  Official
                </Badge>
              ) : null}
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Public template
              </span>
            </div>

            <h3 className="mt-3 text-2xl font-semibold text-foreground">
              {template.title}
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              {template.description ||
                'Reusable checklist pack ready to clone or run.'}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>{template.sections.length} sections</span>
              <span>{totalItems} items</span>
              {ownerLabel ? (
                ownerProfilePath ? (
                  <Link
                    to={ownerProfilePath}
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    by {ownerLabel}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <span>by {ownerLabel}</span>
                )
              ) : (
                <UserInfo userId={template.userId} />
              )}
            </div>

            {categories.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.slice(0, 4).map((category) => (
                  <PublicPill key={category} asChild>
                    <a
                      href={buildPublicCategoryPath(category)}
                      onClick={(event) => handleCategoryClick(event, category)}
                    >
                      {category}
                    </a>
                  </PublicPill>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground">
              View checklist
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="group h-full cursor-pointer overflow-hidden rounded-2xl border-border bg-card shadow-[0_18px_48px_-34px_rgba(15,23,42,0.18)] transition hover:-translate-y-1 hover:border-primary hover:shadow-[0_24px_60px_-36px_rgba(15,23,42,0.24)]"
      onClick={() => onTemplateClick(template)}
    >
      <CardContent className="flex h-full flex-col p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {isOfficial ? (
              <Badge className="rounded-full border border-border bg-secondary px-3 text-secondary-foreground hover:bg-secondary">
                <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                Official
              </Badge>
            ) : null}
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Template pack
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>

        <div className="mt-5 flex-1">
          <h3 className="line-clamp-2 text-2xl font-semibold text-foreground">
            {template.title}
          </h3>
          <p className="mt-3 line-clamp-4 text-sm leading-7 text-muted-foreground">
            {template.description ||
              'Reusable checklist pack ready to clone or run.'}
          </p>
        </div>

        <div className="mt-6 rounded-xl bg-secondary p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{template.sections.length} sections</span>
            <span>{totalItems} items</span>
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            {ownerLabel ? (
              ownerProfilePath ? (
                <Link
                  to={ownerProfilePath}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  by {ownerLabel}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <span>by {ownerLabel}</span>
              )
            ) : (
              <UserInfo userId={template.userId} />
            )}
          </div>
        </div>

        {categories.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.slice(0, 3).map((category) => (
              <PublicPill key={category} asChild>
                <a
                  href={buildPublicCategoryPath(category)}
                  onClick={(event) => handleCategoryClick(event, category)}
                >
                  {category}
                </a>
              </PublicPill>
            ))}
            {categories.length > 3 ? (
              <PublicPill>+{categories.length - 3}</PublicPill>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
