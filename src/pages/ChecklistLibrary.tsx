import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchAndFilters } from "@/components/checklist-library/SearchAndFilters";
import { CategoryNavigation } from "@/components/checklist-library/CategoryNavigation";
import { TemplateCard } from "@/components/checklist-library/TemplateCard";
import { useTemplateLibrary } from "@/hooks/useTemplateLibrary";

const ChecklistLibrary = () => {
  const { category } = useParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const {
    templates,
    filteredTemplates,
    loading,
    searchQuery,
    setSearchQuery,
    selectedCategories,
    setSelectedCategories,
    allCategories,
  } = useTemplateLibrary(category);

  const handleCategoryClick = (categoryName: string) => {
    if (category === categoryName) {
      navigate('/checklists');
    } else {
      navigate(`/checklists/category/${encodeURIComponent(categoryName)}`);
    }
  };

  const handleTemplateClick = (template: { slug: unknown; id: unknown }) => {
    // Use slug if available, otherwise use ID
    const identifier = template.slug || template.id;
    navigate(`/checklists/${identifier}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="mb-8">
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i: number) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {category ? `${category} Checklists` : 'Checklists'}
          </h1>
          <p className="text-muted-foreground">
            {category 
              ? `Browse all ${category.toLowerCase()} checklists from the community`
              : 'Browse and discover checklists created by the community'
            }
          </p>
        </div>

        <SearchAndFilters
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          viewMode={viewMode}
          setViewMode={setViewMode}
          allCategories={allCategories}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
        />

        {/* Active Filters and Results Count */}
        <div className="mb-4 space-y-2">
          {selectedCategories.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Active filters:</span>
              <div className="flex flex-wrap gap-1">
                {selectedCategories.map((cat) => (
                  <Badge key={cat} variant="secondary" className="text-xs">
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {filteredTemplates.length} checklist{filteredTemplates.length !== 1 ? 's' : ''} found
            {selectedCategories.length > 0 && ` with selected categories`}
          </p>
        </div>

        {/* Templates Grid/List */}
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              {category 
                ? `No checklists found in the "${category}" category.`
                : searchQuery 
                  ? `No checklists found matching "${searchQuery}".`
                  : 'No public checklists available yet.'
              }
            </p>
            {category && (
              <Button variant="outline" onClick={() => navigate('/checklists')}>
                Browse All Checklists
              </Button>
            )}
          </div>
        ) : (
          <div className={viewMode === "grid" 
            ? "grid gap-6 md:grid-cols-2 lg:grid-cols-3" 
            : "space-y-4"
          }>
            {filteredTemplates.map((template: { id: unknown }) => (
              <TemplateCard
                key={template.id}
                template={template}
                viewMode={viewMode}
                onTemplateClick={handleTemplateClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChecklistLibrary;