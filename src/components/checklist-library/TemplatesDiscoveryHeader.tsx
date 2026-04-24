import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to={buildPublicTemplatesPath()} className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold text-foreground">Checklist</span>
        </Link>

        <div className="relative mx-4 flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search templates"
            className="w-full pl-9"
            onChange={(event) => updateSearchQuery(event.target.value)}
            placeholder="Search templates..."
            type="search"
            value={searchQuery}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link to={buildConsoleTemplatesPath()}>My Library</Link>
          </Button>
          <Button onClick={() => navigate(buildConsoleTemplateCreatePath())} size="sm">
            Create Template
          </Button>
        </div>
      </div>
    </header>
  );
}
