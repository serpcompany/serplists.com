const KEY_ROLES = [
  ["PRODUCTION_BACKUP_ENCRYPTION_KEY", "backup encryption"],
  ["PRODUCTION_INVARIANT_HMAC_KEY", "invariant HMAC"],
  ["PRODUCTION_CANARY_EVIDENCE_HMAC_KEY", "canary evidence HMAC"],
];

// Keep values inside this check: errors and callers receive roles only.
export function assertProductionKeySeparation(env) {
  for (const [name, role] of KEY_ROLES) {
    if (typeof env[name] !== "string" || env[name].length < 32) {
      throw new Error(`Protected production ${role} key is missing or shorter than 32 characters.`);
    }
  }
  const collisions = [];
  for (let left = 0; left < KEY_ROLES.length; left += 1) {
    for (let right = left + 1; right < KEY_ROLES.length; right += 1) {
      if (env[KEY_ROLES[left][0]] === env[KEY_ROLES[right][0]]) {
        collisions.push(`${KEY_ROLES[left][1]} and ${KEY_ROLES[right][1]}`);
      }
    }
  }
  if (collisions.length) {
    throw new Error(`Production keys must be separate; reused key roles: ${collisions.join("; ")}.`);
  }
}
