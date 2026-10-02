export function rateLimitKeyForIp(ip: string): string {
  const raw = ip.trim();
  const host = stripPortAndZone(raw);

  const ipv4 = parseIpv4(host);
  if (ipv4) return ipv4.join('.');

  const groups = parseIpv6Groups(host);
  if (!groups) return raw;
  if (isIpv4Mapped(groups)) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}

function stripPortAndZone(value: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  const host = bracketed ? bracketed[1] : (/^(\d+\.\d+\.\d+\.\d+):\d+$/.exec(value)?.[1] ?? value);
  const zone = host.indexOf('%');
  return zone > 0 && host.includes(':') ? host.slice(0, zone) : host;
}

function parseIpv4(value: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

const HEX_GROUP = /^[0-9a-f]{1,4}$/i;

function withIpv4TailAsHexGroups(value: string): string | null {
  const lastColon = value.lastIndexOf(':');
  const tail = value.slice(lastColon + 1);
  if (!tail.includes('.')) return value;
  const octets = parseIpv4(tail);
  if (!octets) return null;
  const high = ((octets[0] << 8) | octets[1]).toString(16);
  const low = ((octets[2] << 8) | octets[3]).toString(16);
  return `${value.slice(0, lastColon + 1)}${high}:${low}`;
}

function parseIpv6Groups(value: string): number[] | null {
  if (!value.includes(':')) return null;

  const text = withIpv4TailAsHexGroups(value);
  if (text === null) return null;

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const split = (part: string) => (part === '' ? [] : part.split(':'));
  const head = split(halves[0]);
  const rest = halves.length === 2 ? split(halves[1]) : [];
  if (![...head, ...rest].every((group) => HEX_GROUP.test(group))) return null;

  const explicit = head.length + rest.length;
  if (halves.length === 1 ? explicit !== 8 : explicit > 7) return null;

  const zeros: string[] = new Array<string>(8 - explicit).fill('0');
  return [...head, ...zeros, ...rest].map((group) => parseInt(group, 16));
}

function isIpv4Mapped(groups: number[]): boolean {
  return groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
}
