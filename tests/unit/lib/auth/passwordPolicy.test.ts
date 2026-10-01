import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { validatePasswordPolicy } from '@/lib/auth/passwordPolicy';

const ascii = (length: number) => 'a'.repeat(length);
const emoji = (count: number) => '\u{1F600}'.repeat(count); // 4 UTF-8 bytes each

describe('validatePasswordPolicy', () => {
  it.each([
    ['10 ASCII characters', ascii(10)],
    ['72 ASCII characters', ascii(72)],
    ['18 emoji (72 bytes)', emoji(18)],
    ['36 accented letters (72 bytes)', 'é'.repeat(36)],
  ])('accepts %s', (_label, password) => {
    expect(validatePasswordPolicy(password)).toEqual({ ok: true });
  });

  it.each([
    ['73 ASCII characters', ascii(73)],
    ['19 emoji (38 characters, 76 bytes)', emoji(19)],
    ['37 accented letters (74 bytes)', 'é'.repeat(37)],
    ['a lone surrogate at the end (3 bytes)', `${ascii(70)}\ud800`],
    ['72 characters plus trailing spaces, which the server hashes too', `${ascii(72)}  `],
    ['a 100-character password', ascii(100)],
  ])('rejects %s as too long', (_label, password) => {
    const result = validatePasswordPolicy(password);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toMatch(/at most 72/);
  });

  it('rejects a password shorter than 10 characters', () => {
    expect(validatePasswordPolicy('  short  ').ok).toBe(false);
  });

  it('never accepts a password that bcrypt would truncate', () => {
    const samples = [
      ascii(72), ascii(73), emoji(18), emoji(19), 'é'.repeat(36), 'é'.repeat(37),
      '中'.repeat(24), '中'.repeat(25), `${ascii(70)}\ud800`, `${ascii(69)}\ud800`,
      `${ascii(71)}é`, `${ascii(70)}é`,
    ];
    for (const password of samples) {
      if (validatePasswordPolicy(password).ok) expect(bcrypt.truncates(password)).toBe(false);
      else expect(bcrypt.truncates(password) || password.trim().length < 10).toBe(true);
    }
  });
});
