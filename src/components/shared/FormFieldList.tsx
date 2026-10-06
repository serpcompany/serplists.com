import { Badge } from '@/components/ui/badge';
import { FORM_FIELD_KIND_LABELS } from '@/lib/schemas/formFields';
import { formatFormAnswer, isFormAnswerEmpty } from '@/lib/schemas/formValidation';
import { safeUrl } from '@/lib/utils/safeUrl';
import type { ChecklistFormField } from '@/types/checklist';

import { formFieldTitle, formOptionTitle } from './formFieldText';

function AnswerLine({ field }: { field: ChecklistFormField }) {
  const { answer } = field;
  if (isFormAnswerEmpty(answer)) return null;
  const fileUrl = answer && typeof answer === 'object' && !Array.isArray(answer) ? safeUrl(answer.url) : undefined;

  return (
    <p className="wrap-break-word whitespace-pre-line">
      <span className="text-muted-foreground">Answer: </span>
      {fileUrl ? (
        <a className="text-primary underline-offset-4 hover:underline" href={fileUrl} rel="noopener noreferrer" target="_blank">
          {formatFormAnswer(field)}
        </a>
      ) : (
        formatFormAnswer(field)
      )}
    </p>
  );
}

export function FormFieldList({ fields }: { fields: ChecklistFormField[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {fields.map((field, index) => (
        <li className="flex flex-col gap-1.5 rounded-md border border-border/70 p-3 text-sm" key={field.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium wrap-break-word">{formFieldTitle(field, index)}</span>
            <Badge variant="secondary">{FORM_FIELD_KIND_LABELS[field.kind]}</Badge>
            {field.required ? <Badge variant="outline">Required</Badge> : null}
          </div>
          {field.description ? (
            <p className="whitespace-pre-line text-muted-foreground wrap-break-word">{field.description}</p>
          ) : null}
          {field.options?.length ? (
            <ul className="list-disc pl-5 text-muted-foreground">
              {field.options.map((option, optionIndex) => (
                <li className="wrap-break-word" key={option.id}>
                  {formOptionTitle(option, optionIndex)}
                </li>
              ))}
            </ul>
          ) : null}
          <AnswerLine field={field} />
        </li>
      ))}
    </ul>
  );
}
