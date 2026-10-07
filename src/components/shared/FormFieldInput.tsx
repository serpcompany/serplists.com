import type { ChangeEvent, JSX, ReactNode } from 'react';
import { useId, useRef, useState } from 'react';

import { FormFileControl } from '@/components/shared/FormFileControl';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { sameFormAnswer } from '@/features/run-execution/runFormAnswers';
import { MAX_FORM_TEXT_ANSWER_LENGTH } from '@/lib/schemas/formFields';
import { findFormFieldProblem, formFieldProblemMessage } from '@/lib/schemas/formValidation';
import type { ChecklistFormField, FormAnswer } from '@/types/checklist';

import { answerFromText, answerText, canSaveAnswer, isTypedFormFieldKind, typedInputProps } from './formAnswerInput';
import { formFieldTitle, formOptionTitle } from './formFieldText';

type LocalAnswer = { answer: FormAnswer | undefined; text?: string | undefined };

interface FormFieldInputProps {
  check: number;
  field: ChecklistFormField;
  index: number;
  onAnswerChange: (answer: FormAnswer | undefined) => void;
  uploadLoginPath?: string | undefined;
}

const chosenOptionIds = (answer: FormAnswer | undefined): string[] => (Array.isArray(answer) ? answer : []);

export function FormFieldInput({ check, field, index, onAnswerChange, uploadLoginPath }: FormFieldInputProps): JSX.Element {
  const baseId = useId();
  const [touched, setTouched] = useState(false);
  const [local, setLocal] = useState<LocalAnswer | null>(null);
  const sent = useRef<{ answer: FormAnswer | undefined } | null>(null);
  const answer = local ? local.answer : field.answer;
  const reason = findFormFieldProblem({ ...field, answer });
  const problem = reason && (touched || check > 0) ? formFieldProblemMessage(field, reason) : null;
  const ids = {
    control: `${baseId}-control`,
    help: `${baseId}-help`,
    problem: `${baseId}-problem`,
    title: `${baseId}-title`,
  };
  const describedBy = [field.description ? ids.help : '', problem ? ids.problem : ''].filter(Boolean).join(' ') || undefined;
  const problemMark = problem ? 'true' : undefined;
  const inputMarks = {
    'aria-describedby': describedBy,
    'aria-invalid': problem ? true : undefined,
    'aria-required': field.required ? true : undefined,
    'data-form-problem': problemMark,
    id: ids.control,
  };
  const title = formFieldTitle(field, index);
  const options = field.options ?? [];

  const commit = (next: FormAnswer | undefined) => {
    setTouched(true);
    if (!canSaveAnswer(field.kind, next)) return;
    const unchanged = sameFormAnswer(next, field.answer) && (!sent.current || sameFormAnswer(next, sent.current.answer));
    if (unchanged) return;
    sent.current = { answer: next };
    onAnswerChange(next);
  };
  const choose = (next: FormAnswer | undefined) => {
    setLocal({ answer: next });
    commit(next);
  };

  const required = field.required ? <Badge variant="outline">Required</Badge> : null;
  const help = field.description ? (
    <FieldDescription className="whitespace-pre-line" id={ids.help}>{field.description}</FieldDescription>
  ) : null;
  const message = problem ? (
    <FieldDescription className="text-destructive" id={ids.problem}>{problem}</FieldDescription>
  ) : null;

  if (field.kind === 'multiSelect') {
    const chosen = chosenOptionIds(answer);
    const toggle = (optionId: string, checked: boolean) => {
      const next = options.map((option) => option.id).filter((id) => (id === optionId ? checked : chosen.includes(id)));
      choose(next.length > 0 ? next : undefined);
    };
    return (
      <FieldSet aria-describedby={describedBy} className="gap-2">
        <FieldLegend className="mb-0 flex flex-wrap items-center gap-2" variant="label">
          {title}
          {required}
        </FieldLegend>
        {help}
        {options.map((option, optionIndex) => {
          const optionId = `${baseId}-option-${optionIndex}`;
          return (
            <Field key={option.id} orientation="horizontal">
              <Checkbox
                aria-invalid={problem ? true : undefined}
                checked={chosen.includes(option.id)}
                data-form-problem={optionIndex === 0 ? problemMark : undefined}
                id={optionId}
                nativeButton
                onCheckedChange={(checked) => toggle(option.id, checked)}
                render={<button type="button" />}
              />
              <FieldLabel htmlFor={optionId}>{formOptionTitle(option, optionIndex)}</FieldLabel>
            </Field>
          );
        })}
        {message}
      </FieldSet>
    );
  }

  if (field.kind === 'checkbox') {
    return (
      <Field>
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox
            {...inputMarks}
            checked={answer === true}
            nativeButton
            onCheckedChange={(checked) => choose(checked ? true : undefined)}
            render={<button type="button" />}
          />
          <FieldLabel htmlFor={ids.control}>{title}</FieldLabel>
          {required}
        </div>
        {help}
        {message}
      </Field>
    );
  }

  const renderControl = (): ReactNode => {
    if (isTypedFormFieldKind(field.kind)) {
      const kind = field.kind;
      const typed = {
        ...inputMarks,
        onBlur: () => commit(answer),
        onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          setLocal({ answer: answerFromText(kind, event.target.value), text: event.target.value }),
        value: local?.text ?? answerText(field.answer),
      };
      return kind === 'longText' ? (
        <Textarea {...typed} maxLength={MAX_FORM_TEXT_ANSWER_LENGTH.longText} rows={4} />
      ) : (
        <Input {...typed} {...typedInputProps(field)} />
      );
    }

    if (field.kind === 'select') {
      return (
        <Select
          items={Object.fromEntries(options.map((option, optionIndex) => [option.id, formOptionTitle(option, optionIndex)]))}
          onOpenChange={(open) => {
            if (!open) setTouched(true);
          }}
          onValueChange={(next) => {
            if (typeof next === 'string') choose(next);
          }}
          value={typeof answer === 'string' && options.some((option) => option.id === answer) ? answer : null}
        >
          <SelectTrigger className="w-full" {...inputMarks}>
            <SelectValue placeholder="Choose an option" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option, optionIndex) => (
              <SelectItem key={option.id} value={option.id}>
                {formOptionTitle(option, optionIndex)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <FormFileControl
        answer={answer}
        describedBy={describedBy}
        id={ids.control}
        labelledBy={ids.title}
        onChange={choose}
        problem={Boolean(problem)}
        uploadLoginPath={uploadLoginPath}
      />
    );
  };

  return (
    <Field>
      <div className="flex flex-wrap items-center gap-2">
        {field.kind === 'file' ? (
          <FieldTitle id={ids.title}>{title}</FieldTitle>
        ) : (
          <FieldLabel htmlFor={ids.control}>{title}</FieldLabel>
        )}
        {required}
      </div>
      {help}
      {renderControl()}
      {message}
    </Field>
  );
}
