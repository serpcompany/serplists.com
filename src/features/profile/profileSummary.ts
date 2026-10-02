import { countTemplateItems } from '@/lib/templates/templateItemCount';
import type { ChecklistTemplate } from '@/types/checklist';

import type { ProfileSurfaceRecord, UserProfileRecord } from './loadUserProfile';

export type UserStats = {
  averageItemsPerTemplate: number;
  categoriesUsed: string[];
  totalItems: number;
  totalTemplates: number;
};

export const getProfileDisplayName = (profile: UserProfileRecord): string =>
  profile.full_name?.trim() || `@${profile.username}`;

export const buildProfileSummary = (
  profile: ProfileSurfaceRecord,
  stats: UserStats,
): string => {
  if (profile.bio?.trim()) {
    return profile.bio.trim();
  }

  if (stats.categoriesUsed.length) {
    return `Public checklist templates from @${profile.username} covering ${stats.categoriesUsed
      .slice(0, 3)
      .join(', ')}.`;
  }

  return `Public checklist templates and repeatable workflow packs published by @${profile.username}.`;
};

export const calculateStats = (templates: ChecklistTemplate[]): UserStats => {
  const totalItems = templates.reduce(
    (total, template) => total + countTemplateItems(template),
    0,
  );
  const categoriesUsed = Array.from(
    new Set(templates.flatMap((template) => template.categories || [])),
  );

  return {
    totalTemplates: templates.length,
    totalItems,
    categoriesUsed,
    averageItemsPerTemplate:
      templates.length > 0 ? Math.round(totalItems / templates.length) : 0,
  };
};
