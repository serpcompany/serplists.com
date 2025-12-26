import React from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

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
              href="/categories"
              onClick={(e) => {
                e.preventDefault();
                navigate('/categories');
              }}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              Browse All Categories
              <ArrowRight className="h-3 w-3" />
            </a>
            <a
              href="/checklists"
              onClick={(e) => {
                e.preventDefault();
                navigate('/checklists');
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
          href="/categories"
          onClick={(e) => {
            e.preventDefault();
            navigate('/categories');
          }}
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View All Categories
          <ArrowRight className="h-3 w-3" />
        </a>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href="/checklists"
          className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80"
          onClick={(e) => {
            e.preventDefault();
            navigate('/checklists');
          }}
        >
          All Categories ({templates.length})
        </a>
        {allCategories
          .filter((cat) => {
            const count = templates.filter(t => t.categories.includes(cat)).length;
            return count > 0; // Only show categories with at least one template
          })
          .map((cat) => {
            const count = templates.filter(t => t.categories.includes(cat)).length;
            const categoryUrl = `/checklists/category/${encodeURIComponent(cat)}`;
            return (
              <a
                key={cat}
                href={categoryUrl}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80"
                onClick={(e) => {
                  e.preventDefault();
                  onCategoryClick(cat);
                }}
              >
                {cat} ({count})
              </a>
            );
          })}
      </div>
    </div>
  );
};