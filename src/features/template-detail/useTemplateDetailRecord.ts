import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { ChecklistTemplate } from '@/types/checklist';

import { loadTemplateDetailData } from './loadTemplateDetail';
import {
  buildTemplateDetailQueryOptions,
  getTemplateDetailQueryKey,
} from './templateDetailQuery';

export type TemplateUpdater = (
  current: ChecklistTemplate | null,
) => ChecklistTemplate | null;

type TemplateDetailRecordOptions = {
  identifier?: string;
  mode: 'private' | 'public';
  ownerUsername?: string;
  userId?: string;
};

export type TemplateDetailRecord = {
  loadError: string | null;
  loading: boolean;
  notFound: boolean;
  reload: () => void;
  template: ChecklistTemplate | null;
  // Applies a change the server has already accepted to the loaded template.
  updateTemplate: (update: TemplateUpdater) => void;
};

// The public page loads the server copy on every visit and keeps it in local state.
const usePublicTemplateRecord = (
  options: TemplateDetailRecordOptions,
  enabled: boolean,
): TemplateDetailRecord => {
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped by reload(); the only extra effect dependency, so a retry never loops.
  const [reloadKey, setReloadKey] = useState(0);
  const { identifier, ownerUsername } = options;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const loadTemplate = async () => {
      setLoading(true);
      setNotFound(false);
      setLoadError(null);

      const result = await loadTemplateDetailData({
        identifier,
        mode: 'public',
        ownerUsername,
      });

      if (cancelled) {
        return;
      }

      setTemplate(result.kind === 'ok' ? result.template : null);
      setNotFound(result.kind === 'not_found');
      setLoadError(result.kind === 'error' ? result.message : null);
      setLoading(false);
    };

    void loadTemplate();

    return () => {
      cancelled = true;
    };
  }, [enabled, identifier, ownerUsername, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { loadError, loading, notFound, reload, template, updateTemplate: setTemplate };
};

// The private page loads its own template by id, never a list (docs/design-docs/d1-cost.md).
const usePrivateTemplateRecord = (
  options: TemplateDetailRecordOptions,
  enabled: boolean,
): TemplateDetailRecord => {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...buildTemplateDetailQueryOptions({
      identifier: options.identifier,
      userId: options.userId,
    }),
    enabled,
  });
  const queryKey = getTemplateDetailQueryKey(options.identifier, options.userId);
  const { refetch } = query;
  // undefined: no answer yet. null: the server says the template is gone.
  const hasAnswer = query.data !== undefined;

  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    loadError:
      !hasAnswer && query.isError && !query.isFetching ? query.error.message : null,
    loading: !hasAnswer && (query.isPending || query.isFetching),
    notFound: query.data === null,
    reload,
    template: query.data ?? null,
    updateTemplate: (update) =>
      queryClient.setQueryData<ChecklistTemplate | null>(queryKey, (current) =>
        current === undefined ? current : update(current),
      ),
  };
};

export const useTemplateDetailRecord = (
  options: TemplateDetailRecordOptions,
): TemplateDetailRecord => {
  const isPrivate = options.mode === 'private';
  const publicRecord = usePublicTemplateRecord(options, !isPrivate);
  const privateRecord = usePrivateTemplateRecord(options, isPrivate);

  return isPrivate ? privateRecord : publicRecord;
};
