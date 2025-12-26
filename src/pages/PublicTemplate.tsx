import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, PlayCircle } from "lucide-react";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useTemplates, ChecklistTemplate } from "@/contexts/TemplatesContext";
import { toast } from "sonner";
import { SEOHead } from "@/components/shared/SEOHead";
import { analytics } from "@/lib/analytics";
import { PublicTemplateContent } from "@/components/template/PublicTemplateContent";

const PublicTemplate = () => {
  const { slug } = useParams<{ slug: string }>();
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { createRun, templates, getTemplateBySlug } = useTemplates();

  useEffect(() => {
    const fetchTemplate = async () => {
      if (!slug) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      
      // Try to find template by slug or ID
      let foundTemplate: ChecklistTemplate | undefined;
      
      // Check if slug looks like a UUID (ID)
      if (slug.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        foundTemplate = templates.find((t: { id: unknown; isPublic: unknown }) => t.id === slug && t.isPublic);
      } else {
        // Try finding by slug first
        foundTemplate = getTemplateBySlug?.(slug);
        
        // If not found by slug, try finding by ID (for backwards compatibility)
        if (!foundTemplate) {
          foundTemplate = templates.find((t: { id: unknown; isPublic: unknown }) => t.id === slug && t.isPublic);
        }
      }

      if (!foundTemplate || !foundTemplate.isPublic) {
        setNotFound(true);
      } else {
        setTemplate(foundTemplate);
        // Track template view
        analytics.trackTemplateView(foundTemplate.id, foundTemplate.title);
      }
      
      setLoading(false);
    };

    fetchTemplate();
  }, [slug, templates, getTemplateBySlug]);

  const handleStartRun = async () => {
    if (!template) return;
    
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    setIsCreatingRun(true);
    try {
      const newRun = await createRun({
        templateId: template.id,
        runName: `${template.title} - ${new Date().toLocaleDateString()}`
      });
      
      if (newRun) {
        toast.success("Template run started!");
        navigate(`/checklist/${newRun.id}`);
      }
    } catch (error) {
      console.error('Error creating run:', error);
      toast.error("Failed to start template run");
    } finally {
      setIsCreatingRun(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading template...</p>
        </div>
      </div>
    );
  }

  if (notFound || !template) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Template Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The template you're looking for doesn't exist or isn't publicly available.
          </p>
          <Button asChild>
            <Link to="/checklists">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Browse Checklists
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={template?.title}
        description={template?.description || `${template?.title} - Interactive checklist template`}
        keywords={template?.categories || ['checklist', 'template']}
        type="article"
        publishedTime={template?.created_at}
      />
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Button variant="ghost" asChild className="mb-4">
            <Link to="/checklists">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Checklists
            </Link>
          </Button>
          
          <header className="mb-8">
            <div className="flex items-start justify-between mb-4">
              <h1 className="text-4xl font-bold">{template.title}</h1>
              {template.is_premium && (
                <Badge variant="secondary">Premium</Badge>
              )}
            </div>
            
            {template.description && (
              <p className="text-xl text-muted-foreground mb-4">{template.description}</p>
            )}
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Created on {new Date(template.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
                
                {template.categories && template.categories.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {template.categories.map((category) => (
                      <Link
                        key={category}
                        to={`/checklists/category/${encodeURIComponent(category)}`}
                        className="inline-block"
                      >
                        <Badge variant="outline" className="text-xs hover:bg-secondary cursor-pointer transition-colors">
                          {category}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              
              <Button onClick={handleStartRun} disabled={isCreatingRun}>
                <PlayCircle className="mr-2 h-4 w-4" />
                {isCreatingRun ? "Starting..." : "Start Checklist"}
              </Button>
            </div>
          </header>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Template Content</h2>
          <PublicTemplateContent sections={template.sections || []} />
        </div>
      </div>
    </div>
  );
};

export default PublicTemplate;