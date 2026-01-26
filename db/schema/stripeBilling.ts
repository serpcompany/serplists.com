import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const stripe_customers = sqliteTable("stripe_customers", {
  user_id: text("user_id").primaryKey(),
  stripe_customer_id: text("stripe_customer_id").notNull().unique(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at"),
});

export const stripe_subscriptions = sqliteTable("stripe_subscriptions", {
  stripe_subscription_id: text("stripe_subscription_id").primaryKey(),
  user_id: text("user_id").notNull(),
  stripe_customer_id: text("stripe_customer_id").notNull(),
  price_id: text("price_id").notNull(),
  status: text("status").notNull(),
  current_period_end: integer("current_period_end"),
  cancel_at_period_end: integer("cancel_at_period_end", { mode: "boolean" }).notNull().default(false),
  canceled_at: integer("canceled_at"),
  trial_end: integer("trial_end"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at"),
});

export const stripe_webhook_events = sqliteTable("stripe_webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  created: integer("created").notNull(),
  livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
  processed_at: text("processed_at").notNull(),
  error: text("error"),
});

