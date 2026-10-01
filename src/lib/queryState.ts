export type ListQueryStatus = 'idle' | 'loading' | 'error' | 'empty' | 'ready';

type ListQueryLike = {
  data: readonly unknown[] | undefined;
  isError: boolean;
  isLoading: boolean;
};

export const getListQueryStatus = (query: ListQueryLike): ListQueryStatus => {
  if (query.data !== undefined) return query.data.length === 0 ? 'empty' : 'ready';
  if (query.isLoading) return 'loading';
  if (query.isError) return 'error';
  return 'idle';
};

export const hasListRefreshError = (query: ListQueryLike): boolean =>
  query.isError && query.data !== undefined;
