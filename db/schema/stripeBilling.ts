import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const stripe_customers = sqliteTable(
  "stripe_customers",
  {
    user_id: text("user_id"),
    stripe_customer_id: text("stripe_customer_id").notNull().unique(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at"),
  },
  (table) => [primaryKey({ columns: [table.user_id] })],
);

export const stripe_subscriptions = sqliteTable(
  "stripe_subscriptions",
  {
    stripe_subscription_id: text("stripe_subscription_id"),
    user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    stripe_customer_id: text("stripe_customer_id").notNull(),
    price_id: text("price_id").notNull(),
    status: text("status").notNull(),
    current_period_end: integer("current_period_end"),
    cancel_at_period_end: integer("cancel_at_period_end", { mode: "boolean" }).notNull().default(sql`0`),
    canceled_at: integer("canceled_at"),
    trial_end: integer("trial_end"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at"),
  },
  (table) => [
    primaryKey({ columns: [table.stripe_subscription_id] }),
    index("stripe_subscriptions_user_id_idx").on(table.user_id),
    index("stripe_subscriptions_customer_id_idx").on(table.stripe_customer_id),
  ],
);

export const stripe_webhook_events = sqliteTable(
  "stripe_webhook_events",
  {
    id: text("id"),
    type: text("type").notNull(),
    created: integer("created").notNull(),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(sql`0`),
    processed_at: text("processed_at").notNull(),
    error: text("error"),
  },
  (table) => [primaryKey({ columns: [table.id] })],
);
