import { useMemo, type ReactNode } from 'react';
import {
  CalendarDays,
  Eye,
  FileText,
  Link as LinkIcon,
  ListChecks,
  MapPin,
  Play,
  Sparkles,
} from 'lucide-react';

import { DetailPageLayout } from '@/components/layout/DetailPageLayout';
import { Stat } from '@/components/layout/Stat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  foundProfileHandle,
  type FoundPublicProfile,
  type ProfileSurfaceRecord,
} from '@/features/profile/loadPublicProfile';
import { calculateStats, describePublicProfile, type UserStats } from '@/features/profile/profileSummary';
import { formatMonthYear } from '@/lib/utils/dbTimestamp';

import { ProfileTemplateCards } from './ProfileTemplateCards';

const formatStatValue = (value: number) => value.toLocaleString('en-US');

const getInitials = (title: string): string => {
  const initials = title
    .replace(/^@/, '')
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

const statCardsFor = (found: FoundPublicProfile, stats: UserStats) => {
  const audience: Pick<ProfileSurfaceRecord, 'totalRuns' | 'totalViews'> = found.kind === 'user' ? found.profile : {};
  return [
    {
      icon: FileText,
      label: 'Templates',
      value: formatStatValue(stats.totalTemplates),
    },
    audience.totalViews
      ? {
          icon: Eye,
          label: 'Total Views',
          value: formatStatValue(audience.totalViews),
        }
      : {
          icon: ListChecks,
          label: 'Checklist Items',
          value: formatStatValue(stats.totalItems),
        },
    audience.totalRuns
      ? {
          icon: Play,
          label: 'Total Runs',
          value: formatStatValue(audience.totalRuns),
        }
      : {
          icon: Sparkles,
          label: 'Categories',
          value: formatStatValue(stats.categoriesUsed.length),
        },
  ];
};

const userProfileMeta = (profile: ProfileSurfaceRecord): ReactNode => {
  const joinedDate = formatMonthYear(profile.created_at);
  if (!profile.location && !profile.website && !joinedDate) return undefined;

  return (
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
  );
};

export function PublicProfileDetails({ found }: { found: FoundPublicProfile }) {
  const stats = useMemo(() => calculateStats(found.templates), [found.templates]);
  const handle = foundProfileHandle(found);
  const { title, summary } = describePublicProfile(found, stats);
  const avatarUrl = found.kind === 'user' ? found.profile.avatar_url : found.organization.avatar_url;

  return (
    <DetailPageLayout
      aside={
        <div className="grid grid-cols-3 gap-4">
          {statCardsFor(found, stats).map((card) => {
            const Icon = card.icon;
            return <Stat key={card.label} icon={<Icon />} label={card.label} value={card.value} />;
          })}
        </div>
      }
      description={summary}
      media={
        <Avatar className="size-14">
          <AvatarImage alt="" src={avatarUrl || undefined} />
          <AvatarFallback className="text-lg">{getInitials(title)}</AvatarFallback>
        </Avatar>
      }
      meta={found.kind === 'user' ? userProfileMeta(found.profile) : undefined}
      subtitle={`@${handle}`}
      title={title}
    >
      <ProfileTemplateCards handle={handle} templates={found.templates} />
    </DetailPageLayout>
  );
}
