import { useEffect, useState } from 'react';

import {
  loadPublicProfile,
  type PublicProfileLoadResult,
} from './loadPublicProfile';

export type PublicProfileState = {
  /** null while the lookup runs. */
  result: PublicProfileLoadResult | null;
  retry: () => void;
};

export const usePublicProfile = (username: string | undefined): PublicProfileState => {
  const [result, setResult] = useState<PublicProfileLoadResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setResult(null);

    void loadPublicProfile(username).then((nextResult) => {
      if (!cancelled) setResult(nextResult);
    });

    return () => {
      cancelled = true;
    };
  }, [attempt, username]);

  return { result, retry: () => setAttempt((value) => value + 1) };
};
