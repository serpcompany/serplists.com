import type { QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getBillingStatusQueryKey, type BillingStatus } from "@/lib/billing";

export const fetchPersonalBillingStatus = (queryClient: QueryClient, userId: string): Promise<BillingStatus> =>
  queryClient.fetchQuery({
    queryKey: getBillingStatusQueryKey(userId, null),
    queryFn: () => api.getBillingStatus(),
    staleTime: 0,
  });

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForPersonalPro(
  fetchStatus: () => Promise<BillingStatus | undefined>,
  options: {
    isCancelled: () => boolean;
    attempts?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<"pro" | "pending" | "cancelled"> {
  const { isCancelled, attempts = 10, intervalMs = 1_500, sleep = sleepFor } = options;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let status: BillingStatus | undefined;
    try {
      status = await fetchStatus();
    } catch {
      status = undefined;
    }
    if (isCancelled()) return "cancelled";
    if (status?.plan === "pro") return "pro";
    if (attempt < attempts) await sleep(intervalMs);
    if (isCancelled()) return "cancelled";
  }

  return "pending";
}
