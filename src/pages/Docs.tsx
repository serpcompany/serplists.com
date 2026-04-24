import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  Globe,
  LayoutGrid,
  Play,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  IconBadge,
  PageHero,
  PageSection,
  Surface,
} from '@/components/layout/page-shell';

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

const Docs = () => {
  return (
    <PageSection as="main" spacing="lg" width="content">
      <PageHero
        align="center"
        eyebrow="Prototype map"
        title="Checklist & Template Experience"
        description="Explore the authoring layer, execution layer, and distribution layer across the current product surfaces."
        actions={
          <>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/">Back to Marketing Site</Link>
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
          </>
        }
      />

      <div className="mt-10 grid gap-3 sm:gap-4 md:grid-cols-2">
          {surfaces.map((surface) => {
            const Icon = surface.icon;

            return (
              <Surface
                as="article"
                key={surface.href}
                className="group flex flex-col transition hover:border-muted-foreground/40 hover:shadow-lg hover:shadow-black/5"
                padding="md"
              >
                <div className="mb-3 flex items-start justify-between sm:mb-4">
                  <IconBadge>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </IconBadge>
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
                <Link
                  to={surface.href}
                  className="flex items-center text-xs text-muted-foreground transition-colors group-hover:text-foreground sm:text-sm"
                >
                  View surface
                  <ArrowRight className="ml-1 h-3 w-3 sm:h-4 sm:w-4" />
                </Link>
              </Surface>
            );
          })}
      </div>
    </PageSection>
  );
};

export default Docs;
