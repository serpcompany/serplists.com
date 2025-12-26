import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
// Supabase removed - using Cloudflare API
import { getPredefinedCategories } from "@/utils/categories";
import { ArrowRight, Folder, Tag } from "lucide-react";

interface CategoryData {
  name: string;
  count: number;
  description?: string;
}

const Categories = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      // TODO: Replace with Cloudflare API call to fetch template categories
      // const { data, error } = await supabase
      //   .from('templates')
      //   .select('categories')
      //   .eq('is_public', true);

      // if (error) throw error;

      // Get all unique categories and their counts
      const categoryCount = new Map<string, number>();
      const predefinedCategories = getPredefinedCategories();
      
      // Initialize predefined categories with 0 count (temporary dummy data)
      predefinedCategories.forEach(cat => categoryCount.set(cat, 0));
      
      // Since Supabase is disabled, no template data to count
      // TODO: Count categories from templates when API is implemented

      // Convert to array and sort by count, then alphabetically
      const categoriesData = Array.from(categoryCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a: { count: number; name: string }, b: { count: number; name: string }) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.name.localeCompare(b.name);
        });

      setCategories(categoriesData);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryDescription = (categoryName: string): string => {
    const descriptions: Record<string, string> = {
      wedding: "Complete wedding planning checklists to ensure your special day goes perfectly",
      moving: "Comprehensive moving checklists to help you relocate smoothly and efficiently", 
      camping: "Essential camping checklists for outdoor adventures and camping trips",
      packing: "Detailed packing lists for travel, moving, and various occasions",
      "morning routine": "Daily morning routine checklists to start your day productively",
      "home inspection": "Professional home inspection checklists for buyers and sellers",
      cooking: "Step-by-step cooking and recipe checklists for delicious meals"
    };
    return descriptions[categoryName.toLowerCase()] || `Discover ${categoryName} checklists and templates`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-64"></div>
            <div className="h-4 bg-muted rounded w-96"></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i: number) => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Browse Categories</h1>
          <p className="text-xl text-muted-foreground mb-6">
            Explore checklists organized by category to find exactly what you need
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Tag className="h-4 w-4" />
            <span>{categories.length} categories available</span>
          </div>
        </div>

        {/* Categories Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category: { name: unknown; count: unknown }) => (
            <Card 
              key={category.name}
              className="cursor-pointer hover:shadow-md transition-all duration-200 hover:scale-[1.02]"
              onClick={() => navigate(`/checklists/category/${encodeURIComponent(category.name)}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Folder className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg capitalize">{category.name}</CardTitle>
                  </div>
                  <Badge variant="secondary" className="ml-2">
                    {category.count}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4 line-clamp-2">
                  {getCategoryDescription(category.name)}
                </CardDescription>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {category.count} {category.count === 1 ? 'checklist' : 'checklists'}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {categories.length === 0 && (
          <div className="text-center py-12">
            <Folder className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No categories found</h3>
            <p className="text-muted-foreground">
              Categories will appear here as checklists are created.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Categories;