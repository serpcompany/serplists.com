'use client';

import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Building2, Users } from 'lucide-react';

import { CardGrid } from '@/components/layout/CardGrid';
import { PageSection } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { Link } from '@/components/navigation/Link';
import { ProfileDirectoryCard } from '@/components/profile/ProfileDirectoryCard';
import { QueryListState } from '@/components/shared/QueryListState';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProfileDirectory } from '@/features/profile/useProfileDirectory';
import { replaceCurrentUrl } from '@/lib/navigation/replaceCurrentUrl';
import { PROFILES_DIRECTORY_PAGE_TEXT } from '@/lib/publicPageMeta';
import { buildProfilesDirectoryPath } from '@/lib/routes';
import {
  PROFILE_DIRECTORY_COLLECTIONS,
  readProfileDirectoryQuery,
  type ProfileDirectoryCollection,
  type ProfileDirectoryQuery,
} from '@/lib/schemas/profileDirectory';

const COLLECTION_TEXT: Record<
  ProfileDirectoryCollection,
  { label: string; loading: string; loadError: string; refreshError: string; empty: string; emptyDescription: string; noMore: string }
> = {
  people: {
    label: 'People',
    loading: 'Loading people...',
    loadError: 'Unable to load people.',
    refreshError: 'Unable to refresh people.',
    empty: 'No people yet',
    emptyDescription: 'People appear here once they choose a username for their public profile.',
    noMore: 'No more people',
  },
  organizations: {
    label: 'Organizations',
    loading: 'Loading Organizations...',
    loadError: 'Unable to load Organizations.',
    refreshError: 'Unable to refresh Organizations.',
    empty: 'No Organizations yet',
    emptyDescription: 'Organizations appear here once they have a public profile.',
    noMore: 'No more Organizations',
  },
};

const COLLECTION_ICONS = { people: Users, organizations: Building2 } as const;

const isCollection = (value: unknown): value is ProfileDirectoryCollection =>
  PROFILE_DIRECTORY_COLLECTIONS.some((collection) => collection === value);

const pagerLinkClass = buttonVariants({ variant: 'outline', size: 'sm' });

function CollectionEmptyState({ query }: { query: ProfileDirectoryQuery }) {
  const text = COLLECTION_TEXT[query.collection];
  const Icon = COLLECTION_ICONS[query.collection];
  const isLaterPage = Boolean(query.after || query.before);

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>
          <h2>{isLaterPage ? text.noMore : text.empty}</h2>
        </EmptyTitle>
        {isLaterPage ? null : <EmptyDescription>{text.emptyDescription}</EmptyDescription>}
      </EmptyHeader>
      {isLaterPage ? (
        <EmptyContent>
          <Link className={pagerLinkClass} href={buildProfilesDirectoryPath({ collection: query.collection })}>
            Go to the first page
          </Link>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

function CollectionPage({ query }: { query: ProfileDirectoryQuery }) {
  const text = COLLECTION_TEXT[query.collection];
  const { listQuery, nextCursor, previousCursor, retry } = useProfileDirectory(query);
  const hasPager = Boolean(nextCursor || previousCursor);

  return (
    <QueryListState
      empty={<CollectionEmptyState query={query} />}
      loadErrorLabel={text.loadError}
      loadingLabel={text.loading}
      query={listQuery}
      refreshErrorLabel={text.refreshError}
      onRetry={retry}
    >
      <CardGrid>
        {(listQuery.data ?? []).map((profile) => (
          <ProfileDirectoryCard key={profile.handle} profile={profile} />
        ))}
      </CardGrid>
      {hasPager ? (
        <nav aria-label={`${text.label} pages`} className="mt-8 flex flex-wrap justify-between gap-3">
          {previousCursor ? (
            <Link
              className={pagerLinkClass}
              href={buildProfilesDirectoryPath({ collection: query.collection, before: previousCursor })}
            >
              <ArrowLeft data-icon="inline-start" />
              Previous
            </Link>
          ) : (
            <span />
          )}
          {nextCursor ? (
            <Link
              className={pagerLinkClass}
              href={buildProfilesDirectoryPath({ collection: query.collection, after: nextCursor })}
            >
              Next
              <ArrowRight data-icon="inline-end" />
            </Link>
          ) : null}
        </nav>
      ) : null}
    </QueryListState>
  );
}

const ProfilesDirectoryHero = () => (
  <PageSection spacing="hero">
    <PageHero
      align="center"
      description={PROFILES_DIRECTORY_PAGE_TEXT.description}
      title={PROFILES_DIRECTORY_PAGE_TEXT.title}
    />
  </PageSection>
);

export const ProfilesDirectoryFallback = () => (
  <>
    <ProfilesDirectoryHero />
    <PageSection spacing="compact">
      <p className="text-sm text-muted-foreground">Loading profiles...</p>
    </PageSection>
  </>
);

const ProfilesDirectory = () => {
  const query = readProfileDirectoryQuery(useSearchParams());

  const showCollection = (collection: unknown) => {
    if (isCollection(collection) && collection !== query.collection) {
      replaceCurrentUrl(`${buildProfilesDirectoryPath({ collection })}${window.location.hash}`);
    }
  };

  return (
    <>
      <ProfilesDirectoryHero />
      <PageSection spacing="compact">
        <Tabs value={query.collection} onValueChange={showCollection}>
          <TabsList aria-label="Profile collections" className="mb-6 w-full sm:w-fit">
            {PROFILE_DIRECTORY_COLLECTIONS.map((collection) => {
              const Icon = COLLECTION_ICONS[collection];
              return (
                <TabsTrigger key={collection} className="px-3" value={collection}>
                  <Icon />
                  {COLLECTION_TEXT[collection].label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {PROFILE_DIRECTORY_COLLECTIONS.map((collection) => (
            <TabsContent key={collection} value={collection}>
              {collection === query.collection ? <CollectionPage query={query} /> : null}
            </TabsContent>
          ))}
        </Tabs>
      </PageSection>
    </>
  );
};

export default ProfilesDirectory;
