import { LayoutGrid, List } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ViewMode } from '@/lib/viewModePreference';

type ViewModeToggleProps = {
  onChange: (mode: ViewMode) => void;
  value: ViewMode;
};

export function ViewModeToggle({ onChange, value }: ViewModeToggleProps) {
  return (
    <div className="flex shrink-0 items-center gap-1" data-slot="view-mode-toggle">
      <Button
        aria-label="Show templates in grid view"
        aria-pressed={value === 'grid'}
        type="button"
        variant={value === 'grid' ? 'secondary' : 'ghost'}
        size="icon"
        onClick={() => onChange('grid')}
      >
        <LayoutGrid />
      </Button>
      <Button
        aria-label="Show templates in list view"
        aria-pressed={value === 'list'}
        type="button"
        variant={value === 'list' ? 'secondary' : 'ghost'}
        size="icon"
        onClick={() => onChange('list')}
      >
        <List />
      </Button>
    </div>
  );
}
