import React from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { PublicPill } from "@/components/shared/PublicPill";
import { ArrowRight } from "lucide-react";
import { buildPublicCategoryPath, buildPublicCategoriesPath, buildPublicTemplatesPath } from "@/lib/routes";

interface Template {
  id: string;
  categories: string[];
}

interface CategoryNavigationProps {
  allCategories: string[];
  templates: Template[];
  category?: string;
  onCategoryClick: (categoryName: string) => void;
}

export const CategoryNavigation: React.FC<CategoryNavigationProps> = ({
  allCategories,
  templates,
  category,
  onCategoryClick,
}) => {
  const navigate = useNavigate();

  if (allCategories.length === 0) return null;

  // Show different navigation based on whether we're on a specific category page
  if (category) {
    const filteredCount = templates.filter(t => t.categories.includes(category)).length;
    
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold capitalize">{category} Checklists</h2>
            <Badge variant="secondary">
              {filteredCount} {filteredCount === 1 ? 'checklist' : 'checklists'}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={buildPublicCategoriesPath()}
              onClick={(e) => {
                e.preventDefault();
                navigate(buildPublicCategoriesPath());
              }}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              Browse All Categories
              <ArrowRight className="h-3 w-3" />
            </a>
            <a
              href={buildPublicTemplatesPath()}
              onClick={(e) => {
                e.preventDefault();
                navigate(buildPublicTemplatesPath());
              }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to All Checklists
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Browse by Category</h2>
        <a
          href={buildPublicCategoriesPath()}
          onClick={(e) => {
            e.preventDefault();
            navigate(buildPublicCategoriesPath());
          }}
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View All Categories
          <ArrowRight className="h-3 w-3" />
        </a>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={buildPublicTemplatesPath()}
          onClick={(e) => {
            e.preventDefault();
            navigate(buildPublicTemplatesPath());
          }}
        >
          <PublicPill tone="active" className="text-sm">
            All Categories ({templates.length})
          </PublicPill>
        </a>
        {allCategories
          .filter((cat) => {
            const count = templates.filter(t => t.categories.includes(cat)).length;
            return count > 0; // Only show categories with at least one template
          })
          .map((cat) => {
            const count = templates.filter(t => t.categories.includes(cat)).length;
            const categoryUrl = buildPublicCategoryPath(cat);
            return (
              <a
                key={cat}
                href={categoryUrl}
                onClick={(e) => {
                  e.preventDefault();
                  onCategoryClick(cat);
                }}
              >
                <PublicPill tone="active" className="text-sm">
                  {cat} ({count})
                </PublicPill>
              </a>
            );
          })}
      </div>
    </div>
  );
};
