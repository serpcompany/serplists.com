export const OFFICIAL_SERP_USER_ID = "serp-user";
export const OFFICIAL_SERP_EMAIL = "checklists@serp.co";
export const OFFICIAL_SERP_USERNAME = "serp";
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export function validateOfficialPassword(password) {
  if (typeof password !== "string") {
    return { ok: false, message: "Password is required." };
  }

  const trimmed = password.trim();
  if (trimmed.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (trimmed.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` };
  }

  return { ok: true, normalizedPassword: trimmed };
}

export function escapeSqlString(value) {
  return value.replaceAll("'", "''");
}

export function buildOfficialSerpResetSql({ passwordHash, nowMs }) {
  const escapedPasswordHash = escapeSqlString(passwordHash);

  return [
    `UPDATE users
SET password_hash = '${escapedPasswordHash}',
    email_verified = 1,
    auth_updated_at = ${nowMs}
WHERE id = '${OFFICIAL_SERP_USER_ID}';`,
    `UPDATE account
SET password = '${escapedPasswordHash}',
    updated_at = ${nowMs}
WHERE user_id = '${OFFICIAL_SERP_USER_ID}'
  AND provider_id = 'credential'
  AND account_id = '${OFFICIAL_SERP_USER_ID}';`,
    `DELETE FROM session
WHERE user_id = '${OFFICIAL_SERP_USER_ID}';`,
  ].join("\n\n");
}

export function buildOfficialSerpInspectSql() {
  return [
    `SELECT
  u.id,
  u.email,
  u.username,
  u.email_verified,
  u.auth_updated_at,
  a.provider_id,
  a.account_id,
  length(a.password) AS password_len
FROM users u
LEFT JOIN account a
  ON a.user_id = u.id
 AND a.provider_id = 'credential'
WHERE u.id = '${OFFICIAL_SERP_USER_ID}'
LIMIT 1;`,
    `SELECT COUNT(*) AS session_count
FROM session
WHERE user_id = '${OFFICIAL_SERP_USER_ID}';`,
  ].join("\n\n");
}

export function assertOfficialSerpInspectResults(results) {
  const [userResult, sessionResult] = results ?? [];
  const userRow = userResult?.results?.[0];
  const sessionRow = sessionResult?.results?.[0];

  if (!userRow) {
    throw new Error(`Official publisher ${OFFICIAL_SERP_USER_ID} was not found.`);
  }

  if (userRow.email !== OFFICIAL_SERP_EMAIL) {
    throw new Error(`Expected ${OFFICIAL_SERP_USER_ID} email to be ${OFFICIAL_SERP_EMAIL}, received ${userRow.email ?? "null"}.`);
  }

  if (userRow.username !== OFFICIAL_SERP_USERNAME) {
    throw new Error(`Expected ${OFFICIAL_SERP_USER_ID} username to be ${OFFICIAL_SERP_USERNAME}, received ${userRow.username ?? "null"}.`);
  }

  if (userRow.provider_id !== "credential" || userRow.account_id !== OFFICIAL_SERP_USER_ID) {
    throw new Error(`Official publisher ${OFFICIAL_SERP_USER_ID} is missing its credential account.`);
  }

  return {
    userRow,
    sessionCount: Number(sessionRow?.session_count ?? 0),
  };
}
