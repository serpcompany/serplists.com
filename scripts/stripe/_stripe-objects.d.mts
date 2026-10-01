import type { z } from "zod";

type Metadata = z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodString>>>;

export function stripeListOf<Item extends z.ZodTypeAny>(item: Item): z.ZodObject<{ data: z.ZodArray<Item> }>;

export const stripeProductSchema: z.ZodObject<{ id: z.ZodString; metadata: Metadata }>;

export const stripePriceSchema: z.ZodObject<{
  id: z.ZodString;
  active: z.ZodBoolean;
  type: z.ZodString;
  product: z.ZodUnion<[z.ZodString, z.ZodObject<{ id: z.ZodString }>]>;
  unit_amount: z.ZodNullable<z.ZodNumber>;
  currency: z.ZodString;
  recurring: z.ZodNullable<z.ZodObject<{ interval: z.ZodString; interval_count: z.ZodOptional<z.ZodNumber> }>>;
}>;

export const stripePortalConfigurationSchema: z.ZodObject<{
  id: z.ZodString;
  active: z.ZodBoolean;
  is_default: z.ZodBoolean;
  metadata: Metadata;
}>;

export function readStripeReply<Schema extends z.ZodTypeAny>(
  response: Response,
  schema: Schema,
): Promise<z.output<Schema>>;
