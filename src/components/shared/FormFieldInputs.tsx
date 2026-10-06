import type { JSX } from 'react';
import { useEffect, useRef } from 'react';

import { FormFieldInput } from '@/components/shared/FormFieldInput';
import type { ChecklistFormField, FormAnswer } from '@/types/checklist';

interface FormFieldInputsProps {
  check: number;
  fields: ChecklistFormField[];
  focusOnCheck: boolean;
  onAnswerChange: (fieldId: string, answer: FormAnswer | undefined) => void;
  uploadLoginPath?: string | undefined;
}

export function FormFieldInputs({
  check,
  fields,
  focusOnCheck,
  onAnswerChange,
  uploadLoginPath,
}: FormFieldInputsProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const handledCheck = useRef(check);

  useEffect(() => {
    if (check === handledCheck.current) return;
    handledCheck.current = check;
    const firstProblem = focusOnCheck
      ? containerRef.current?.querySelector<HTMLElement>('[data-form-problem="true"]')
      : null;
    if (!firstProblem) return;
    firstProblem.focus({ preventScroll: true });
    firstProblem.scrollIntoView({ block: 'center' });
  }, [check, focusOnCheck]);

  return (
    <div className="flex flex-col gap-5" ref={containerRef}>
      {fields.map((field, index) => (
        <FormFieldInput
          check={check}
          field={field}
          index={index}
          key={field.id}
          onAnswerChange={(answer) => onAnswerChange(field.id, answer)}
          uploadLoginPath={uploadLoginPath}
        />
      ))}
    </div>
  );
}
