import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Users, ShieldCheck } from "lucide-react";

const VALUES = [
  {
    title: "Clarity",
    description: "Make every step explicit so teams run work the same way every time.",
    icon: Target,
  },
  {
    title: "Consistency",
    description: "Standardize repeatable processes without slowing down day-to-day work.",
    icon: ShieldCheck,
  },
  {
    title: "Community",
    description: "Share public checklists to help others move faster with proven workflows.",
    icon: Users,
  },
] as const;

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold md:text-5xl">About SERP Lists</h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            SERP Lists helps teams and solo operators turn repeatable work into checklists that are easy to run,
            track, and share.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link to="/features">Explore Features</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/contact">Contact Us</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {VALUES.map((value) => {
            const Icon = value.icon;
            return (
              <Card key={value.title} className="border bg-card">
                <CardHeader>
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <CardTitle>{value.title}</CardTitle>
                  <CardDescription>{value.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default About;
