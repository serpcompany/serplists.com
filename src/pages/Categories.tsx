import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  ChevronRight,
  Code,
  FileText,
  Heart,
  Layers,
  Paintbrush,
  Search,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

import { TemplatesDiscoveryHeader } from '@/components/checklist-library/TemplatesDiscoveryHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const categories = [
  {
    slug: 'business',
    name: 'Business & Operations',
    description: 'Templates for business processes, operations, and management',
    icon: Briefcase,
    templateCount: 156,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    slug: 'engineering',
    name: 'Engineering & Development',
    description:
      'Checklists for code reviews, deployments, and development workflows',
    icon: Code,
    templateCount: 234,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  {
    slug: 'design',
    name: 'Design & Creative',
    description:
      'Templates for design processes, brand guidelines, and creative projects',
    icon: Paintbrush,
    templateCount: 89,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
  },
  {
    slug: 'marketing',
    name: 'Marketing & Growth',
    description: 'Launch checklists, campaign templates, and growth strategies',
    icon: TrendingUp,
    templateCount: 112,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  {
    slug: 'hr',
    name: 'HR & People',
    description:
      'Onboarding, offboarding, and people management templates',
    icon: Users,
    templateCount: 78,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
  },
  {
    slug: 'personal',
    name: 'Personal & Lifestyle',
    description:
      'Personal productivity, wellness, and life management checklists',
    icon: Heart,
    templateCount: 201,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
  },
  {
    slug: 'productivity',
    name: 'Productivity',
    description: 'Task management, time tracking, and workflow optimization',
    icon: Zap,
    templateCount: 167,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
  },
  {
    slug: 'project-management',
    name: 'Project Management',
    description:
      'Project planning, milestones, and team coordination templates',
    icon: Layers,
    templateCount: 143,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
  },
  {
    slug: 'compliance',
    name: 'Compliance & Legal',
    description:
      'Regulatory compliance, audits, and legal process checklists',
    icon: FileText,
    templateCount: 45,
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
  },
] as const;

const featuredCategories = categories.slice(0, 4);

const Categories = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCategories = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return categories;
    }

    return categories.filter(
      (category) =>
        category.name.toLowerCase().includes(normalizedQuery) ||
        category.description.toLowerCase().includes(normalizedQuery),
    );
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      <TemplatesDiscoveryHeader />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Browse Categories
          </h1>
          <p className="mt-2 text-muted-foreground">
            Explore templates organized by category to find exactly what you
            need.
          </p>
        </div>

        <div className="mb-8">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search categories..."
              className="border-border bg-card pl-10"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Popular Categories
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {featuredCategories.map((category) => {
              const Icon = category.icon;
              return (
                <Link key={category.slug} to={`/categories/${category.slug}`}>
                  <Card className="group h-full border-border bg-card transition-all hover:border-muted-foreground/50 hover:bg-card/80">
                    <CardContent className="p-6">
                      <div
                        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${category.bgColor}`}
                      >
                        <Icon className={`h-6 w-6 ${category.color}`} />
                      </div>
                      <h3 className="font-medium text-foreground group-hover:text-foreground/80">
                        {category.name}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {category.templateCount} templates
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            All Categories
          </h2>
          <div className="space-y-3">
            {filteredCategories.map((category) => {
              const Icon = category.icon;
              return (
                <Link key={category.slug} to={`/categories/${category.slug}`}>
                  <Card className="group border-border bg-card transition-all hover:border-muted-foreground/50 hover:bg-card/80">
                    <CardContent className="flex items-center gap-4 p-4">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${category.bgColor}`}
                      >
                        <Icon className={`h-6 w-6 ${category.color}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-foreground">
                          {category.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {category.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="secondary">
                          {category.templateCount} templates
                        </Badge>
                        <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-12 rounded-xl border border-border bg-card p-8 text-center">
          <h2 className="text-xl font-semibold text-foreground">
            Can&apos;t find what you&apos;re looking for?
          </h2>
          <p className="mt-2 text-muted-foreground">
            Create your own template from scratch and share it with the
            community.
          </p>
          <Button asChild className="mt-4 bg-foreground text-background hover:bg-foreground/90">
            <Link to="/dashboard/templates/new">
              Create Template
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </section>
      </main>
    </div>
  );
};

export default Categories;
