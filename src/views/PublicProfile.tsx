'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { PageEmptyState, PageLoadingState } from '@/components/layout/PageState';
import { PublicProfileDetails } from '@/components/profile/PublicProfileDetails';
import { NoIndexMeta } from '@/components/seo/NoIndexMeta';
import { Button } from '@/components/ui/button';
import {
  foundProfileHandle,
  loadPublicProfile,
  type LoadPublicProfileResult,
} from '@/features/profile/loadPublicProfile';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { PROFILE_NOT_FOUND_PAGE_TEXT } from '@/lib/publicPageMeta';
import { getCanonicalProfilePath } from '@/lib/routes';

type PublicProfileContentProps = {
  onRetry: () => void;
  result: LoadPublicProfileResult | null;
};

export const PublicProfileContent = ({
  onRetry,
  result,
}: PublicProfileContentProps) => {
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

  if (result.kind === 'not_found') {
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

  return <PublicProfileDetails found={result} />;
};

const PublicProfile = () => {
  const { username: handle } = useParams<{ username: string }>();
  const router = useAppRouter();
  const [retryCount, setRetryCount] = useState(0);
  const request = `${retryCount}:${handle}`;
  const [loaded, setLoaded] = useState<{ request: string; result: LoadPublicProfileResult } | null>(null);
  const result = loaded?.request === request ? loaded.result : null;

  useEffect(() => {
    let isCancelled = false;

    void loadPublicProfile(handle).then((nextResult) => {
      if (isCancelled) return;
      const canonicalPath =
        nextResult.kind === 'user' || nextResult.kind === 'organization'
          ? getCanonicalProfilePath(handle, foundProfileHandle(nextResult))
          : null;
      if (canonicalPath) {
        router.replace(canonicalPath);
        return;
      }
      setLoaded({ request, result: nextResult });
    });

    return () => {
      isCancelled = true;
    };
  }, [request, router, handle]);

  return (
    <PublicProfileContent
      result={result}
      onRetry={() => setRetryCount((count) => count + 1)}
    />
  );
};

export default PublicProfile;
