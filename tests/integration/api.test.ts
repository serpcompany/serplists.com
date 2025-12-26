import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { UnstableDevWorker } from 'wrangler';

describe('API Integration Tests', () => {
  let worker: UnstableDevWorker;
  let authToken: string;
  let testUserId: string;
  let testTemplateId: string;
  let testChecklistId: string;

  beforeAll(async () => {
    // Start the worker in test mode
    worker = await unstable_dev('functions/api/[[route]].ts', {
      experimental: { disableExperimentalWarning: true },
      local: true,
      persist: false,
    });
  });

  afterAll(async () => {
    await worker.stop();
  });

  beforeEach(() => {
    // Reset test data before each test
    testUserId = '';
    testTemplateId = '';
    testChecklistId = '';
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/register', () => {
      it('should register a new user successfully', async () => {
        const response = await worker.fetch('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: `test${Date.now()}@example.com`,
            password: 'securePassword123',
            name: 'Test User'
          })
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty('token');
        expect(data).toHaveProperty('user');
        expect(data.user).toHaveProperty('id');
        expect(data.user.email).toMatch(/test.*@example\.com/);
        expect(data.user.name).toBe('Test User');
      });

      it('should reject registration with existing email', async () => {
        const email = `duplicate${Date.now()}@example.com`;
        
        // First registration
        await worker.fetch('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: 'password123' })
        });

        // Duplicate registration
        const response = await worker.fetch('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: 'password123' })
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('User already exists');
      });

      it('should validate required fields', async () => {
        const response = await worker.fetch('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }) // Missing password
        });

        expect(response.status).toBe(400);
      });
    });

    describe('POST /api/auth/login', () => {
      it('should login with valid credentials', async () => {
        const response = await worker.fetch('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'admin@test.com',
            password: 'password123'
          })
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty('token');
        expect(data.user.email).toBe('admin@test.com');
        
        authToken = data.token; // Save for subsequent tests
        testUserId = data.user.id;
      });

      it('should reject login with invalid password', async () => {
        const response = await worker.fetch('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'admin@test.com',
            password: 'wrongpassword'
          })
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Invalid credentials');
      });

      it('should reject login with non-existent email', async () => {
        const response = await worker.fetch('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'nonexistent@example.com',
            password: 'password123'
          })
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Invalid credentials');
      });
    });

    describe('GET /api/auth/profile', () => {
      beforeEach(async () => {
        // Login to get token
        const loginResponse = await worker.fetch('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'admin@test.com',
            password: 'password123'
          })
        });
        const loginData = await loginResponse.json();
        authToken = loginData.token;
      });

      it('should get user profile with valid token', async () => {
        const response = await worker.fetch('http://localhost/api/auth/profile', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.email).toBe('admin@test.com');
        expect(data).toHaveProperty('id');
        expect(data).toHaveProperty('name');
      });

      it('should reject profile request without token', async () => {
        const response = await worker.fetch('http://localhost/api/auth/profile');
        expect(response.status).toBe(401);
      });

      it('should reject profile request with invalid token', async () => {
        const response = await worker.fetch('http://localhost/api/auth/profile', {
          headers: { 'Authorization': 'Bearer invalid.token.here' }
        });
        expect(response.status).toBe(401);
      });
    });

    describe('PUT /api/auth/profile', () => {
      beforeEach(async () => {
        const loginResponse = await worker.fetch('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'admin@test.com',
            password: 'password123'
          })
        });
        const loginData = await loginResponse.json();
        authToken = loginData.token;
      });

      it('should update user profile', async () => {
        const response = await worker.fetch('http://localhost/api/auth/profile', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'Updated Name',
            username: `user${Date.now()}`
          })
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.name).toBe('Updated Name');
        expect(data).toHaveProperty('username');
      });
    });
  });

  describe('Template Endpoints', () => {
    beforeAll(async () => {
      // Login once for all template tests
      const loginResponse = await worker.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@test.com',
          password: 'password123'
        })
      });
      const loginData = await loginResponse.json();
      authToken = loginData.token;
    });

    describe('GET /api/templates', () => {
      it('should get public templates without auth', async () => {
        const response = await worker.fetch('http://localhost/api/templates');
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      });

      it('should get public and private templates with auth', async () => {
        const response = await worker.fetch('http://localhost/api/templates', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      });
    });

    describe('POST /api/templates', () => {
      it('should create a new template', async () => {
        const response = await worker.fetch('http://localhost/api/templates', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: 'Test Template',
            description: 'A test template',
            sections: [
              {
                id: '1',
                title: 'Section 1',
                items: [
                  { id: '1', title: 'Task 1', description: 'Do something' }
                ]
              }
            ],
            categories: ['Test', 'Demo'],
            tags: ['test', 'automated'],
            is_public: true
          })
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty('id');
        testTemplateId = data.id;
      });

      it('should reject template creation without auth', async () => {
        const response = await worker.fetch('http://localhost/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Unauthorized Template',
            sections: []
          })
        });

        expect(response.status).toBe(401);
      });
    });

    describe('PUT /api/templates/:id', () => {
      it('should update an existing template', async () => {
        // First create a template
        const createResponse = await worker.fetch('http://localhost/api/templates', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: 'Template to Update',
            sections: [],
            is_public: false
          })
        });
        const { id } = await createResponse.json();

        // Update the template
        const response = await worker.fetch(`http://localhost/api/templates/${id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: 'Updated Template Title',
            description: 'Updated description',
            categories: ['Updated'],
            is_public: true
          })
        });

        expect(response.status).toBe(200);
      });
    });

    describe('DELETE /api/templates/:id', () => {
      it('should delete a template', async () => {
        // First create a template
        const createResponse = await worker.fetch('http://localhost/api/templates', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: 'Template to Delete',
            sections: []
          })
        });
        const { id } = await createResponse.json();

        // Delete the template
        const response = await worker.fetch(`http://localhost/api/templates/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
      });

      it('should return 404 for non-existent template', async () => {
        const response = await worker.fetch('http://localhost/api/templates/non-existent-id', {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });

        expect(response.status).toBe(404);
      });
    });
  });

  describe('Checklist Endpoints', () => {
    beforeAll(async () => {
      const loginResponse = await worker.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@test.com',
          password: 'password123'
        })
      });
      const loginData = await loginResponse.json();
      authToken = loginData.token;
    });

    describe('POST /api/checklists', () => {
      it('should create a new checklist run', async () => {
        const response = await worker.fetch('http://localhost/api/checklists', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            template_id: 'template-1',
            title: 'My Checklist Run',
            items: [
              { id: '1', title: 'Task 1', completed: false }
            ]
          })
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty('id');
        testChecklistId = data.id;
      });
    });

    describe('GET /api/checklists', () => {
      it('should get user checklists', async () => {
        const response = await worker.fetch('http://localhost/api/checklists', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      });

      it('should require auth for checklists', async () => {
        const response = await worker.fetch('http://localhost/api/checklists');
        expect(response.status).toBe(401);
      });
    });
  });

  describe('CORS Headers', () => {
    it('should handle OPTIONS requests', async () => {
      const response = await worker.fetch('http://localhost/api/auth/login', {
        method: 'OPTIONS'
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should include CORS headers in responses', async () => {
      const response = await worker.fetch('http://localhost/api/templates');
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await worker.fetch('http://localhost/api/unknown-route');
      expect(response.status).toBe(404);
    });

    it('should handle malformed JSON', async () => {
      const response = await worker.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      expect(response.status).toBe(500);
    });

    it('should handle missing required fields gracefully', async () => {
      const response = await worker.fetch('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Empty body
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Performance and Security', () => {
    it('should respond within acceptable time', async () => {
      const start = Date.now();
      await worker.fetch('http://localhost/api/templates');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should respond within 1 second
    });

    it('should not expose sensitive data in errors', async () => {
      const response = await worker.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'wrong'
        })
      });

      const data = await response.json();
      expect(JSON.stringify(data)).not.toContain('password');
      expect(JSON.stringify(data)).not.toContain('password_hash');
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(10).fill(null).map(() => 
        worker.fetch('http://localhost/api/templates')
      );

      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});