import { useState } from 'react';
import { toast } from 'sonner';

import { usePageVisit } from '@/hooks/usePageVisit';
import { FORM_INCOMPLETE_CODE } from '@/lib/schemas/formValidation';
import type { PageVisit } from '@/lib/navigation/pageVisit';
import type { FormAnswer } from '@/types/checklist';

import type { RunExecutionActionResult } from './runExecutionResult';

export type FormAttempt = { count: number; itemId: string };

type RunPageSaves = {
  completeRun: () => Promise<RunExecutionActionResult>;
  saveFormAnswer: (itemId: string, fieldId: string, answer: FormAnswer | undefined) => Promise<RunExecutionActionResult>;
  saveItemNotes: (itemId: string, notes: string) => Promise<RunExecutionActionResult>;
  toggleItem: (itemId: string, isCompleted: boolean) => Promise<RunExecutionActionResult>;
  toggleSubItem: (
    itemId: string,
    contentIndex: number,
    subItemIndex: number,
    isCompleted: boolean,
  ) => Promise<RunExecutionActionResult>;
};

export const useRunPageActions = (saves: RunPageSaves, onCompleted?: (visit: PageVisit) => void) => {
  const beginVisit = usePageVisit();
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isCompletingRun, setIsCompletingRun] = useState(false);
  const [formAttempt, setFormAttempt] = useState<FormAttempt | null>(null);

  const afterToggle = (result: RunExecutionActionResult, itemId: string) => {
    if (result.kind === 'error' && result.code === FORM_INCOMPLETE_CODE) {
      setFormAttempt((previous) => ({ count: (previous?.count ?? 0) + 1, itemId }));
    }

    if (result.kind === 'ok') {
      if (result.shouldPromptComplete) {
        setIsCompleteDialogOpen(true);
      }
      return;
    }

    if (result.kind === 'error') {
      toast.error(result.message || 'Unable to save your progress. Please try again.');
    }
  };

  const completeRun = async () => {
    const visit = beginVisit();
    setIsCompletingRun(true);
    const result = await saves.completeRun().finally(() => setIsCompletingRun(false));

    if (result.kind === 'ok') {
      setIsCompleteDialogOpen(false);
      toast.success('Run completed');
      onCompleted?.(visit);
      return;
    }

    if (result.kind === 'error') {
      toast.error(result.message || 'Unable to save completion. Please try again.');
    }
  };

  return {
    completeDialog: {
      completing: isCompletingRun,
      onComplete: () => void completeRun(),
      onOpenChange: setIsCompleteDialogOpen,
      open: isCompleteDialogOpen,
    },
    formAttempt,
    openCompleteDialog: () => setIsCompleteDialogOpen(true),
    saveFormAnswer: (itemId: string, fieldId: string, answer: FormAnswer | undefined) =>
      void saves.saveFormAnswer(itemId, fieldId, answer).then((result) => {
        if (result.kind === 'error') toast.error(result.message);
      }),
    saveNotes: async (itemId: string, notes: string) => {
      const result = await saves.saveItemNotes(itemId, notes);
      if (result.kind === 'ok') return true;
      if (result.kind === 'ignored') return false;
      toast.error(result.kind === 'error' ? result.message : 'Unable to save task notes.');
      return false;
    },
    toggleSubItem: (itemId: string, contentIndex: number, subItemIndex: number, isCompleted: boolean) =>
      void saves.toggleSubItem(itemId, contentIndex, subItemIndex, isCompleted).then((result) => afterToggle(result, itemId)),
    toggleTask: (itemId: string, isCompleted: boolean) =>
      void saves.toggleItem(itemId, isCompleted).then((result) => afterToggle(result, itemId)),
  };
};
