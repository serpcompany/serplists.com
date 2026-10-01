import { z } from "zod";

const metadataSchema = z.record(z.string()).nullish();

export const stripeListOf = (item) => z.object({ data: z.array(item) });

export const stripeProductSchema = z.object({ id: z.string().min(1), metadata: metadataSchema });

export const stripePriceSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
  type: z.string(),
  product: z.union([z.string(), z.object({ id: z.string() })]),
  unit_amount: z.number().nullable(),
  currency: z.string(),
  recurring: z.object({ interval: z.string(), interval_count: z.number().optional() }).nullable(),
});

export const stripePortalConfigurationSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
  is_default: z.boolean(),
  metadata: metadataSchema,
});

const stripeErrorReplySchema = z.object({ error: z.object({ message: z.string() }) });

export async function readStripeReply(response, schema) {
  const body = await response.json();
  if (!response.ok) {
    const reply = stripeErrorReplySchema.safeParse(body);
    throw new Error(`Stripe API error (${response.status}): ${reply.success ? reply.data.error.message : "Unknown error"}`);
  }
  return schema.parse(body);
}
