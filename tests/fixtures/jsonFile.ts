export const jsonFile = (value: unknown, name: string) =>
  new File([JSON.stringify(value)], name, { type: 'application/json' });

export const TITLE_REQUIRED_RULE = {
  id: 'rule-1',
  type: 'required-field',
  path: 'sections[].items[].title',
  value: 'Every item needs a title',
  severity: 'error',
};
