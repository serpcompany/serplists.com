import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { CheckCircle, ArrowRight, ListChecks, BookOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useTemplates } from "@/contexts/TemplatesContext";
import { useState, useEffect } from "react";
import { UserInfo } from "@/components/shared/UserInfo";
const Index = () => {
  const {
    user
  } = useAuth();
  const {
    getAllPublicTemplates
  } = useTemplates();
  const [publicTemplates, setPublicTemplates] = useState([]);
  const [featuredTemplates, setFeaturedTemplates] = useState([]);
  useEffect(() => {
    const templates = getAllPublicTemplates();
    setPublicTemplates(templates.filter(t => t.userId !== "system"));
    setFeaturedTemplates(templates.filter(t => t.userId === "system"));
  }, [getAllPublicTemplates]);
  return <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="mb-16 text-center">
          <h1 className="mb-4 text-4xl font-bold md:text-5xl">
            Create and Run Checklists for Your Processes
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
            Build standardized checklists for your team, manage consistent
            processes, and track completion across your organization.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {user ? <Link to="/templates">
                <Button className="text-md px-6 py-2">
                  My Templates
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link> : <Link to="/register">
                <Button className="text-md px-6 py-2">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>}
          </div>
        </div>

        {featuredTemplates.length > 0 && <div className="py-12">
            <h2 className="mb-4 text-center text-3xl font-bold">Featured Checklists</h2>
            <p className="mb-8 text-center text-muted-foreground">
              Try these example checklists - no login required!
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              {featuredTemplates.map((template: { id: unknown; title: unknown; description: unknown; sections: unknown; slug: unknown }) => <Card key={template.id} className="overflow-hidden border-2 border-primary/20 transition-all hover:shadow-md">
                  <CardHeader className="bg-primary/5">
                    <CardTitle className="text-2xl">{template.title}</CardTitle>
                    <CardDescription className="text-base">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground">
                      <div className="mb-2 flex items-center">
                        <ListChecks className="mr-2 h-4 w-4" />
                        <span>
                          {template.sections.reduce((total, section) => total + section.items.length, 0)}{" "}
                          items in {template.sections.length} sections
                        </span>
                      </div>
                      <div className="flex items-center">
                        <BookOpen className="mr-2 h-4 w-4" />
                        <span>Example Process</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Link to={`/checklists/${template.slug}`} className="w-full">
                      <Button variant="default" className="w-full">
                        View Checklist
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>)}
            </div>
          </div>}

        {publicTemplates.length > 0 && <div className="py-12">
            <h2 className="mb-8 text-center text-2xl font-bold">Community Checklists</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {publicTemplates.map((template: { id: unknown; title: unknown; description: unknown; sections: unknown; userId: unknown; slug: unknown }) => <Card key={template.id} className="overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-xl">{template.title}</CardTitle>
                    <CardDescription>
                      {template.description || "No description"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        <div className="flex items-center">
                          <ListChecks className="mr-2 h-4 w-4" />
                          <span>
                            {template.sections.reduce((total, section) => total + section.items.length, 0)}{" "}
                            items in {template.sections.length} sections
                          </span>
                        </div>
                      </div>
                      <UserInfo userId={template.userId} />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Link to={`/checklists/${template.slug}`} className="w-full">
                      <Button variant="outline" className="w-full">
                        View Checklist
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>)}
            </div>
          </div>}

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">Create Templates</h3>
            <p className="text-muted-foreground">
              Build reusable checklist templates with sections, items, and detailed
              instructions for your team to follow.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ListChecks className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">Run Checklists</h3>
            <p className="text-muted-foreground">
              Create runs from templates to track progress through each item and
              ensure consistent process execution.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">Share Publicly</h3>
            <p className="text-muted-foreground">
              Share your checklists publicly with anyone, allowing them to view and use
              your process workflows.
            </p>
          </div>
        </div>

        
      </div>
    </div>;
};
export default Index;