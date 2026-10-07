import { useSyncExternalStore } from 'react';

import { readGuestRunStatus, subscribeToGuestRuns, type GuestRunStatus } from './guestRunStore';

export const useGuestRunStatus = (templateId: string | undefined): GuestRunStatus | null =>
  useSyncExternalStore(
    subscribeToGuestRuns,
    () => (templateId ? readGuestRunStatus(templateId) : null),
    () => null,
  );
