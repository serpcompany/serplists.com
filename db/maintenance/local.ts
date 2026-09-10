import { and, eq, inArray } from "drizzle-orm";
import { account, users } from "../schema/index";
import { DEV_PASSWORD_HASH, TEST_USER_EMAILS, cleanupLocalTestData } from "../seeds/local";
import type { LocalDb } from "../../scripts/data/local-d1";

const PASSWORD_RESET_EMAILS = [...TEST_USER_EMAILS, "checklists@serp.co"];

export { cleanupLocalTestData };

export async function resetLocalTestUserPasswords(db: LocalDb): Promise<void> {
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const timestamp = now.toISOString().slice(0, 19).replace("T", " ");

  await db
    .update(users)
    .set({ password_hash: DEV_PASSWORD_HASH, auth_updated_at: now, updated_at: timestamp })
    .where(inArray(users.email, PASSWORD_RESET_EMAILS));

  const intendedUserIds = db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, PASSWORD_RESET_EMAILS));

  await db
    .update(account)
    .set({ password: DEV_PASSWORD_HASH, updatedAt: now })
    .where(and(eq(account.providerId, "credential"), inArray(account.userId, intendedUserIds)));
}
