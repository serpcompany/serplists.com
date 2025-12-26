import { describe, it, expect, vi } from 'vitest';
import { ChecklistTemplate } from '@/contexts/TemplatesContext';

describe('PublicTemplate', () => {
  describe('Template Lookup Logic', () => {
    const mockTemplates: ChecklistTemplate[] = [
      { 
        id: '1', 
        slug: 'camping-checklist', 
        title: 'Camping Checklist',
        isPublic: true,
        sections: [],
        userId: 'user1',
        createdAt: '2024-01-01',
        description: '',
        categories: [],
        tags: [],
        updatedAt: '',
        version: 1
      },
      { 
        id: '2', 
        slug: 'wedding-checklist', 
        title: 'Wedding Checklist',
        isPublic: true,
        sections: [],
        userId: 'user2',
        createdAt: '2024-01-02',
        description: '',
        categories: [],
        tags: [],
        updatedAt: '',
        version: 1
      },
      { 
        id: '3', 
        slug: undefined, 
        title: 'Legacy Template',
        isPublic: true,
        sections: [],
        userId: 'user3',
        createdAt: '2024-01-03',
        description: '',
        categories: [],
        tags: [],
        updatedAt: '',
        version: 1
      },
      { 
        id: '4', 
        slug: 'private-checklist', 
        title: 'Private Template',
        isPublic: false,
        sections: [],
        userId: 'user4',
        createdAt: '2024-01-04',
        description: '',
        categories: [],
        tags: [],
        updatedAt: '',
        version: 1
      }
    ];

    it('should find template by slug', () => {
      const findBySlug = (slug: string) => 
        mockTemplates.find(t => t.slug === slug && t.isPublic);
      
      const found = findBySlug('camping-checklist');
      expect(found).toBeDefined();
      expect(found?.id).toBe('1');
      expect(found?.title).toBe('Camping Checklist');
    });

    it('should find template by ID when slug not found', () => {
      const findBySlugOrId = (identifier: string) => {
        // Try slug first
        let found = mockTemplates.find(t => t.slug === identifier && t.isPublic);
        // Fallback to ID
        if (!found) {
          found = mockTemplates.find(t => t.id === identifier && t.isPublic);
        }
        return found;
      };

      // Find by slug
      expect(findBySlugOrId('wedding-checklist')?.id).toBe('2');
      
      // Find by ID (for legacy templates without slug)
      expect(findBySlugOrId('3')?.title).toBe('Legacy Template');
      
      // Should not find non-existent
      expect(findBySlugOrId('nonexistent')).toBeUndefined();
    });

    it('should not return private templates', () => {
      const findPublicBySlug = (slug: string) => 
        mockTemplates.find(t => t.slug === slug && t.isPublic);
      
      expect(findPublicBySlug('private-checklist')).toBeUndefined();
      expect(findPublicBySlug('camping-checklist')).toBeDefined();
    });

    it('should handle UUID format detection', () => {
      const isUUID = (str: string) => {
        return str.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      };

      expect(isUUID('d2f53738-b5b7-4d5e-a26f-ddbc3b23edf6')).toBeTruthy();
      expect(isUUID('camping-checklist')).toBeFalsy();
      expect(isUUID('wedding-checklist-123')).toBeFalsy();
    });
  });
});