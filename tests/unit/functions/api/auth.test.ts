import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleLogin, handleRegister } from '@functions/api/handlers/auth';
import bcrypt from 'bcryptjs';

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn((password) => Promise.resolve(`hashed_${password}`)),
    compare: vi.fn((password, hash) => Promise.resolve(hash === `hashed_${password}`))
  }
}));

describe('Auth Handlers', () => {
  let mockEnv: any;
  let mockDB: any;

  beforeEach(() => {
    mockDB = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      run: vi.fn()
    };

    mockEnv = {
      DB: mockDB,
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

      mockDB.first.mockResolvedValue(mockUser);

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
      mockDB.first.mockResolvedValue(null);

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
      mockDB.first.mockResolvedValue(null); // No existing user

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
      mockDB.first.mockResolvedValue({ id: 'existing-user' });

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