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
  updateTemplate: (update: TemplateUpdater) => void;
};

const usePublicTemplateRecord = (
  options: TemplateDetailRecordOptions,
  enabled: boolean,
): TemplateDetailRecord => {
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const hasTemplate = Boolean(query.data);
  const isGone = query.data === null && !query.isFetching && !query.isError;

  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    loadError:
      !hasTemplate && query.isError && !query.isFetching ? query.error.message : null,
    loading: !hasTemplate && !isGone && (query.isPending || query.isFetching),
    notFound: isGone,
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
