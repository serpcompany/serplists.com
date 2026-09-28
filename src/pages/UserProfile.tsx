import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarDays,
  Eye,
  FileText,
  Link as LinkIcon,
  ListChecks,
  MapPin,
  Play,
  Sparkles,
} from 'lucide-react';

import { PublicPageContainer } from '@/components/layout/PublicPageLayout';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import {
  REPO_TEMPLATE_OWNER_NAME,
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
  getRepoCatalogCreatedAt,
  repoTemplates,
} from '@/lib/repoTemplateCatalog';
import {
  buildCanonicalPublicTemplatePath,
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

type ProfileSurfaceRecord = UserProfileRecord & {
  bio?: string;
  location?: string;
  totalRuns?: number;
  totalViews?: number;
  website?: string;
};

type UserStats = {
  averageItemsPerTemplate: number;
  categoriesUsed: string[];
  totalItems: number;
  totalTemplates: number;
};

type ProfileFallbackState = {
  profile: ProfileSurfaceRecord;
  templates: ChecklistTemplate[];
};

const countTemplateItems = (template: ChecklistTemplate) =>
  template.sections.reduce((total, section) => total + section.items.length, 0);

const formatJoinedDate = (value: string): string =>
  new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

const formatStatValue = (value: number) => value.toLocaleString('en-US');

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
  profile: ProfileSurfaceRecord,
  stats: UserStats,
): string => {
  if (profile.bio?.trim()) {
    return profile.bio.trim();
  }

  if (stats.categoriesUsed.length) {
    return `Public checklist templates from @${profile.username} covering ${stats.categoriesUsed
      .slice(0, 3)
      .join(', ')}.`;
  }

  return `Public checklist templates and repeatable workflow packs published by @${profile.username}.`;
};

const normalizeUsername = (value: string | undefined) =>
  value?.trim().toLowerCase() ?? '';

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
    normalizeUsername(username) === REPO_TEMPLATE_OWNER_SLUG
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

const getFallbackProfileState = (
  username: string | undefined,
): ProfileFallbackState | null => {
  if (normalizeUsername(username) === REPO_TEMPLATE_OWNER_SLUG) {
    return {
      profile: {
        id: REPO_TEMPLATE_USER_ID,
        full_name: REPO_TEMPLATE_OWNER_NAME,
        username: REPO_TEMPLATE_OWNER_SLUG,
        avatar_url: null,
        created_at: getRepoCatalogCreatedAt(repoTemplates),
      },
      templates: repoTemplates,
    };
  }

  return null;
};

const getProfileWebsiteHref = (website: string) =>
  website.startsWith('http://') || website.startsWith('https://')
    ? website
    : `https://${website}`;

