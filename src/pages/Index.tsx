import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  Globe,
  LayoutGrid,
  Moon,
  Play,
  Sun,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const surfaces = [
  {
    title: 'Template Editor (New)',
    description:
      'The authoring surface for creating reusable checklist templates with nested sections, tasks, and content blocks.',
    href: '/dashboard/templates/new',
    icon: FileText,
    badge: 'Authoring',
  },
  {
    title: 'Template Editor (Edit)',
    description:
      'Edit an existing template with all the same capabilities as the new template editor.',
    href: '/dashboard/templates/tpl-1/edit',
    icon: FileText,
    badge: 'Authoring',
  },
  {
    title: 'Run Execution View',
    description:
      'The checklist execution interface with progress tracking, task completion, and sub-task management.',
    href: '/run/run-1',
    icon: Play,
    badge: 'Execution',
  },
  {
    title: 'Shared Run View',
    description:
      'Guest-accessible run view via share link with optional completion permissions.',
    href: '/share/abc123',
    icon: Globe,
    badge: 'Execution',
  },
  {
    title: 'Template Library',
    description:
      'Private inventory view showing all your templates with search, filtering, and management actions.',
    href: '/dashboard/templates',
    icon: LayoutGrid,
    badge: 'Dashboard',
  },
  {
    title: 'Private Template Detail',
    description:
      'Owner management view for a template with stats, visibility toggle, and quick actions.',
    href: '/dashboard/templates/tpl-1',
    icon: FileText,
    badge: 'Dashboard',
  },
  {
    title: 'Runs Dashboard',
    description:
      'Track all your in-progress and completed runs with status filters and quick actions.',
    href: '/dashboard/runs',
    icon: Play,
    badge: 'Dashboard',
  },
  {
    title: 'Settings',
    description:
      'Manage your profile, notifications, privacy settings, and export data.',
    href: '/dashboard/settings',
    icon: User,
    badge: 'Dashboard',
  },
  {
    title: 'Public Template Discovery',
    description:
      'Browse and discover public templates created by the community, with category filtering and search.',
    href: '/templates',
    icon: Globe,
    badge: 'Discovery',
  },
  {
    title: 'Categories',
    description:
      'Explore templates organized by category to find exactly what you need.',
    href: '/categories',
    icon: LayoutGrid,
    badge: 'Discovery',
  },
  {
    title: 'Category Detail',
    description:
      'Browse all templates within a specific category with filtering and sorting.',
    href: '/categories/business',
    icon: LayoutGrid,
    badge: 'Discovery',
  },
  {
    title: 'Public Template Detail',
    description:
      'Evaluation page where users preview a template, see what it includes, and start a run or save to library.',
    href: '/profile/designops/website-launch-checklist',
    icon: FileText,
    badge: 'Discovery',
  },
  {
    title: 'Creator Profile',
    description:
      'Public creator profile page showing their templates, stats, and bio.',
    href: '/profile/designops',
    icon: User,
    badge: 'Discovery',
  },
] as const;

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Checklist Product Prototype
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9 w-9" size="icon" variant="ghost">
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Light</DropdownMenuItem>
              <DropdownMenuItem>Dark</DropdownMenuItem>
              <DropdownMenuItem>System</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 md:py-12">
        <div className="mb-8 text-center md:mb-12">
          <h1 className="mb-4 text-balance text-2xl font-bold text-foreground md:text-3xl">
            Checklist &amp; Template Experience
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground md:text-base">
            A prototype of the key surfaces for a checklist and template
            product. Explore the authoring layer (template editor), execution
            layer (run view), and distribution layer (discovery and sharing).
          </p>
        </div>

        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4 md:mb-12">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to="/dashboard/templates/new">
              <FileText className="mr-2 h-4 w-4" />
              Create a Template
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
          >
            <Link to="/templates">
              <Globe className="mr-2 h-4 w-4" />
              Browse Templates
            </Link>
          </Button>
          <Button
            asChild
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto"
          >
            <Link to="/dashboard/templates">
              <LayoutGrid className="mr-2 h-4 w-4" />
              Design Docs
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          {surfaces.map((surface) => {
            const Icon = surface.icon;

            return (
              <Link
                key={surface.href}
                to={surface.href}
                className="group flex flex-col rounded-lg border border-border bg-card p-4 transition-all hover:border-muted-foreground/30 hover:shadow-lg hover:shadow-black/5 sm:p-6"
              >
                <div className="mb-3 flex items-start justify-between sm:mb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary sm:h-10 sm:w-10">
                    <Icon className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {surface.badge}
                  </span>
                </div>
                <h2 className="mb-1 text-sm font-medium text-foreground transition-colors group-hover:text-primary sm:mb-2 sm:text-base">
                  {surface.title}
                </h2>
                <p className="mb-3 flex-1 text-xs text-muted-foreground sm:mb-4 sm:text-sm">
                  {surface.description}
                </p>
                <div className="flex items-center text-xs text-muted-foreground transition-colors group-hover:text-foreground sm:text-sm">
                  View surface
                  <ArrowRight className="ml-1 h-3 w-3 sm:h-4 sm:w-4" />
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-12 rounded-lg border border-border bg-card p-6 text-center">
          <h2 className="mb-2 font-medium text-foreground">
            Design System Documentation
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            This prototype uses a dark theme with a clean, minimal aesthetic
            inspired by modern productivity tools. Full documentation of color
            tokens, typography, layout patterns, and custom components is
            available in the design docs.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/templates">
              View Documentation
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Index;
