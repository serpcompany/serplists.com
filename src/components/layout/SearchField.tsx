import type { ComponentProps } from 'react';
import { Search } from 'lucide-react';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

type SearchFieldProps = ComponentProps<typeof InputGroupInput> & {
  groupClassName?: string;
};

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
