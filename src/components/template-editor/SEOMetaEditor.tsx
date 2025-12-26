import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

interface SEOMetaEditorProps {
  seoTitle: string;
  seoDescription: string;
  seoUrl: string;
  onSeoTitleChange: (value: string) => void;
  onSeoDescriptionChange: (value: string) => void;
  onSeoUrlChange: (value: string) => void;
}

export const SEOMetaEditor = ({
  seoTitle,
  seoDescription,
  seoUrl,
  onSeoTitleChange,
  onSeoDescriptionChange,
  onSeoUrlChange
}: SEOMetaEditorProps) => {
  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">SEO Meta Information</h2>
          <p className="text-sm text-muted-foreground mb-6">Optimize how your template appears in search results and when shared</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="seoTitle" className="text-base font-medium">SEO Title</Label>
            <Input
              id="seoTitle"
              value={seoTitle}
              onChange={(e) => onSeoTitleChange(e.target.value)}
              placeholder="SEO-optimized title for search engines"
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="seoUrl" className="text-base font-medium">Custom URL Slug</Label>
            <Input
              id="seoUrl"
              value={seoUrl}
              onChange={(e) => onSeoUrlChange(e.target.value)}
              placeholder="custom-url-slug"
              className="mt-2"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="seoDescription" className="text-base font-medium">SEO Meta Description</Label>
            <Textarea
              id="seoDescription"
              value={seoDescription}
              onChange={(e) => onSeoDescriptionChange(e.target.value)}
              placeholder="Brief description for search engines (150-160 characters recommended)"
              className="mt-2"
              rows={2}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};