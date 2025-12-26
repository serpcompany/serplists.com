import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserInfo } from "@/components/shared/UserInfo";
import { ChecklistSection } from "@/lib/schemas/checklistSchema";

interface Template {
  id: string;
  title: string;
  description: string | null;
  sections: ChecklistSection[];
  categories: string[];
  slug: string | null;
  user_id: string;
}

interface TemplateCardProps {
  template: Template;
  viewMode: "grid" | "list";
  onTemplateClick: (template: Template) => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  viewMode,
  onTemplateClick,
}) => {
  const navigate = useNavigate();

  const handleCategoryClick = (e: React.MouseEvent, category: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/checklists/category/${encodeURIComponent(category)}`);
  };

  const totalItems = template.sections.reduce((count: number, section) => count + section.items.length, 0);

  if (viewMode === "list") {
    return (
      <Card 
        className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
        onClick={() => onTemplateClick(template)}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg line-clamp-1 mb-1">{template.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                {template.description || "No description provided"}
              </p>
              {template.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {template.categories.slice(0, 4).map((cat) => (
                    <a
                      key={cat}
                      href={`/checklists/category/${encodeURIComponent(cat)}`}
                      onClick={(e) => handleCategoryClick(e, cat)}
                      className="hover:opacity-80 transition-opacity"
                    >
                      <Badge variant="secondary" className="text-xs cursor-pointer">
                        {cat}
                      </Badge>
                    </a>
                  ))}
                  {template.categories.length > 4 && (
                    <Badge variant="secondary" className="text-xs">
                      +{template.categories.length - 4}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="text-right text-sm text-muted-foreground ml-4">
              <div>{template.sections.length} sections</div>
              <div>{totalItems} items</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onTemplateClick(template)}
    >
      <CardHeader>
        <CardTitle className="line-clamp-2">{template.title}</CardTitle>
        <CardDescription className="line-clamp-3">
          {template.description || "No description provided"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{template.sections.length} sections</span>
            <span>{totalItems} items</span>
          </div>
          <UserInfo userId={template.user_id} />
          {template.categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {template.categories.slice(0, 3).map((cat) => (
                <a
                  key={cat}
                  href={`/checklists/category/${encodeURIComponent(cat)}`}
                  onClick={(e) => handleCategoryClick(e, cat)}
                  className="hover:opacity-80 transition-opacity"
                >
                  <Badge variant="secondary" className="text-xs cursor-pointer">
                    {cat}
                  </Badge>
                </a>
              ))}
              {template.categories.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{template.categories.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};