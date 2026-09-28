import { api } from "@/lib/api";
import { normalizeSections } from "@/lib/utils/checklistSections";
import type { ChecklistTemplate } from "@/types/checklist";

export type TemplateListRequest = { teamId?: string; scope?: 'public' | 'personal' };

export const mapApiTemplate = (template: Record<string, unknown>): ChecklistTemplate => ({
  id: String(template.id),
  title: String(template.title || ''),
  description: typeof template.description === 'string' ? template.description : '',
  type: typeof template.type === 'string' ? template.type as "checklist" | "recipe" : 'checklist',
  seoTitle: typeof template.seoTitle === 'string' ? template.seoTitle : '',
  seoDescription: typeof template.seoDescription === 'string' ? template.seoDescription : '',
  rules: Array.isArray(template.rules) ? template.rules as ChecklistTemplate["rules"] : undefined,
  seoUrl: typeof template.slug === 'string' ? template.slug : '',
  sections: normalizeSections((() => {
    if (template.sections) return template.sections;
    if (template.items) {
      const parsedItems = typeof template.items === 'string' ? JSON.parse(template.items) : template.items;
      if (Array.isArray(parsedItems) && parsedItems.length > 0 && parsedItems[0]?.items) {
        return parsedItems;
      }
      return [{
        id: '1',
        title: 'Checklist',
        items: parsedItems
      }];
    }
    return [];
  })()),
  categories: Array.isArray(template.categories)
    ? template.categories as string[]
    : (template.category ? [String(template.category)] : []),
  tags: typeof template.tags === 'string' ? JSON.parse(template.tags) : (Array.isArray(template.tags) ? template.tags as string[] : []),
  userId: typeof template.user_id === 'string' ? template.user_id : '',
  createdAt: typeof template.created_at === 'string' ? template.created_at : '',
  updatedAt: typeof template.updated_at === 'string' ? template.updated_at : '',
  isPublic: Boolean(template.is_public),
  slug: typeof template.slug === 'string' ? template.slug : '',
  version: typeof template.version === 'number' ? template.version : 1,
  teamId:
    typeof template.team_id === 'string'
      ? template.team_id
      : typeof template.teamId === 'string'
        ? template.teamId
        : undefined,
  ownerProfile:
    typeof template.owner_username === "string" || typeof template.owner_full_name === "string"
      ? {
          username: typeof template.owner_username === "string" ? template.owner_username : undefined,
          full_name: typeof template.owner_full_name === "string" ? template.owner_full_name : undefined,
        }
      : undefined,
});

// A failed catalog request must stay an error: cached as an empty success, it would turn
// every category that exists only in the database into a 404 until the cache expires.
// The workspace lists keep resolving to an empty list, as their pages expect.
export const fetchTemplateList = (request: TemplateListRequest) => async (): Promise<ChecklistTemplate[]> => {
  try {
    const templatesData = await api.getTemplates(request);
    return templatesData.map((template: Record<string, unknown>) => mapApiTemplate(template));
  } catch (error) {
    console.error('Error fetching templates:', error);
    if (request.scope === 'public') throw error;
    return [];
  }
};
