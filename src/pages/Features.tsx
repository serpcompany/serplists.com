import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ListChecks, Share2, UploadCloud } from "lucide-react";

const FEATURES = [
  {
    title: "Template Builder",
    description: "Create reusable checklists with sections, instructions, and structured steps.",
    icon: ListChecks,
  },
  {
    title: "Checklist Runs",
    description: "Run checklists, track progress, and keep work moving across items.",
    icon: CheckCircle,
  },
  {
    title: "Public Sharing",
    description: "Publish templates to the community library and share links with anyone.",
    icon: Share2,
  },
  {
    title: "Import + Export",
    description: "Backup templates and move them between accounts (Pro).",
    icon: UploadCloud,
  },
] as const;

const Features = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold md:text-5xl">Features that keep work consistent</h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Build checklists once, then run them repeatedly with confidence. SERP Lists focuses on clarity,
            repeatability, and simple sharing.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link to="/pricing">See Pricing</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/checklists">Browse Checklists</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="border bg-card">
                <CardHeader>
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Features;
