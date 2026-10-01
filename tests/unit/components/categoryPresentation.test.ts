import { FileText } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { getCategoryIcon } from '@/components/checklist-library/categoryPresentation';

describe('getCategoryIcon', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
    'gives the slug %s the default icon, never an Object.prototype member, since slugs come from template categories and URLs',
    (slug) => {
      expect(getCategoryIcon(slug)).toBe(FileText);
    },
  );
});
