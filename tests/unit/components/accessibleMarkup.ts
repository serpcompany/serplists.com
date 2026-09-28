// Unit tests render with renderToStaticMarkup in node (no DOM, no testing-library), so
// these helpers read accessible names from the markup. A control is named by
// aria-labelledby, aria-label or a <label for> pointing at its id, and a button also by
// its text. A placeholder is deliberately not a name: it disappears once the field has a
// value, and 'my-template-slug' reads as a value, not a label.

export type MarkupElement = {
  tag: string;
  attrs: Record<string, string>;
  text: string;
};

const ATTRIBUTE = /([^\s=/>]+)(?:="([^"]*)")?/g;

const decode = (text: string): string =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const textOf = (inner: string): string => decode(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const parseAttributes = (source: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    attrs[match[1]] = decode(match[2] ?? '');
  }
  return attrs;
};

const collect = (html: string, pattern: RegExp, tag: (match: RegExpMatchArray) => string): MarkupElement[] =>
  [...html.matchAll(pattern)].map((match) => ({
    tag: tag(match),
    attrs: parseAttributes(match[2] ?? ''),
    text: textOf(match[3] ?? ''),
  }));

export const findLabels = (html: string): MarkupElement[] =>
  collect(html, /<(label)\b([^>]*)>([\s\S]*?)<\/label>/g, () => 'label');

const findButtons = (html: string): MarkupElement[] =>
  collect(html, /<(button)\b([^>]*)>([\s\S]*?)<\/button>/g, () => 'button');

const findFields = (html: string): MarkupElement[] =>
  collect(html, /<(input|textarea|select)\b([^>]*?)\/?>()/g, (match) => match[1]);

const isHidden = ({ attrs }: MarkupElement): boolean =>
  attrs['aria-hidden'] === 'true' ||
  attrs.type === 'hidden' ||
  'hidden' in attrs ||
  /(^|\s)hidden(\s|$)/.test(attrs.class ?? '');

// Elements a user can operate: fields, buttons, and whatever claims a widget role.
export const findControls = (html: string): MarkupElement[] =>
  [...findFields(html), ...findButtons(html)].filter((element) => !isHidden(element));

const textOfId = (html: string, id: string): string => {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<(\\w+)\\b[^>]*\\bid="${escaped}"[^>]*>([\\s\\S]*?)</\\1>`));
  return match ? textOf(match[2]) : '';
};

export const accessibleName = (html: string, element: MarkupElement): string => {
  const labelledBy = element.attrs['aria-labelledby'];
  if (labelledBy) {
    return labelledBy.split(/\s+/).map((id) => textOfId(html, id)).join(' ').trim();
  }
  if (element.attrs['aria-label']?.trim()) return element.attrs['aria-label'].trim();
  const id = element.attrs.id;
  const label = id ? findLabels(html).find((candidate) => candidate.attrs.for === id) : undefined;
  if (label?.text) return label.text;
  return element.tag === 'button' ? element.text : '';
};

export const accessibleDescription = (html: string, element: MarkupElement): string =>
  (element.attrs['aria-describedby'] ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => textOfId(html, id))
    .join(' ')
    .trim();

const describe = (element: MarkupElement): string =>
  `<${element.tag}${Object.entries(element.attrs)
    .filter(([key]) => ['id', 'type', 'role', 'placeholder'].includes(key))
    .map(([key, value]) => ` ${key}="${value}"`)
    .join('')}>`;

export const findUnnamedControls = (html: string): string[] =>
  findControls(html)
    .filter((element) => !accessibleName(html, element))
    .map(describe);

// Labels that name nothing: no for= at all, or a for= that matches no id or more than one.
export const findDanglingLabels = (html: string): string[] =>
  findLabels(html)
    .filter((label) => {
      const target = label.attrs.for;
      if (!target) return true;
      return [...html.matchAll(/\bid="([^"]*)"/g)].filter((match) => match[1] === target).length !== 1;
    })
    .map((label) => label.text);

// Like testing-library's getByLabelText / getByRole(…, { name }).
export const getByAccessibleName = (html: string, name: string): MarkupElement | undefined =>
  findControls(html).find((element) => accessibleName(html, element) === name);

export const findDuplicateIds = (html: string): string[] => {
  const ids = [...html.matchAll(/\bid="([^"]*)"/g)].map((match) => match[1]);
  return ids.filter((id, index) => ids.indexOf(id) !== index);
};
