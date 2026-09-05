import { useMemo, useState, type ElementType } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import {
  buildDiscoveryCategories,
  filterAndSortTemplates,
  type DiscoverySort,
} from '@/components/checklist-library/discovery-utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import NotFound from '@/pages/NotFound';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import { SEOHead } from '@/components/shared/SEOHead';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useViewModePreference } from '@/hooks/useViewModePreference';
import { PUBLIC_CATEGORY_REGISTRY } from '@/data/publicCategories';

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

const sortLabels: Record<string, string> = {
  name: 'Name A-Z',
  popular: 'Most Popular',
  recent: 'Most Recent',
  trending: 'Trending',
};
const CATEGORY_BASE_URL = 'https://serplists.com/categories';
const SEO_IMAGE_URL = 'https://serplists.com/placeholder.svg';

const CategoryDetail = () => {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<DiscoverySort | 'name'>('popular');
  const [viewMode, setViewMode] = useViewModePreference({
    surface: 'category-templates',
    userId: user?.id,
  });
  const { allCategories, templates } = useTemplateLibrary();

  const slug = categorySlug ?? 'business';
  const categories = useMemo(
    () => buildDiscoveryCategories(templates, allCategories),
    [allCategories, templates],
  );
  const categoryStats = categories.find((item) => item.slug === slug);
  const isKnownCategory = Boolean(categoryStats || categoryData[slug]);
  const canonicalCategory = PUBLIC_CATEGORY_REGISTRY.find((item) => item.slug === slug);
  const category = canonicalCategory ? {
    ...categoryData[slug],
    ...canonicalCategory,
  } : categoryData[slug] ?? {
    name: categoryStats?.name ?? 'Category',
    description: categoryStats
      ? `Templates filed under ${categoryStats.name}.`
      : 'Templates for this workflow area.',
    icon: FileText,
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
  };
  const Icon = category.icon;
  const categoryTemplateCount = categoryStats?.count ?? 0;

  const filteredTemplates = useMemo(() => {
    const base =
      sortBy === 'name'
        ? filterAndSortTemplates(templates, {
            categorySlug: slug,
            searchQuery,
            sortBy: 'popular',
          })
        : filterAndSortTemplates(templates, {
            categorySlug: slug,
            searchQuery,
            sortBy,
          });

    return sortBy === 'name'
      ? [...base].sort((left, right) => left.title.localeCompare(right.title))
      : base;
  }, [searchQuery, slug, sortBy, templates]);

  if (!isKnownCategory) {
    return <NotFound />;
  }

  return (
    <div className="bg-background">
      <SEOHead
        title={`${category.name} Templates`}
        description={`${categoryTemplateCount} templates for ${category.name}. ${category.description}`}
        keywords={[category.name, 'checklist templates', 'workflow templates']}
        image={SEO_IMAGE_URL}
        url={`${CATEGORY_BASE_URL}/${encodeURIComponent(slug)}`}
      />
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
              {categoryTemplateCount} templates
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
              <Select value={sortBy} onValueChange={(value) => {
                if (value === 'popular' || value === 'recent' || value === 'trending' || value === 'name') setSortBy(value);
              }}>
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
                  aria-label="Show templates in grid view"
                  aria-pressed={viewMode === 'grid'}
                  className={`inline-flex h-9 w-9 items-center justify-center ${viewMode === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
                  onClick={() => setViewMode('grid')}
                  type="button"
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  aria-label="Show templates in list view"
                  aria-pressed={viewMode === 'list'}
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
          categories={categories}
          currentCategorySlug={slug}
        />
      </main>
    </div>
  );
};

export default CategoryDetail;
