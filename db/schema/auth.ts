import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

const epochMilliseconds = sql`(CAST(strftime('%s','now') AS INTEGER) * 1000)`;

const authTimestamps = () => ({
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(epochMilliseconds),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(epochMilliseconds),
});

export const account = sqliteTable(
  "account",
  {
    id: text("id"),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    ...authTimestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("account_user_id_idx").on(table.userId),
  ],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ...authTimestamps(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("session_user_id_idx").on(table.userId),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id"),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ...authTimestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("verification_identifier_idx").on(table.identifier),
  ],
);
