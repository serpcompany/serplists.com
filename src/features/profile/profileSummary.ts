import { countTemplateItems } from '@/lib/templates/templateItemCount';
import type { ChecklistTemplate } from '@/types/checklist';

import { foundProfileHandle, type FoundPublicProfile } from './loadPublicProfile';

export type UserStats = {
  averageItemsPerTemplate: number;
  categoriesUsed: string[];
  totalItems: number;
  totalTemplates: number;
};

const describePublicTemplates = (handle: string, stats: UserStats): string => {
  if (stats.categoriesUsed.length) {
    return `Public checklist templates from @${handle} covering ${stats.categoriesUsed
      .slice(0, 3)
      .join(', ')}.`;
  }

  return `Public checklist templates and repeatable workflow packs published by @${handle}.`;
};

const ownSummaryOf = (found: FoundPublicProfile): string | undefined =>
  (found.kind === 'user' ? found.profile.bio : found.organization.description)?.trim() || undefined;

const displayNameOf = (found: FoundPublicProfile): string | undefined =>
  (found.kind === 'user' ? found.profile.full_name : found.organization.name)?.trim() || undefined;

export const describePublicProfile = (
  found: FoundPublicProfile,
  stats: UserStats,
): { title: string; summary: string } => {
  const handle = foundProfileHandle(found);
  return {
    title: displayNameOf(found) ?? `@${handle}`,
    summary: ownSummaryOf(found) ?? describePublicTemplates(handle, stats),
  };
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
