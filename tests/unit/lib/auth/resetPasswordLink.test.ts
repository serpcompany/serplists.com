import { describe, expect, it } from 'vitest';

import { readResetPasswordLink } from '@/lib/auth/resetPasswordLink';

describe('readResetPasswordLink', () => {
  it('reads the token and asks for it to be removed from the URL', () => {
    expect(readResetPasswordLink('?token=AbC123')).toEqual({
      token: 'AbC123',
      error: null,
      searchWithoutToken: '',
    });
  });

  it('keeps other parameters when removing the token', () => {
    expect(readResetPasswordLink('?utm_source=mail&token=AbC123&Token=dup')).toEqual({
      token: 'AbC123',
      error: null,
      searchWithoutToken: '?utm_source=mail',
    });
  });

  it('leaves an error link alone', () => {
    expect(readResetPasswordLink('?error=INVALID_TOKEN')).toEqual({
      token: null,
      error: 'INVALID_TOKEN',
      searchWithoutToken: null,
    });
  });

  it('treats an empty token as missing but still removes it', () => {
    expect(readResetPasswordLink('?token=')).toEqual({
      token: null,
      error: null,
      searchWithoutToken: '',
    });
    expect(readResetPasswordLink('')).toEqual({ token: null, error: null, searchWithoutToken: null });
  });
});
