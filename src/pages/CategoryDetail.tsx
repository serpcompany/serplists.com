import { useMemo, useState, type ElementType } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  Code,
  FileText,
  Grid3X3,
  Heart,
  Layers,
  List,
  Paintbrush,
  Search,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

import { CategoryNavigation } from '@/components/checklist-library/CategoryNavigation';
import { SearchAndFilters } from '@/components/checklist-library/SearchAndFilters';
import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import { TemplatesDiscoveryHeader } from '@/components/checklist-library/TemplatesDiscoveryHeader';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildPublicTemplatesPath } from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

const categoryData: Record<
  string,
  {
    name: string;
    description: string;
    icon: ElementType;
    color: string;
    bgColor: string;
  }
> = {
  business: {
    name: 'Business & Operations',
    description: 'Templates for business processes, operations, and management',
    icon: Briefcase,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  engineering: {
    name: 'Engineering & Development',
    description:
      'Checklists for code reviews, deployments, and development workflows',
    icon: Code,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  design: {
    name: 'Design & Creative',
    description:
      'Templates for design processes, brand guidelines, and creative projects',
    icon: Paintbrush,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
  },
  marketing: {
    name: 'Marketing & Growth',
    description: 'Launch checklists, campaign templates, and growth strategies',
    icon: TrendingUp,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  hr: {
    name: 'HR & People',
    description: 'Onboarding, offboarding, and people management templates',
    icon: Users,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
  },
  personal: {
    name: 'Personal & Lifestyle',
    description:
      'Personal productivity, wellness, and life management checklists',
    icon: Heart,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
  },
  productivity: {
    name: 'Productivity',
    description: 'Task management, time tracking, and workflow optimization',
    icon: Zap,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
  },
  'project-management': {
    name: 'Project Management',
    description:
      'Project planning, milestones, and team coordination templates',
    icon: Layers,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
  },
  compliance: {
    name: 'Compliance & Legal',
    description:
      'Regulatory compliance, audits, and legal process checklists',
    icon: FileText,
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
  },
};

type CategoryTemplate = ChecklistTemplate & {
  href?: string;
};

const buildSections = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `section-${index + 1}`,
    title: `Section ${index + 1}`,
    items: [],
  }));

const getTemplatesForCategory = (slug: string): CategoryTemplate[] => [
  {
    id: '1',
    title: 'Weekly Team Standup',
    description:
      'A structured approach to running efficient weekly team meetings',
    type: 'checklist',
    sections: buildSections(3),
    userId: 'user-1',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-02-20T14:30:00Z',
    isPublic: true,
    categories: [slug],
    tags: ['meetings', 'team', 'productivity'],
    href:
      slug === 'business'
        ? '/profile/designops/website-launch-checklist'
        : buildPublicTemplatesPath(),
  },
  {
    id: '2',
    title: 'Quarterly Review Process',
    description:
      'Comprehensive checklist for conducting quarterly business reviews',
    type: 'checklist',
    sections: buildSections(3),
    userId: 'user-2',
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-02-25T14:30:00Z',
    isPublic: true,
    categories: [slug],
    tags: ['quarterly', 'review', 'business'],
  },
  {
    id: '3',
    title: 'Project Kickoff',
    description: 'Everything you need to start a new project on the right foot',
    type: 'checklist',
    sections: buildSections(3),
    userId: 'user-3',
    createdAt: '2024-02-01T10:00:00Z',
    updatedAt: '2024-02-28T14:30:00Z',
    isPublic: true,
    categories: [slug],
    tags: ['project', 'kickoff', 'planning'],
  },
  {
    id: '4',
    title: 'Client Onboarding',
    description: 'Streamlined process for welcoming new clients',
    type: 'checklist',
    sections: buildSections(3),
    userId: 'user-1',
    createdAt: '2024-02-05T10:00:00Z',
    updatedAt: '2024-03-01T14:30:00Z',
    isPublic: true,
    categories: [slug],
    tags: ['client', 'onboarding', 'process'],
  },
  {
    id: '5',
    title: 'Monthly Reporting',
    description: 'Consistent framework for monthly performance reports',
    type: 'checklist',
    sections: buildSections(2),
    userId: 'user-2',
    createdAt: '2024-02-10T10:00:00Z',
    updatedAt: '2024-03-05T14:30:00Z',
    isPublic: true,
    categories: [slug],
    tags: ['reporting', 'monthly', 'metrics'],
  },
  {
    id: '6',
    title: 'Budget Planning',
    description: 'Comprehensive budget planning and allocation checklist',
    type: 'checklist',
    sections: buildSections(3),
    userId: 'user-3',
    createdAt: '2024-02-15T10:00:00Z',
    updatedAt: '2024-03-10T14:30:00Z',
    isPublic: true,
    categories: [slug],
    tags: ['budget', 'finance', 'planning'],
  },
];

