import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

describe('SelectTrigger', () => {
  it("holds no text besides the selected value, not even the ▼ that Base UI's Select.Icon renders without children", () => {
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
