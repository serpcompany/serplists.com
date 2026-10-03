import { RUNS_TEMPLATE_FILTER_PARAM } from '@/lib/consoleRoutes';

type UrlParts = { pathname: string; search: string; hash: string };

export const readRunsTemplateFilter = (searchParams: URLSearchParams): string | null =>
  searchParams.get(RUNS_TEMPLATE_FILTER_PARAM)?.trim() || null;

export const buildRunsTemplateFilterUrl = ({ pathname, search, hash }: UrlParts, templateId: string | null): string => {
  const params = new URLSearchParams(search);
  if (templateId) {
    params.set(RUNS_TEMPLATE_FILTER_PARAM, templateId);
  } else {
    params.delete(RUNS_TEMPLATE_FILTER_PARAM);
  }
  const nextSearch = params.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ''}${hash}`;
};
