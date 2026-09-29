import type { ComponentProps } from 'react';
import { Search } from 'lucide-react';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

type SearchFieldProps = ComponentProps<typeof InputGroupInput> & {
  // Classes for the field's frame, not the input.
  groupClassName?: string;
};

// A search input with a leading search icon (the shadcn InputGroup). The page owns the value.
export function SearchField({ groupClassName, ...props }: SearchFieldProps) {
  return (
    <InputGroup className={cn('h-10 bg-background', groupClassName)} data-slot="search-field">
      <InputGroupInput {...props} />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
    </InputGroup>
  );
}