const allCategories = Object.entries(categoryData).map(([slug, category]) => ({
  name: category.name,
  slug,
}));

const sortLabels: Record<string, string> = {
  name: 'Name A-Z',
  popular: 'Most Popular',
  recent: 'Most Recent',
  trending: 'Trending',
};

const CategoryDetail = () => {
  const navigate = useNavigate();
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const slug = categorySlug ?? 'business';
  const category = categoryData[slug] ?? categoryData.business;
  const Icon = category.icon;
  const templates = useMemo(() => getTemplatesForCategory(slug), [slug]);

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = normalizedQuery
      ? templates.filter(
          (template) =>
            template.title.toLowerCase().includes(normalizedQuery) ||
            template.description?.toLowerCase().includes(normalizedQuery),
        )
      : templates;

    return [...filtered].sort((left, right) => {
      if (sortBy === 'recent') {
        return (
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        );
      }

      if (sortBy === 'trending') {
        return right.title.localeCompare(left.title);
      }

      if (sortBy === 'name') {
        return left.title.localeCompare(right.title);
      }

      return 0;
    });
  }, [searchQuery, sortBy, templates]);

  const handleTemplateClick = (template: ChecklistTemplate) => {
    const destination = (template as CategoryTemplate).href ?? buildPublicTemplatesPath();
    navigate(destination);
  };

  return (
    <div className="min-h-screen bg-background">
      <TemplatesDiscoveryHeader />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            to="/categories"
          >
            <ArrowLeft className="h-4 w-4" />
            All Categories
          </Link>
        </div>

        <div className="mb-8 flex items-start gap-6">
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${category.bgColor}`}
          >
            <Icon className={`h-8 w-8 ${category.color}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {category.name}
            </h1>
            <p className="mt-1 text-muted-foreground">{category.description}</p>
            <Badge className="mt-3" variant="secondary">
              {templates.length} templates
            </Badge>
          </div>
        </div>

        <SearchAndFilters
          categories={[]}
          onCategoryChange={() => undefined}
          onSortChange={() => undefined}
          resultCount={filteredTemplates.length}
          searchSlot={
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="border-border bg-card pl-10"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search templates..."
                value={searchQuery}
              />
            </div>
          }
          selectedCategorySlug={null}
          sortBy="popular"
          trailingControls={
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40 border-border bg-card">
                  <SelectValue>{sortLabels[sortBy]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">Most Popular</SelectItem>
                  <SelectItem value="recent">Most Recent</SelectItem>
                  <SelectItem value="trending">Trending</SelectItem>
                  <SelectItem value="name">Name A-Z</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex rounded-lg border border-border bg-card">
                <button
                  className={`inline-flex h-9 w-9 items-center justify-center ${viewMode === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
                  onClick={() => setViewMode('grid')}
                  type="button"
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  className={`inline-flex h-9 w-9 items-center justify-center ${viewMode === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
                  onClick={() => setViewMode('list')}
                  type="button"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          }
        />

        {filteredTemplates.length > 0 ? (
          <div
            className={
              viewMode === 'grid'
                ? 'mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
                : 'mt-6 space-y-4'
            }
          >
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                layout={viewMode === 'list' ? 'horizontal' : 'vertical'}
                onTemplateClick={handleTemplateClick}
                template={template}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-border bg-card p-12 text-center">
            <p className="text-muted-foreground">
              No templates found matching your search.
            </p>
          </div>
        )}

        <CategoryNavigation
          categories={allCategories}
          currentCategorySlug={slug}
        />
      </main>
    </div>
  );
};

export default CategoryDetail;
