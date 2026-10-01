import { describe, expect, it } from 'vitest';
import { rateLimitKeyForIp } from '@functions/api/utils/rate-limit-key';
import { checkAuthRateLimit } from '@functions/api/utils/auth-rate-limit';
import { checkRouteRateLimit } from '@functions/api/utils/route-rate-limit';

describe('rateLimitKeyForIp', () => {
  it.each([
    ['203.0.113.5', '203.0.113.5'],
    [' 203.0.113.5 ', '203.0.113.5'],
    ['203.0.113.5:443', '203.0.113.5'],
    ['0.0.0.0', '0.0.0.0'],
    ['255.255.255.255', '255.255.255.255'],
  ])('keeps the IPv4 address %j as %j', (ip, expected) => {
    expect(rateLimitKeyForIp(ip)).toBe(expected);
  });

  it('gives every address in one IPv6 /64 the same key', () => {
    const sameNetwork = [
      '2001:db8:1:2::1',
      '2001:db8:1:2::9',
      '2001:db8:1:2:ffff:ffff:ffff:ffff',
      '2001:DB8:1:2:0:0:0:1',
      '2001:0db8:0001:0002:0000:0000:0000:0009',
      '2001:0DB8:0001:0002::5',
      '2001:0db8:0001:0002:abcd::',
      '[2001:db8:1:2::7]:443',
      '[2001:db8:1:2::7]',
      '2001:db8:1:2::7%eth0',
      '2001:db8:1:2:0:0:1.2.3.4',
    ];

    const keys = new Set(sameNetwork.map(rateLimitKeyForIp));

    expect(Array.from(keys)).toEqual(['2001:db8:1:2::/64']);
  });

  it.each([
    ['2001:db8:1:3::1'],
    ['2001:db8:2:2::1'],
    ['2001:db9:1:2::1'],
  ])('gives a different /64 (%s) its own key', (ip) => {
    expect(rateLimitKeyForIp(ip)).not.toBe(rateLimitKeyForIp('2001:db8:1:2::1'));
  });

  it.each([
    ['::', '0:0:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['2001:db8::', '2001:db8:0:0::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['1:2:3:4:5:6:7::', '1:2:3:4::/64'],
    ['::2:3:4:5:6:7:8', '0:2:3:4::/64'],
  ])('expands %j to the /64 %j', (ip, expected) => {
    expect(rateLimitKeyForIp(ip)).toBe(expected);
  });

  it.each([
    ['::ffff:203.0.113.5'],
    ['::FFFF:203.0.113.5'],
    ['::ffff:cb00:7105'],
    ['0:0:0:0:0:ffff:203.0.113.5'],
  ])('maps the IPv4-mapped address %j to its IPv4 key', (ip) => {
    expect(rateLimitKeyForIp(ip)).toBe('203.0.113.5');
  });

  it.each([
    ['not-an-ip'],
    ['256.1.1.1'],
    ['1.2.3'],
    ['2001:db8::1::2'],
    ['1:2:3:4:5:6:7:8:9'],
    ['1:2:3:4:5:6:7'],
    ['12345::1'],
    ['2001:db8:g::1'],
    [':::'],
    ['::ffff:300.1.1.1'],
  ])('falls back to the raw value for %j without throwing', (ip) => {
    expect(rateLimitKeyForIp(ip)).toBe(ip);
  });
});

describe('per-IP buckets for IPv6 clients, in a random /64 since the module-level limiter store keeps earlier counts', () => {
  const randomHextet = () => Math.floor(Math.random() * 0x10000).toString(16);
  const prefix = `2001:db8:${randomHextet()}:${randomHextet()}`;

  it('limits sign-in attempts from rotating addresses in one /64', () => {
    const results = Array.from({ length: 31 }, (_, index) =>
      checkAuthRateLimit({
        method: 'POST',
        path: 'auth/sign-in/email',
        ip: `${prefix}::${(index + 1).toString(16)}`,
        isLocal: false,
      }),
    );

    expect(results.slice(0, 30).every((result) => result?.allowed)).toBe(true);
    expect(results[30]?.allowed).toBe(false);
  });

  it('limits writes from rotating addresses in one /64', () => {
    const results = Array.from({ length: 121 }, (_, index) =>
      checkRouteRateLimit({
        method: 'POST',
        path: 'templates',
        ip: `${prefix}:${(index + 1).toString(16)}::1`,
        isLocal: false,
      }),
    );

    expect(results.slice(0, 120).every((entry) => entry?.result.allowed)).toBe(true);
    expect(results[120]?.result.allowed).toBe(false);
  });
});
