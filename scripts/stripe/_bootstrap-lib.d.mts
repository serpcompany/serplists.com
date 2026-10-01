export const PRO_MONTHLY_CENTS: number;

export type StripeRequest = (options: {
  method: "GET" | "POST";
  path: string;
  form?: Record<string, string>;
}) => Promise<unknown>;

export interface PriceSummary {
  id?: string;
  unit_amount?: number | null;
  currency?: string;
  recurring?: { interval?: string } | null;
}

export function bootstrapUsage(): string;
export function describePrice(price: PriceSummary | null | undefined): string;
export function ensurePrice(options: {
  request: StripeRequest;
  productId: string;
  lookupKey: string;
  currency: string;
  unitAmount: number;
  interval: string;
}): Promise<unknown>;
