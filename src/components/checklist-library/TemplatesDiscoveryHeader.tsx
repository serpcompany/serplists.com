import React from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  buildConsoleTemplateCreatePath,
  buildConsoleTemplatesPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import { APP_BRAND_NAME } from '@/lib/brand';

type TemplatesDiscoveryHeaderProps = {
  onSearchChange?: (query: string) => void;
  showSearch?: boolean;
  searchQuery?: string;
};

export function TemplatesDiscoveryHeader({
  onSearchChange,
  showSearch = true,
  searchQuery = '',
}: TemplatesDiscoveryHeaderProps): JSX.Element {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:justify-between sm:py-0">
        <Link
          to={buildPublicTemplatesPath()}
          className="flex shrink-0 items-center gap-2"
        >
          <LayoutGrid className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {APP_BRAND_NAME}
          </span>
        </Link>

        {showSearch ? (
          <div className="relative order-3 w-full sm:order-none sm:mx-4 sm:max-w-md sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search templates"
              className="w-full pl-9"
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder="Search templates..."
              readOnly={!onSearchChange}
              type="search"
              value={searchQuery}
            />
          </div>
        ) : (
          <div className="hidden flex-1 sm:block" aria-hidden="true" />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link to={buildConsoleTemplatesPath()}>My Library</Link>
          </Button>
          <Button asChild size="sm">
            <Link to={buildConsoleTemplateCreatePath()}>Create Template</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
