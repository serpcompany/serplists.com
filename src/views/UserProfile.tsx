'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Eye,
  FileText,
  Link as LinkIcon,
  List,
  ListChecks,
  MapPin,
  Play,
  Sparkles,
} from 'lucide-react';

import { CardGrid } from '@/components/layout/CardGrid';
import { DetailPageLayout } from '@/components/layout/DetailPageLayout';
import { MediaCard } from '@/components/layout/MediaCard';
import { PageEmptyState, PageLoadingState } from '@/components/layout/PageState';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Stat } from '@/components/layout/Stat';
import { NoIndexMeta } from '@/components/seo/NoIndexMeta';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  loadUserProfile,
  type LoadUserProfileResult,
  type UserProfileRecord,
} from '@/features/profile/loadUserProfile';
import {
  buildProfileSummary,
  calculateStats,
  getProfileDisplayName,
} from '@/features/profile/profileSummary';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { PROFILE_NOT_FOUND_PAGE_TEXT } from '@/lib/publicPageMeta';
import {
  buildCanonicalPublicTemplatePath,
  buildPublicTemplatesPath,
  getCanonicalProfilePath,
} from '@/lib/routes';
import { countTemplateItems } from '@/lib/templates/templateItemCount';
import { formatMonthYear } from '@/lib/utils/dbTimestamp';
import { formatCount } from '@/lib/utils/pluralize';
import type { ChecklistTemplate } from '@/types/checklist';

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
  result: LoadUserProfileResult | null;
};

export const UserProfileContent = ({
  onRetry,
  result,
}: UserProfileContentProps) => {
  const profile = result?.kind === 'ok' ? result.profile : null;
  const templates = result?.kind === 'ok' ? result.templates : NO_TEMPLATES;
  const stats = useMemo(() => calculateStats(templates), [templates]);
  const joinedDate = formatMonthYear(profile?.created_at);

  if (!result) {
    return <PageLoadingState label="Loading profile..." />;
  }

  if (result.kind === 'error') {
    return (
      <PageEmptyState
        actions={<Button onClick={onRetry}>Try again</Button>}
        description={result.message}
        icon={<Sparkles />}
        title="Unable to load profile"
      />
    );
  }

  if (!profile) {
    return (
      <>
        <NoIndexMeta follow={false} />
        <PageEmptyState
          description={PROFILE_NOT_FOUND_PAGE_TEXT.description}
          icon={<Sparkles />}
          title="User not found"
        />
      </>
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
    <DetailPageLayout
      aside={
        <div className="grid grid-cols-3 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return <Stat key={card.label} icon={<Icon />} label={card.label} value={card.value} />;
          })}
        </div>
      }
      description={buildProfileSummary(profile, stats)}
      media={
        <Avatar className="size-14">
          <AvatarImage alt="" src={profile.avatar_url || undefined} />
          <AvatarFallback className="text-lg">{getProfileInitials(profile)}</AvatarFallback>
        </Avatar>
      }
      meta={
        profile.location || profile.website || joinedDate ? (
          <>
            {profile.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-4" />
                {profile.location}
              </span>
            ) : null}
            {profile.website ? (
              <a
                href={getProfileWebsiteHref(profile.website)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                <LinkIcon aria-hidden="true" className="size-4" />
                {formatWebsiteLabel(profile.website)}
              </a>
            ) : null}
            {joinedDate ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays aria-hidden="true" className="size-4" />
                Joined {joinedDate}
              </span>
            ) : null}
          </>
        ) : undefined
      }
      subtitle={`@${profile.username}`}
      title={getProfileDisplayName(profile)}
    >
      <section aria-labelledby="public-templates">
        <SectionHeader
          description="Browse every public template published from this profile."
          id="public-templates"
          title="Public Templates"
        />

        {templates.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Sparkles />
              </EmptyMedia>
              <EmptyTitle>
                <h3>No public templates</h3>
              </EmptyTitle>
              <EmptyDescription>
                @{profile.username} has not published any public templates yet.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <CardGrid>
            {templates.map((template) => {
              const TypeIcon = template.type === 'recipe' ? List : FileText;
              const categories = (template.categories || []).slice(0, 3);
              return (
                <MediaCard
                  key={template.id}
                  clampDescription
                  description={
                    template.description || 'Public template pack published in this creator profile.'
                  }
                  eyebrow={
                    categories.length ? (
                      <span className="flex flex-wrap gap-1">
                        {categories.map((category) => (
                          <Badge key={category} variant="secondary">
                            {category}
                          </Badge>
                        ))}
                      </span>
                    ) : undefined
                  }
                  href={buildCanonicalPublicTemplatePath(template) || buildPublicTemplatesPath()}
                  icon={<TypeIcon />}
                  title={template.title}
                >
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>@{profile.username}</span>
                    <span>{formatCount(template.sections.length, 'section')}</span>
                    <span>{formatCount(countTemplateItems(template), 'item')}</span>
                  </p>
                </MediaCard>
              );
            })}
          </CardGrid>
        )}
      </section>
    </DetailPageLayout>
  );
};

const UserProfile = () => {
  const { username } = useParams<{ username: string }>();
  const router = useAppRouter();
  const [retryCount, setRetryCount] = useState(0);
  const request = `${retryCount}:${username}`;
  const [loaded, setLoaded] = useState<{ request: string; result: LoadUserProfileResult } | null>(null);
  const result = loaded?.request === request ? loaded.result : null;

  useEffect(() => {
    let isCancelled = false;

    void loadUserProfile(username).then((nextResult) => {
      if (isCancelled) return;
      const canonicalPath =
        nextResult.kind === 'ok' ? getCanonicalProfilePath(username, nextResult.profile.username) : null;
      if (canonicalPath) {
        router.replace(canonicalPath);
        return;
      }
      setLoaded({ request, result: nextResult });
    });

    return () => {
      isCancelled = true;
    };
  }, [request, router, username]);

  return (
    <UserProfileContent
      result={result}
      onRetry={() => setRetryCount((count) => count + 1)}
    />
  );
};

export default UserProfile;
