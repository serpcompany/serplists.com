import { describe, expect, expectTypeOf, it } from 'vitest';

import type { AuditEventInput, TemplateVersionInput } from '@functions/api/utils/audit';
import {
  AUDIT_ACTIONS,
  TEMPLATE_VERSION_ACTIONS,
  type AuditAction,
  type TemplateVersionAction,
} from '@/lib/schemas/auditActions';

describe('AUDIT_ACTIONS, which every history view has a label for', () => {
  it('lists every audit action the API writes, since every audit row is built from an AuditEventInput, whose action pnpm run typecheck holds to AUDIT_ACTIONS', () => {
    expectTypeOf<AuditEventInput['action']>().toEqualTypeOf<AuditAction>();
    expectTypeOf<AuditAction>().toEqualTypeOf<(typeof AUDIT_ACTIONS)[number]>();
  });

  it('lists every template version change summary', () => {
    expectTypeOf<TemplateVersionInput['changeSummary']>().toEqualTypeOf<TemplateVersionAction | undefined>();
    expectTypeOf<TemplateVersionAction>().toEqualTypeOf<(typeof TEMPLATE_VERSION_ACTIONS)[number]>();
  });

  it('has no duplicates and keeps the stored resource.verb shape', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
    for (const action of AUDIT_ACTIONS) {
      expect(action).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });
});