const formatWebsiteLabel = (website: string) =>
  website.replace(/^https?:\/\//, '').replace(/\/$/, '');

const UserProfile = () => {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<ProfileSurfaceRecord | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const fetchProfile = async () => {
      if (!username) {
        setError('No username provided');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const profileData = (await api.getProfileByUsername(
          username,
        )) as UserProfileRecord;

        if (isCancelled) return;

        const decoratedProfile = profileData;
        let resolvedTemplates: ChecklistTemplate[] = [];

        try {
          const publicTemplates = (await api.getPublicTemplatesForUser(
            profileData.id,
          )) as Array<Record<string, unknown>>;

          resolvedTemplates = mergeProfileTemplates(
            profileData.username,
            publicTemplates.map(mapApiTemplate),
          );
        } catch (caughtTemplateError) {
          console.error('Error fetching public templates:', caughtTemplateError);

          const fallbackState = getFallbackProfileState(profileData.username);
          if (fallbackState) {
            resolvedTemplates = fallbackState.templates;
          } else {
            setProfile(decoratedProfile);
            setTemplates([]);
            setError('Unable to load this public profile.');
            return;
          }
        }

        if (isCancelled) return;

        setProfile(decoratedProfile);
        setTemplates(resolvedTemplates);
      } catch (caughtError) {
        console.error('Error fetching public profile:', caughtError);

        const fallbackState = getFallbackProfileState(username);
        if (fallbackState) {
          if (isCancelled) return;

          setProfile(fallbackState.profile);
          setTemplates(fallbackState.templates);
          setError(null);
          return;
        }

        if (isCancelled) return;

        setProfile(null);
        setTemplates([]);
        setError('User not found');
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void fetchProfile();

    return () => {
      isCancelled = true;
    };
  }, [username]);

  const stats = useMemo(() => calculateStats(templates), [templates]);

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
        <EmptyState
          title={error === 'User not found' ? 'User not found' : 'Error'}
          description={error || 'Unable to load this public profile.'}
          icon={Sparkles}
          className="min-h-0"
        />
      </PublicPageContainer>
    );
  }

  const statCards = [
    {
      icon: FileText,
      label: 'Templates',
      value: formatStatValue(stats.totalTemplates),
    },
    profile.totalViews
      ? {
          icon: Eye,
          label: 'Total Views',
          value: formatStatValue(profile.totalViews),
        }
      : {
          icon: ListChecks,
          label: 'Checklist Items',
          value: formatStatValue(stats.totalItems),
        },
    profile.totalRuns
      ? {
          icon: Play,
          label: 'Total Runs',
          value: formatStatValue(profile.totalRuns),
        }
      : {
          icon: Sparkles,
          label: 'Categories',
          value: formatStatValue(stats.categoriesUsed.length),
        },
  ];

  return (
    <PublicPageContainer className="pb-16 pt-8">
      <div className="mx-auto max-w-4xl">
        <section className="mb-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <Avatar className="h-20 w-20 border border-border/70">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="bg-muted text-2xl font-medium text-foreground">
                {getProfileInitials(profile)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {getProfileDisplayName(profile)}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                @{profile.username}
              </p>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-foreground/90">
                {buildProfileSummary(profile, stats)}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                {profile.location ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {profile.location}
                  </span>
                ) : null}

                {profile.website ? (
                  <a
                    href={getProfileWebsiteHref(profile.website)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                  >
                    <LinkIcon className="h-4 w-4" />
                    {formatWebsiteLabel(profile.website)}
                  </a>
                ) : null}

                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  Joined {formatJoinedDate(profile.created_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {statCards.map((card) => {
              const Icon = card.icon;

              return (
                <Card
                  key={card.label}
                  className="rounded-xl border-border/70 bg-card shadow-none"
                >
                  <div className="p-5 text-center">
                    <div className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      <Icon className="h-4 w-4" />
                      <span>{card.label}</span>
                    </div>
                    <p className="mt-3 text-2xl font-bold text-foreground">
                      {card.value}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">
              Public Templates
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Browse every public template published from this profile.
            </p>
          </div>

          {templates.length === 0 ? (
            <EmptyState
              title="No public templates"
              description={`@${profile.username} has not published any public templates yet.`}
              icon={Sparkles}
              className="min-h-0 rounded-lg border border-dashed"
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {templates.map((template) => {
                const templatePath =
                  buildCanonicalPublicTemplatePath(template) ||
                  buildPublicTemplatesPath();

                return (
                  <Card
                    key={template.id}
                    className="h-full rounded-xl border-border/70 shadow-none transition-colors hover:border-foreground/20"
                  >
                    <Link
                      to={templatePath}
                      className="group flex h-full flex-col gap-4 p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-base font-semibold text-foreground transition-colors group-hover:text-foreground">
                            {template.title}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            @{profile.username}
                          </p>
                        </div>
                        <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                      </div>

                      <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {template.description ||
                          'Public template pack published in this creator profile.'}
                      </p>

                      {(template.categories || []).length ? (
                        <div className="flex flex-wrap gap-2">
                          {(template.categories || [])
                            .slice(0, 3)
                            .map((category) => (
                              <span
                                key={category}
                                className="inline-flex items-center rounded-full border border-border/70 px-2.5 py-1 text-xs font-medium text-muted-foreground"
                              >
                                {category}
                              </span>
                            ))}
                        </div>
                      ) : null}

                      <div className="mt-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>{template.sections.length} sections</span>
                        <span>{countTemplateItems(template)} items</span>
                      </div>
                    </Link>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PublicPageContainer>
  );
};

export default UserProfile;
