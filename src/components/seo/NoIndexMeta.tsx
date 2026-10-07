export function NoIndexMeta({ follow }: { follow: boolean }) {
  return <meta name="robots" content={follow ? 'noindex, follow' : 'noindex, nofollow'} />;
}
