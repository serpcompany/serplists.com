import { z } from "zod";

// Schema for pages
export const pageSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(), // Markdown content
  description: z.string().optional(),
  userId: z.string(),
  isPublic: z.boolean(),
  slug: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

// Type export
export type Page = z.infer<typeof pageSchema>;

// Validation function
export const validatePage = (data: unknown): Page => {
  return pageSchema.parse(data);
};