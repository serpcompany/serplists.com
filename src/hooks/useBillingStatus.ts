import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import {
  getBillingStatusQueryKey,
  resolveBillingStatus,
  shouldRetryBillingStatus,
  type BillingStatusState,
} from "@/lib/billing";

export type BillingStatus = BillingStatusState & { refetch: () => void };

export const useBillingStatus = (options: {
  enabled: boolean;
  teamId?: string | null | undefined;
  userId?: string | null | undefined;
}): BillingStatus => {
  const query = useQuery({
    queryKey: getBillingStatusQueryKey(options.userId, options.teamId),
    queryFn: () => api.getBillingStatus(options.teamId ? { teamId: options.teamId } : undefined),
    enabled: options.enabled,
    retry: shouldRetryBillingStatus,
  });

  return {
    ...resolveBillingStatus(query),
    refetch: () => {
      void query.refetch();
    },
  };
};
