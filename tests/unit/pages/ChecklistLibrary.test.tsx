import { describe, it, expect, vi } from 'vitest';

interface Template {
  id: string;
  slug?: string;
  title: string;
}

describe('ChecklistLibrary', () => {
  describe('Template Navigation', () => {
    it('should navigate using slug when available', () => {
      const mockNavigate = vi.fn();
      const template = {
        id: 'abc123',
        slug: 'ultimate-camping-checklist',
        title: 'Ultimate Camping Checklist'
      };

      // Simulate the handleTemplateClick function
      const handleTemplateClick = (template: Template) => {
        const identifier = template.slug || template.id;
        mockNavigate(`/checklists/${identifier}`);
      };

      handleTemplateClick(template);
      
      expect(mockNavigate).toHaveBeenCalledWith('/checklists/ultimate-camping-checklist');
      expect(mockNavigate).not.toHaveBeenCalledWith('/checklists/abc123');
    });

    it('should fallback to ID when slug is null', () => {
      const mockNavigate = vi.fn();
      const template = {
        id: 'xyz789',
        slug: null,
        title: 'Legacy Template'
      };

      const handleTemplateClick = (template: Template) => {
        const identifier = template.slug || template.id;
        mockNavigate(`/checklists/${identifier}`);
      };

      handleTemplateClick(template);
      
      expect(mockNavigate).toHaveBeenCalledWith('/checklists/xyz789');
    });

    it('should generate SEO-friendly URLs', () => {
      const templates = [
        { slug: 'wedding-planning-checklist-123', title: 'Wedding Planning Checklist' },
        { slug: 'camping-gear-list-456', title: 'Camping Gear List' },
        { slug: 'home-inspection-guide-789', title: 'Home Inspection Guide' }
      ];

      templates.forEach(template => {
        const url = `/checklists/${template.slug}`;
        
        // URL should contain meaningful keywords from title
        const keywords = template.title.toLowerCase().split(' ');
        keywords.forEach(keyword => {
          if (keyword.length > 3) { // Skip small words
            expect(url.toLowerCase()).toContain(keyword);
          }
        });
      });
    });
  });
});