export const matchMediaWhere = (matches: (query: string) => boolean) => (query: string) => ({
  matches: matches(query),
  media: query,
  addEventListener() {},
  removeEventListener() {},
});
