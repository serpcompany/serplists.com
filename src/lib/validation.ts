import { z } from "zod";

// Input validation schemas
export const templateTitleSchema = z.string()
  .min(1, "Title is required")
  .max(200, "Title must be less than 200 characters")
  .trim();

export const templateDescriptionSchema = z.string()
  .max(1000, "Description must be less than 1000 characters")
  .optional();

export const templateSlugSchema = z.string()
  .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens")
  .min(3, "Slug must be at least 3 characters")
  .max(50, "Slug must be less than 50 characters")
  .optional();

export const sectionTitleSchema = z.string()
  .min(1, "Section title is required")
  .max(100, "Section title must be less than 100 characters")
  .trim();

export const itemTitleSchema = z.string()
  .min(1, "Item title is required")
  .max(200, "Item title must be less than 200 characters")
  .trim();

export const markdownContentSchema = z.string()
  .max(10000, "Content must be less than 10,000 characters")
  .optional();

export const urlSchema = z.string()
  .url("Must be a valid URL")
  .max(2000, "URL must be less than 2000 characters")
  .optional();

export const emailSchema = z.string()
  .email("Must be a valid email address")
  .max(254, "Email must be less than 254 characters");

export const usernameSchema = z.string()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be less than 30 characters")
  .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens");

export const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password must be less than 100 characters");

// Sanitize HTML content to prevent XSS
export const sanitizeMarkdown = (content: string): string => {
  // Basic sanitization for markdown content
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
};

// Validate and sanitize form data
export const validateTemplateData = (data: { title?: unknown; description?: unknown; slug?: unknown }) => {
  return {
    title: templateTitleSchema.parse(data.title),
    description: templateDescriptionSchema.parse(data.description),
    slug: templateSlugSchema.parse(data.slug),
  };
};

export const validateSectionData = (data: { title?: unknown }) => {
  return {
    title: sectionTitleSchema.parse(data.title),
  };
};

export const validateItemData = (data: { title?: unknown; description?: string }) => {
  return {
    title: itemTitleSchema.parse(data.title),
    description: markdownContentSchema.parse(sanitizeMarkdown(data.description || '')),
  };
};

export const validateContentData = (data: { type?: unknown; value?: string }) => {
  const baseValidation = {
    type: z.enum(["text", "image", "video", "file", "embed", "subItems"]).parse(data.type),
  };

  switch (data.type) {
    case "text":
      return {
        ...baseValidation,
        value: markdownContentSchema.parse(sanitizeMarkdown(data.value || '')),
      };
    case "image":
    case "video":
    case "file":
      return {
        ...baseValidation,
        value: urlSchema.parse(data.value),
      };
    case "embed":
      return {
        ...baseValidation,
        value: z.string().max(5000, "Embed code too long").parse(data.value),
      };
    default:
      return baseValidation;
  }
};
