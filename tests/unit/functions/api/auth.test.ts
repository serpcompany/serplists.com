import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn()
  };
  const insertChain = {
    values: vi.fn()
  };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain)
  };

  return { selectChain, insertChain, db };
});

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => dbMocks.db)
}));

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn((password) => Promise.resolve(`hashed_${password}`)),
    compare: vi.fn((password, hash) => Promise.resolve(hash === `hashed_${password}`))
  }
}));

import { handleLogin, handleRegister } from '@functions/api/handlers/auth';

describe('Auth Handlers', () => {
  let mockEnv: any;

  beforeEach(() => {
    dbMocks.db.select.mockReturnValue(dbMocks.selectChain);
    dbMocks.db.insert.mockReturnValue(dbMocks.insertChain);
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockReset();
    dbMocks.insertChain.values.mockResolvedValue(undefined);

    mockEnv = {
      DB: {},
      JWT_SECRET: 'test-secret'
    };
  });

  describe('handleLogin', () => {
    it('should successfully login with valid credentials', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        password_hash: 'hashed_password123',
        name: 'Test User'
      };

      dbMocks.selectChain.limit.mockResolvedValueOnce([mockUser]);

      const request = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
      });

      const response = await handleLogin(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('token');
      expect(data.user).toEqual({
        id: 'user123',
        email: 'test@example.com',
        name: 'Test User'
      });
    });

    it('should return 401 for invalid credentials', async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([]);

      const request = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'wrongpassword' })
      });

      const response = await handleLogin(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid credentials');
    });
  });

  describe('handleRegister', () => {
    it('should successfully register a new user', async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([]); // No existing user

      const request = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'password123',
          name: 'New User'
        })
      });

      const response = await handleRegister(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('token');
      expect(data.user).toHaveProperty('id');
      expect(data.user.email).toBe('newuser@example.com');
      expect(data.user.name).toBe('New User');
    });

    it('should return 400 if user already exists', async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([{ id: 'existing-user' }]);

      const request = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'password123'
        })
      });

      const response = await handleRegister(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('User already exists');
    });
  });
});
