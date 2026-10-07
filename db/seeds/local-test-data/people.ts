import { account, entitlementOverrides, users } from "../../schema/index";
import type { LocalDb } from "../../../scripts/data/local-d1";
import { DEV_PASSWORD_HASH, TEST_USER_IDS } from "./ids";
import type { SeedClock } from "./values";

export async function seedTestPeople(db: LocalDb, { now, at }: SeedClock): Promise<void> {
  await db.insert(users).values([
    {
      id: "user-1",
      email: "admin@test.com",
      password_hash: DEV_PASSWORD_HASH,
      name: "Admin (Pro)",
      username: "admin",
      displayUsername: "admin",
      avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=admin",
      email_verified: true,
      auth_created_at: now,
      auth_updated_at: now,
      created_at: at(0),
    },
    {
      id: "user-2",
      email: "john@test.com",
      password_hash: DEV_PASSWORD_HASH,
      name: "John (Free)",
      username: "john",
      displayUsername: "john",
      avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=john",
      email_verified: true,
      auth_created_at: now,
      auth_updated_at: now,
      created_at: at(0),
    },
    {
      id: "user-3",
      email: "jane@test.com",
      password_hash: DEV_PASSWORD_HASH,
      name: "Jane (Pro)",
      username: "jane",
      displayUsername: "jane",
      avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=jane",
      email_verified: true,
      auth_created_at: now,
      auth_updated_at: now,
      created_at: at(0),
    },
    {
      id: "user-4",
      email: "bob@test.com",
      password_hash: DEV_PASSWORD_HASH,
      name: "Bob (Free)",
      username: "bob",
      displayUsername: "bob",
      avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob",
      email_verified: true,
      auth_created_at: now,
      auth_updated_at: now,
      created_at: at(0),
    },
  ]);

  await db.insert(account).values(
    TEST_USER_IDS.map((userId, index) => ({
      id: (index + 1).toString(16).padStart(32, "0"),
      accountId: userId,
      providerId: "credential",
      userId,
      password: DEV_PASSWORD_HASH,
      createdAt: now,
      updatedAt: now,
    })),
  );

  await db.insert(entitlementOverrides).values([
    {
      user_id: "user-1",
      plan: "pro",
      note: "Seeded dev persona: Admin (Pro)",
      created_at: at(0),
      updated_at: at(0),
    },
    {
      user_id: "user-3",
      plan: "pro",
      note: "Seeded dev persona: Jane (Pro)",
      created_at: at(0),
      updated_at: at(0),
    },
  ]);
}
