import type { ComponentProps, ReactNode } from 'react';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type LabeledInputProps = ComponentProps<typeof Input> & { id: string; label: ReactNode };

export function LabeledInput({ id, label, ...props }: LabeledInputProps) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} {...props} />
    </Field>
  );
}

export function StatusNotice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Alert role="status">
      {icon}
      <AlertTitle>{children}</AlertTitle>
    </Alert>
  );
}
