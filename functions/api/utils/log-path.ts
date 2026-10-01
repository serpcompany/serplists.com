export const REDACTED_PATH_TOKEN = ':token';

function redactSecretSegments(segments: string[]): string[] | null {
  const [firstAsSent, secondAsSent, thirdAsSent] = segments;
  if (firstAsSent === undefined || secondAsSent === undefined || thirdAsSent === undefined) return null;
  const first = firstAsSent.toLowerCase();
  const second = secondAsSent.toLowerCase();
  const third = thirdAsSent.toLowerCase();

  const passwordResetToken = first === 'auth' && second === 'reset-password';
  const runShareToken = first === 'checklists' && second === 'shared';
  if (passwordResetToken || runShareToken) return [firstAsSent, secondAsSent, REDACTED_PATH_TOKEN];

  const organizationInviteToken = first === 'teams' && second === 'invites' && third !== 'pending';
  if (organizationInviteToken) return [firstAsSent, secondAsSent, REDACTED_PATH_TOKEN, ...segments.slice(3)];

  return null;
}

export function sanitizeLogPath(apiPath: string): string {
  if (typeof apiPath !== 'string') return '';
  const segments = apiPath.split('/').filter(Boolean);
  const redacted = redactSecretSegments(segments);
  return redacted ? redacted.join('/') : apiPath;
}
