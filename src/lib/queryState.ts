// What a list backed by a React Query query should render. React Query v5 reports a
// failed first load as isLoading false with data undefined, so a component that only
// checks isLoading shows its empty state for an error. Branch on this status instead.
export type ListQueryStatus = 'idle' | 'loading' | 'error' | 'empty' | 'ready';

type ListQueryLike = {
  data: readonly unknown[] | undefined;
  isError: boolean;
  isLoading: boolean;
};

export const getListQueryStatus = (query: ListQueryLike): ListQueryStatus => {
  // A failed background refresh keeps the last loaded data: keep showing it.
  if (query.data !== undefined) return query.data.length === 0 ? 'empty' : 'ready';
  if (query.isLoading) return 'loading';
  if (query.isError) return 'error';
  // Disabled, or a first load that was cancelled: nothing to show yet.
  return 'idle';
};

// The last refresh failed but earlier data is still shown.
export const hasListRefreshError = (query: ListQueryLike): boolean =>
  query.isError && query.data !== undefined;
