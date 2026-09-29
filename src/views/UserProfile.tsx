'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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
import { NoIndexMeta } from '@/components/seo/NoIndexMeta';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import {
  loadUserProfile,
  type LoadUserProfileResult,
  type UserProfileRecord,
} from '@/features/profile/loadUserProfile';
import {
  buildProfileSummary,
  calculateStats,
  countTemplateItems,
  getProfileDisplayName,
} from '@/features/profile/profileSummary';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { PROFILE_NOT_FOUND_PAGE_TEXT } from '@/lib/publicPageMeta';
import {
  buildCanonicalPublicTemplatePath,
  buildPublicTemplatesPath,
  getCanonicalProfilePath,
} from '@/lib/routes';
import { formatMonthYear } from '@/lib/utils/dbTimestamp';
import type { ChecklistTemplate } from '@/types/checklist';

import { Link } from '@/components/navigation/Link';

const NO_TEMPLATES: ChecklistTemplate[] = [];

const formatStatValue = (value: number) => value.toLocaleString('en-US');

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

const getProfileWebsiteHref = (website: string) =>
  website.startsWith('http://') || website.startsWith('https://')
    ? website
    : `https://${website}`;

const formatWebsiteLabel = (website: string) =>
  website.replace(/^https?:\/\//, '').replace(/\/$/, '');

type UserProfileContentProps = {
  onRetry: () => void;
  // Null while the profile loads.
  result: LoadUserProfileResult | null;
};

export const UserProfileContent = ({
  onRetry,
  result,
}: UserProfileContentProps) => {
  const profile = result?.kind === 'ok' ? result.profile : null;
  const templates = result?.kind === 'ok' ? result.templates : NO_TEMPLATES;
  const stats = useMemo(() => calculateStats(templates), [templates]);
  // Null for a missing or unreadable date, so the page never shows "Invalid Date".
  const joinedDate = formatMonthYear(profile?.created_at);

  if (!result) {
    return (
      <PublicPageContainer className="py-14">
        <div className="glass-panel p-8">
          <LoadingSpinner message="Loading profile..." />
        </div>
      </PublicPageContainer>
    );
  }

  // No noindex here: a crawler that hits a brief outage must not drop a live profile.
  if (result.kind === 'error') {
    return (
      <PublicPageContainer className="py-14">
        <EmptyState
          title="Unable to load profile"
          description={result.message}
          icon={Sparkles}
          className="min-h-0"
          action={{ label: 'Try again', onClick: onRetry }}
        />
      </PublicPageContainer>
    );
  }

  // The page is served with HTTP 200, so noindex is what keeps a gone profile out of search.
  // The server's metadata says so too (src/server/pageMeta/profilePage.ts); this tag covers a
  // profile that went away after the server rendered the page.
  if (!profile) {
    return (
      <PublicPageContainer className="py-14">
        <NoIndexMeta follow={false} />
        <EmptyState
          title="User not found"
          description={PROFILE_NOT_FOUND_PAGE_TEXT.description}
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

                {joinedDate ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    Joined {joinedDate}
                  </span>
                ) : null}
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
                      href={templatePath}
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

const UserProfile = () => {
  const { username } = useParams<{ username: string }>();
  const router = useAppRouter();
  const [result, setResult] = useState<LoadUserProfileResult | null>(null);
  // Bumped by Try again; a retry starts from the loading state.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    setResult(null);

    void loadUserProfile(username).then((nextResult) => {
      if (isCancelled) return;
      // /profile/JohnDoe found @johndoe: move to the one canonical URL, which loads again
      // from there.
      const canonicalPath =
        nextResult.kind === 'ok' ? getCanonicalProfilePath(username, nextResult.profile.username) : null;
      if (canonicalPath) {
        router.replace(canonicalPath);
        return;
      }
      setResult(nextResult);
    });

    return () => {
      isCancelled = true;
    };
  }, [reloadKey, router, username]);

  return (
    <UserProfileContent
      result={result}
      onRetry={() => setReloadKey((key) => key + 1)}
    />
  );
};

export default UserProfile;
