import type { InputHTMLAttributes } from 'react';

import { MAX_FORM_TEXT_ANSWER_LENGTH } from '@/lib/schemas/formFields';
import type { ChecklistFormField, FormAnswer, FormFieldKind } from '@/types/checklist';

type TypedFormFieldKind = 'text' | 'longText' | 'url' | 'email' | 'number' | 'date';

const TYPED_KINDS = new Set<FormFieldKind>(['text', 'longText', 'url', 'email', 'number', 'date']);

export const isTypedFormFieldKind = (kind: FormFieldKind): kind is TypedFormFieldKind => TYPED_KINDS.has(kind);

export const answerText = (answer: FormAnswer | undefined): string => {
  if (typeof answer === 'string') return answer;
  return typeof answer === 'number' ? String(answer) : '';
};

export const answerFromText = (kind: TypedFormFieldKind, text: string): FormAnswer | undefined => {
  if (text.trim() === '') return undefined;
  if (kind !== 'number') return text;
  const value = Number(text);
  return Number.isFinite(value) ? value : text;
};

export const canSaveAnswer = (kind: FormFieldKind, answer: FormAnswer | undefined): boolean =>
  kind !== 'number' || answer === undefined || typeof answer === 'number';

export function typedInputProps(field: ChecklistFormField): InputHTMLAttributes<HTMLInputElement> {
  switch (field.kind) {
    case 'url':
      return {
        autoCapitalize: 'none',
        inputMode: 'url',
        maxLength: MAX_FORM_TEXT_ANSWER_LENGTH.url,
        placeholder: 'https://',
        spellCheck: false,
        type: 'url',
      };
    case 'email':
      return {
        autoCapitalize: 'none',
        inputMode: 'email',
        maxLength: MAX_FORM_TEXT_ANSWER_LENGTH.email,
        spellCheck: false,
        type: 'email',
      };
    case 'number':
      return { inputMode: 'decimal', max: field.max, min: field.min, step: 'any', type: 'number' };
    case 'date':
      return { type: 'date' };
    default:
      return { maxLength: MAX_FORM_TEXT_ANSWER_LENGTH.text, type: 'text' };
  }
}
