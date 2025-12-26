import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Calendar, User, ArrowLeft, ExternalLink, Star, Clock, Grid, List } from "lucide-react";
// Supabase removed - using Cloudflare API
import { ChecklistTemplate } from "@/types/checklist";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { AvatarUpload } from "@/components/shared/AvatarUpload";
import { useAuth } from "@/contexts/CloudflareAuthContext";
interface UserProfile {
  id: string;
  full_name: string | null;
  username: string;
  avatar_url: string | null;
  created_at: string;
}
interface UserStats {
  totalTemplates: number;
  totalItems: number;
  categoriesUsed: string[];
  averageItemsPerTemplate: number;
  mostRecentTemplate: string | null;
}
const UserProfile = () => {
  const {
    username
  } = useParams<{
    username: string;
  }>();
  const {
    user
  } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const calculateStats = (templatesData: ChecklistTemplate[]): UserStats => {
    const totalItems = templatesData.reduce((total, template) => total + template.sections.reduce((sectionTotal, section) => sectionTotal + section.items.length, 0), 0);
    const allCategories = templatesData.flatMap(template => template.categories || []);
    const categoriesUsed = [...new Set(allCategories)];
    const averageItemsPerTemplate = templatesData.length > 0 ? Math.round(totalItems / templatesData.length) : 0;
    const mostRecentTemplate = templatesData.length > 0 ? templatesData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].title : null;
    return {
      totalTemplates: templatesData.length,
      totalItems,
      categoriesUsed,
      averageItemsPerTemplate,
      mostRecentTemplate
    };
  };
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const cleanUsername = username || '';
        console.log('UserProfile loading for:', cleanUsername);
        if (!cleanUsername) {
          setError("No username provided");
          setIsLoading(false);
          return;
        }

        // TODO: Replace with Cloudflare API call
        // Try to find user by username
        const profileData = null;
        const profileError = true;
        if (profileError || !profileData) {
          // TODO: Replace with Cloudflare API call
          // Fallback: try to find by affiliate_code
          const affiliateData = null;
          const affiliateError = true;
          if (affiliateError || !affiliateData) {
            setError("User not found");
            setIsLoading(false);
            return;
          }

          // Use affiliate data
          setProfile({
            ...affiliateData,
            username: affiliateData.username || affiliateData.affiliate_code
          });
          const userIdToFetch = affiliateData.id;
          if (userIdToFetch) {
            // TODO: Replace with Cloudflare API call
            // Fetch user's public templates
            const templatesData = [];
            if (templatesData) {
              const formattedTemplates = templatesData.map((template: { id: unknown; title: unknown; description: unknown; sections: unknown; created_at: unknown; updated_at: unknown; slug: unknown; categories: unknown; tags: unknown }) => ({
                id: template.id,
                title: template.title,
                description: template.description || '',
                sections: template.sections as unknown,
                userId: userIdToFetch,
                createdAt: template.created_at,
                updatedAt: template.updated_at,
                isPublic: true,
                slug: template.slug || '',
                categories: template.categories || [],
                tags: template.tags || []
              }));
              setTemplates(formattedTemplates);
              setStats(calculateStats(formattedTemplates));
            }
          }
        } else {
          setProfile(profileData);
          const userIdToFetch = profileData.id;
          if (userIdToFetch) {
            // TODO: Replace with Cloudflare API call
            // Fetch user's public templates
            const templatesData = [];
            if (templatesData) {
              const formattedTemplates = templatesData.map((template: { id: unknown; title: unknown; description: unknown; sections: unknown; created_at: unknown; updated_at: unknown; slug: unknown; categories: unknown; tags: unknown }) => ({
                id: template.id,
                title: template.title,
                description: template.description || '',
                sections: template.sections as unknown,
                userId: userIdToFetch,
                createdAt: template.created_at,
                updatedAt: template.updated_at,
                isPublic: true,
                slug: template.slug || '',
                categories: template.categories || [],
                tags: template.tags || []
              }));
              setTemplates(formattedTemplates);
              setStats(calculateStats(formattedTemplates));
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setError("Failed to load user data");
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserProfile();
  }, [username]);
  const getTotalItems = (template: ChecklistTemplate) => {
    return template.sections.reduce((total, section) => total + section.items.length, 0);
  };
  const getFeaturedTemplates = () => {
    return templates.sort((a, b) => getTotalItems(b) - getTotalItems(a)).slice(0, 3);
  };
  const getRecentTemplates = () => {
    return templates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);
  };
  const handleAvatarUpdate = (newAvatarUrl: string) => {
    if (profile) {
      setProfile({
        ...profile,
        avatar_url: newAvatarUrl
      });
    }
  };
  const isOwnProfile = user?.id === profile?.id;
  if (isLoading) {
    return <LoadingSpinner />;
  }
  if (error || !profile) {
    return <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <Link to="/">
              <Button variant="ghost">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </div>
          <EmptyState title={error === "User not found" ? "User Not Found" : "Error"} description={error || "Something went wrong"} icon={User} />
        </div>
      </div>;
  }
  return <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Back Button */}
        <div className="mb-6">
          <Link to="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>

        {/* Profile Header */}
        <div className="mb-8">
          <Card className="overflow-hidden">
            {/* Cover Area */}
            <div className="h-32 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5" />
            
            {/* Profile Info */}
            <CardContent className="relative -mt-16 pt-16">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                {/* Avatar */}
                <div className="relative">
                  <AvatarUpload currentAvatarUrl={profile.avatar_url} onAvatarUpdate={handleAvatarUpdate} size="lg" editable={isOwnProfile} />
                </div>
                
                {/* User Details */}
                <div className="flex-1 space-y-4">
                  <div>
                    <h1 className="text-3xl font-bold">
                      @{profile.username}
                    </h1>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                      <Calendar className="h-4 w-4" />
                      Joined {new Date(profile.created_at).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric'
                    })}
                    </div>
                  </div>
                  
                  {/* Stats Cards */}
                  {stats && <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-primary">{stats.totalTemplates}</div>
                        <div className="text-xs text-muted-foreground">Templates</div>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-primary">{stats.totalItems}</div>
                        <div className="text-xs text-muted-foreground">Total Items</div>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-primary">{stats.categoriesUsed.length}</div>
                        <div className="text-xs text-muted-foreground">Categories</div>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-primary">{stats.averageItemsPerTemplate}</div>
                        <div className="text-xs text-muted-foreground">Avg Items</div>
                      </div>
                    </div>}
                  
                  {/* Categories */}
                  {stats && stats.categoriesUsed.length > 0 && <div>
                      <h3 className="text-sm font-medium mb-2">Specializes in:</h3>
                      <div className="flex flex-wrap gap-2">
                        {stats.categoriesUsed.slice(0, 8).map(category => <Link key={category} to={`/checklists/category/${encodeURIComponent(category)}`}>
                            <Badge variant="secondary" className="text-xs hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer">
                              {category}
                            </Badge>
                          </Link>)}
                        {stats.categoriesUsed.length > 8 && <Badge variant="secondary" className="text-xs">
                            +{stats.categoriesUsed.length - 8} more
                          </Badge>}
                      </div>
                    </div>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        {templates.length === 0 ? <EmptyState title="No Public Checklists" description={`@${profile.username} hasn't published any public checklists yet.`} icon={CheckCircle} /> : <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="templates">All Templates</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* Featured Templates */}
              {getFeaturedTemplates().length > 0 && <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Star className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-semibold">Featured Templates</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {getFeaturedTemplates().map((template: { id: unknown; title: unknown; description: unknown; sections: unknown; slug: unknown }) => <Card key={template.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base line-clamp-2">{template.title}</CardTitle>
                          {template.description && <p className="text-sm text-muted-foreground line-clamp-2">
                              {template.description}
                            </p>}
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                            <span>{template.sections.length} sections</span>
                            <span>{getTotalItems(template)} items</span>
                          </div>
                          <Link to={`/template/${template.slug || template.id}`}>
                            <Button variant="outline" size="sm" className="w-full">
                              <ExternalLink className="mr-2 h-3 w-3" />
                              View Template
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>)}
                  </div>
                </div>}

              <Separator />

              {/* Recent Templates */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Recent Templates</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {getRecentTemplates().map((template: { id: unknown; title: unknown; createdAt: unknown; sections: unknown; slug: unknown }) => <Card key={template.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm line-clamp-2">{template.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {new Date(template.createdAt).toLocaleDateString()}
                        </p>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                          <span>{template.sections.length} sections</span>
                          <span>{getTotalItems(template)} items</span>
                        </div>
                        <Link to={`/template/${template.slug || template.id}`}>
                          <Button variant="outline" size="sm" className="w-full text-xs">
                            View Template
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>)}
                </div>
              </div>
            </TabsContent>

            {/* All Templates Tab */}
            <TabsContent value="templates" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">All Templates ({templates.length})</h2>
                <div className="flex items-center gap-2">
                  <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('grid')}>
                    <Grid className="h-4 w-4" />
                  </Button>
                  <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('list')}>
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
                {templates.map((template: { id: unknown; title: unknown; description: unknown; sections: unknown; categories: unknown; createdAt: unknown; slug: unknown }) => <Card key={template.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle className={viewMode === 'grid' ? "line-clamp-2" : ""}>{template.title}</CardTitle>
                      {template.description && <p className={`text-sm text-muted-foreground ${viewMode === 'grid' ? 'line-clamp-3' : ''}`}>
                          {template.description}
                        </p>}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>{template.sections.length} sections</span>
                          <span>{getTotalItems(template)} items</span>
                        </div>

                        {template.categories && template.categories.length > 0 && <div className="flex flex-wrap gap-1">
                            {template.categories.slice(0, 3).map(category => <Link key={category} to={`/checklists/category/${encodeURIComponent(category)}`}>
                                <Badge variant="secondary" className="text-xs hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer">
                                  {category}
                                </Badge>
                              </Link>)}
                            {template.categories.length > 3 && <Badge variant="secondary" className="text-xs">
                                +{template.categories.length - 3}
                              </Badge>}
                          </div>}

                        <div className="text-xs text-muted-foreground">
                          Created {new Date(template.createdAt).toLocaleDateString()}
                        </div>

                        <Link to={`/template/${template.slug || template.id}`}>
                          <Button variant="outline" className="w-full">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View Template
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>)}
              </div>
            </TabsContent>

          </Tabs>}
      </div>
    </div>;
};
export default UserProfile;