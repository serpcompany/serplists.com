import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageContainer } from '@/components/layout/page-shell';
import {
  buildConsoleTemplateCreatePath,
  buildConsoleTemplatesPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';

const SEARCH_PARAM = 'q';

export function TemplatesDiscoveryHeader(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get(SEARCH_PARAM) ?? '';

  const updateSearchQuery = (value: string) => {
    const nextParams = new URLSearchParams(searchParams);

    if (value.trim()) {
      nextParams.set(SEARCH_PARAM, value);
    } else {
      nextParams.delete(SEARCH_PARAM);
    }

    setSearchParams(nextParams, { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <PageContainer
        className="flex h-14 items-center justify-between gap-4"
        width="shell"
      >
        <Link to={buildPublicTemplatesPath()} className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-card text-foreground">
            <LayoutGrid className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Checklist
          </span>
        </Link>

        <div className="hidden flex-1 px-2 md:block">
          <div className="relative mx-auto max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search templates"
              className="h-10 border-border bg-secondary/30 pl-9 text-sm shadow-none placeholder:text-muted-foreground/80"
              onChange={(event) => updateSearchQuery(event.target.value)}
              placeholder="Search templates..."
              value={searchQuery}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            className="hidden text-sm text-muted-foreground md:inline-flex"
          >
            <Link to={buildConsoleTemplatesPath()}>My Library</Link>
          </Button>
          <Button
            className="h-10 rounded-md px-4 text-sm"
            onClick={() => navigate(buildConsoleTemplateCreatePath())}
          >
            Create Template
          </Button>
        </div>
      </PageContainer>

      <div className="border-t border-border/60 px-4 py-3 md:hidden">
        <div className="relative mx-auto max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search templates"
            className="h-10 border-border bg-secondary/30 pl-9 text-sm shadow-none placeholder:text-muted-foreground/80"
            onChange={(event) => updateSearchQuery(event.target.value)}
            placeholder="Search templates..."
            value={searchQuery}
          />
        </div>
      </div>
    </header>
  );
}
