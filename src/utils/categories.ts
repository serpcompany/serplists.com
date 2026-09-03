/**
 * Predefined categories for templates
 */

export const PREDEFINED_CATEGORIES = [
  "wedding",
  "moving", 
  "camping",
  "packing",
  "morning routine",
  "home inspection",
  "software development",
  "project management",
  "productivity"
] as const;

export const getPredefinedCategories = () => PREDEFINED_CATEGORIES;

export const isPredefinedCategory = (category: string): boolean => {
  return PREDEFINED_CATEGORIES.includes(category as unknown);
};
