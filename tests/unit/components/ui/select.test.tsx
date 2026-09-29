import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Base UI's Select.Icon renders "▼" when it has no children, and the lucide icon it renders
// as put that text inside its <svg>: the trigger read "Name A-Z▼" instead of its value.
describe('SelectTrigger', () => {
  it('holds no text besides the selected value', () => {
    const markup = renderToStaticMarkup(
      <Select value="name">
        <SelectTrigger>
          <SelectValue>Name A-Z</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">Name A-Z</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(markup).toContain('<svg');
    expect(markup.replace(/<[^>]*>/g, '')).toBe('Name A-Z');
  });
});
