/**
 * SEO metadata templates for different page types
 */

export interface SEOConfig {
  titleTemplate: string;
  descriptionTemplate: string;
  defaultTitle: string;
  defaultDescription: string;
}

// SEO templates configuration
export const seoConfig: Record<string, SEOConfig> = {
  publicChecklist: {
    titleTemplate: "{checklistName} Checklist - Complete Step-by-Step Guide",
    descriptionTemplate: "Follow this comprehensive {checklistName} checklist to ensure you don't miss any important steps. {description}",
    defaultTitle: "Checklist Template",
    defaultDescription: "A comprehensive step-by-step checklist to help you complete your tasks efficiently."
  },
  publicTemplate: {
    titleTemplate: "{templateName} Template - Ready to Use",
    descriptionTemplate: "Use this {templateName} template to streamline your workflow. {description}",
    defaultTitle: "Template",
    defaultDescription: "A ready-to-use template to help you get started quickly."
  },
  homepage: {
    titleTemplate: "Free Checklist Templates - {siteName}",
    descriptionTemplate: "Discover free, professional checklist templates for any project. Streamline your workflow with our collection of ready-to-use checklists.",
    defaultTitle: "Checklist Templates",
    defaultDescription: "Professional checklist templates to help you stay organized and productive."
  }
};

/**
 * Generate SEO metadata for a template
 */
export const generateChecklistSEO = (template: {
  title: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
}) => {
  const config = seoConfig.publicChecklist;
  
  // Use custom SEO fields if provided, otherwise use templates
  const title = template.seoTitle || 
    config.titleTemplate.replace('{checklistName}', template.title) ||
    config.defaultTitle;
    
  const description = template.seoDescription || 
    config.descriptionTemplate
      .replace('{checklistName}', template.title)
      .replace('{description}', template.description || '') ||
    config.defaultDescription;

  return {
    title,
    description,
    ogTitle: title,
    ogDescription: description
  };
};

/**
 * Apply SEO metadata to document head
 */
export const applySEOMetadata = (seo: {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
}) => {
  // Update document title
  document.title = seo.title;
  
  // Update or create meta description
  let metaDescription = document.querySelector('meta[name="description"]');
  if (!metaDescription) {
    metaDescription = document.createElement('meta');
    metaDescription.setAttribute('name', 'description');
    document.head.appendChild(metaDescription);
  }
  metaDescription.setAttribute('content', seo.description);
  
  // Update or create Open Graph meta tags
  const updateOGMeta = (property: string, content: string) => {
    let ogMeta = document.querySelector(`meta[property="${property}"]`);
    if (!ogMeta) {
      ogMeta = document.createElement('meta');
      ogMeta.setAttribute('property', property);
      document.head.appendChild(ogMeta);
    }
    ogMeta.setAttribute('content', content);
  };
  
  updateOGMeta('og:title', seo.ogTitle || seo.title);
  updateOGMeta('og:description', seo.ogDescription || seo.description);
  updateOGMeta('og:type', 'website');
};