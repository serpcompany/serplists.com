import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarDays,
  Copy,
  ListChecks,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  PublicPageBackLink,
  PublicPageContainer,
  PublicPageSplitLayout,
  PublicSidebarSection,
} from '@/components/layout/PublicPageLayout';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { PublicPill } from '@/components/shared/PublicPill';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import {
  REPO_TEMPLATE_OWNER_NAME,
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
  repoTemplates,
} from '@/lib/repoTemplateCatalog';
import {
  buildCanonicalPublicTemplatePath,
  buildPublicCategoryPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import { normalizeSections } from '@/lib/utils/checklistSections';
import type { ChecklistTemplate } from '@/types/checklist';

type UserProfileRecord = {
  id: string;
  full_name: string | null;
  username: string;
  avatar_url: string | null;
  created_at: string;
};

type UserStats = {
  averageItemsPerTemplate: number;
  categoriesUsed: string[];
  totalItems: number;
  totalTemplates: number;
};

const countTemplateItems = (template: ChecklistTemplate) =>
  template.sections.reduce((total, section) => total + section.items.length, 0);

const formatJoinedDate = (value: string): string =>
  new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

const getProfileDisplayName = (profile: UserProfileRecord): string =>
  profile.full_name?.trim() || `@${profile.username}`;

const getProfileInitials = (profile: UserProfileRecord): string => {
  const source = profile.full_name?.trim() || profile.username.trim();
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return initials || 'SL';
};

const buildProfileSummary = (
  profile: UserProfileRecord,
  stats: UserStats,
): string => {
  if (stats.categoriesUsed.length) {
    return `Public checklist templates from @${profile.username} covering ${stats.categoriesUsed
      .slice(0, 3)
      .join(', ')}.`;
  }

  return `Public checklist templates and repeatable workflow packs published by @${profile.username}.`;
};

const mapApiTemplate = (
  template: Record<string, unknown>,
): ChecklistTemplate => {
  const sections = Array.isArray(template.sections)
    ? template.sections
    : Array.isArray(template.items)
      ? [
          {
            id: '1',
            title: 'Checklist',
            items: template.items,
          },
        ]
      : [];

  return {
    id: String(template.id),
    title: String(template.title),
    description:
      typeof template.description === 'string' ? template.description : '',
    sections: normalizeSections(sections),
    userId: String(template.user_id),
    createdAt: String(template.created_at),
    updatedAt:
      typeof template.updated_at === 'string'
        ? template.updated_at
        : String(template.created_at),
    isPublic: Boolean(template.is_public ?? true),
    slug: typeof template.slug === 'string' ? template.slug : '',
    categories: Array.isArray(template.categories)
      ? (template.categories as string[])
      : [],
    tags: Array.isArray(template.tags) ? (template.tags as string[]) : [],
    version: typeof template.version === 'number' ? template.version : 1,
    ownerProfile:
      typeof template.owner_username === 'string' ||
      typeof template.owner_full_name === 'string'
        ? {
            username:
              typeof template.owner_username === 'string'
                ? template.owner_username
                : undefined,
            full_name:
              typeof template.owner_full_name === 'string'
                ? template.owner_full_name
                : undefined,
          }
        : undefined,
  };
};

const mergeProfileTemplates = (
  username: string,
  apiTemplates: ChecklistTemplate[],
): ChecklistTemplate[] => {
  const merged = new Map<string, ChecklistTemplate>();
  const sources =
    username.toLowerCase() === REPO_TEMPLATE_OWNER_SLUG
      ? [...repoTemplates, ...apiTemplates]
      : apiTemplates;

  sources.forEach((template) => {
    const key = template.slug?.trim() || template.id;
    if (!merged.has(key)) {
      merged.set(key, template);
    }
  });

  return Array.from(merged.values()).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
};

const calculateStats = (templates: ChecklistTemplate[]): UserStats => {
  const totalItems = templates.reduce(
    (total, template) => total + countTemplateItems(template),
    0,
  );
  const categoriesUsed = Array.from(
    new Set(templates.flatMap((template) => template.categories || [])),
  );

  return {
    totalTemplates: templates.length,
    totalItems,
    categoriesUsed,
    averageItemsPerTemplate:
      templates.length > 0 ? Math.round(totalItems / templates.length) : 0,
  };
};

const UserProfile = () => {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        if (!username) {
          setError('No username provided');
          setLoading(false);
          return;
        }

        const profileData = (await api.getProfileByUsername(
          username,
        )) as UserProfileRecord;
        const publicTemplates = (await api.getPublicTemplatesForUser(
          profileData.id,
        )) as Array<Record<string, unknown>>;

        setProfile(profileData);
        setTemplates(
          mergeProfileTemplates(
            profileData.username,
            publicTemplates.map(mapApiTemplate),
          ),
        );
      } catch (caughtError) {
        console.error('Error fetching public profile:', caughtError);

        if (username?.toLowerCase() === REPO_TEMPLATE_OWNER_SLUG) {
          setProfile({
            id: REPO_TEMPLATE_USER_ID,
            full_name: REPO_TEMPLATE_OWNER_NAME,
            username: REPO_TEMPLATE_OWNER_SLUG,
            avatar_url: null,
            created_at: new Date().toISOString(),
          });
          setTemplates(repoTemplates);
          return;
        }

        setError('User not found');
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, [username]);

  const stats = useMemo(() => calculateStats(templates), [templates]);

  const handleCopyProfileLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Profile link copied');
    } catch {
      toast.error('Unable to copy profile link');
    }
  };

  if (loading) {
    return (
      <PublicPageContainer className="py-14">
        <div className="glass-panel p-8">
          <LoadingSpinner message="Loading profile..." />
        </div>
      </PublicPageContainer>
    );
  }

  if (error || !profile) {
    return (
      <PublicPageContainer className="py-14">
        <div className="mb-6">
          <PublicPageBackLink to={buildPublicTemplatesPath()}>
            Back to templates
          </PublicPageBackLink>
        </div>

        <EmptyState
          title={error === 'User not found' ? 'User not found' : 'Error'}
          description={error || 'Unable to load this public profile.'}
          icon={Sparkles}
          className="min-h-0"
        />
      </PublicPageContainer>
    );
  }

  return (
    <PublicPageContainer className="pb-16 pt-6">
      <div className="mb-4">
        <PublicPageBackLink to={buildPublicTemplatesPath()}>
          Back to templates
        </PublicPageBackLink>
      </div>

      <PublicPageSplitLayout
        asidePosition="start"
        className="lg:items-start lg:gap-10"
        asideClassName="lg:sticky lg:top-24 lg:self-start"
        aside={
          <>
            <div className="flex flex-col gap-5">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-border bg-muted p-1.5">
                <Avatar className="h-full w-full rounded-full">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="rounded-full bg-muted text-2xl font-medium text-foreground">
                    {getProfileInitials(profile)}
                  </AvatarFallback>
                </Avatar>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Public profile
                </p>
                <h1 className="mt-3 text-[2rem] font-semibold tracking-tight text-foreground">
                  {getProfileDisplayName(profile)}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  @{profile.username}
                </p>
              </div>

              <p className="text-sm leading-6 text-muted-foreground">
                {buildProfileSummary(profile, stats)}
              </p>

              {stats.categoriesUsed.length ? (
                <div className="flex flex-wrap gap-2">
                  {stats.categoriesUsed.slice(0, 6).map((category) => (
                    <PublicPill key={category} asChild tone="subtle">
                      <Link to={buildPublicCategoryPath(category)}>
                        {category}
                      </Link>
                    </PublicPill>
                  ))}
                </div>
              ) : null}
            </div>

            <PublicSidebarSection divider title="Member since">
              <div className="flex items-start gap-3 text-sm">
                <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="text-muted-foreground">
                  {formatJoinedDate(profile.created_at)}
                </div>
              </div>
            </PublicSidebarSection>

            <PublicSidebarSection divider title="Profile stats">
              <dl className="space-y-3 text-sm">
                {[
                  { label: 'Public templates', value: stats.totalTemplates },
                  { label: 'Documented steps', value: stats.totalItems },
                  {
                    label: 'Average items',
                    value: stats.averageItemsPerTemplate,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-4"
                  >
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd className="font-medium text-foreground">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </PublicSidebarSection>

            <PublicSidebarSection divider title="Actions">
              <div className="flex flex-col items-start gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyProfileLink}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Share profile
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to={buildPublicTemplatesPath()}>Browse templates</Link>
                </Button>
              </div>
            </PublicSidebarSection>
          </>
        }
        main={
          <section className="min-w-0 lg:max-w-[820px]">
            <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Public templates
                </p>
                <h2 className="mt-1.5 text-3xl font-semibold tracking-tight text-foreground">
                  Public templates
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Browse every public checklist published from this profile.
                </p>
              </div>
              <Badge
                variant="secondary"
                className="h-8 rounded-md px-2.5 text-xs font-medium text-secondary-foreground"
              >
                {stats.totalTemplates} live templates
              </Badge>
            </div>

            {templates.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  title="No public templates"
                  description={`@${profile.username} has not published any public templates yet.`}
                  icon={Sparkles}
                  className="min-h-0 rounded-lg border border-dashed"
                />
              </div>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {templates.map((template) => {
                  const templatePath =
                    buildCanonicalPublicTemplatePath(template) ||
                    buildPublicTemplatesPath();
                  const templateSlug = template.slug?.trim() || template.id;

                  return (
                    <Card
                      key={template.id}
                      className="h-full rounded-lg border-border/80 shadow-none transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-sm"
                    >
                      <Link
                        to={templatePath}
                        className="group flex h-full min-h-[208px] flex-col"
                      >
                        <CardHeader className="space-y-2.5 px-4 pb-2.5 pt-4">
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-foreground">
                              <ListChecks className="h-4 w-4" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <CardTitle className="line-clamp-2 text-base leading-snug">
                                    {template.title}
                                  </CardTitle>
                                  <CardDescription className="mt-1 truncate text-[11px]">
                                    {profile.username}/
                                    {templateSlug.replace(/^repo:/, '')}
                                  </CardDescription>
                                </div>
                                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                              </div>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="flex flex-1 flex-col px-4 pb-4 pt-0">
                          <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                            {template.description ||
                              'Public checklist pack published in this creator profile.'}
                          </p>

                          {(template.categories || []).length ? (
                            <div className="mt-4 flex flex-wrap gap-1.5">
                              {(template.categories || [])
                                .slice(0, 3)
                                .map((category) => (
                                  <PublicPill key={category} tone="subtle">
                                    {category}
                                  </PublicPill>
                                ))}
                            </div>
                          ) : null}

                          <Separator className="mt-auto" />

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11px] text-muted-foreground">
                            <span>@{profile.username}</span>
                            <span>{template.sections.length} sections</span>
                            <span>{countTemplateItems(template)} items</span>
                          </div>
                        </CardContent>
                      </Link>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        }
      />
    </PublicPageContainer>
  );
};

export default UserProfile;
