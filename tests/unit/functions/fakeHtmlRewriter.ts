// A stand-in for the Workers HTMLRewriter, which Node does not have. It supports what the
// public page functions use: `tag` and `tag[attr="value"]` selectors on start tags, and
// getAttribute, setAttribute, setInnerContent, append and remove. Like the real one,
// setAttribute and text content are escaped unless `{ html: true }` is passed. Handlers
// run one after another in registration order (the real rewriter streams once).

type ContentOptions = { html?: boolean };

interface FakeElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  setInnerContent(content: string, options?: ContentOptions): void;
  append(content: string, options?: ContentOptions): void;
  remove(): void;
}

type Handler = { element?: (element: FakeElement) => void };

const escapeText = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const escapeAttribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const decodeAttribute = (value: string) => value.replaceAll('&quot;', '"').replaceAll('&amp;', '&');

const parseSelector = (selector: string) => {
  const match = /^([a-z]+)(?:\[([a-z:-]+)="([^"]*)"\])?$/.exec(selector);
  if (!match) throw new Error(`FakeHTMLRewriter does not support the selector ${selector}`);
  return { tag: match[1], attribute: match[2], value: match[3] };
};

function applyHandler(html: string, selector: string, handler: Handler): string {
  const { tag, attribute, value } = parseSelector(selector);
  const startTag = new RegExp(`<${tag}(\\s[^>]*?)?(\\s*/)?>`, 'gi');
  let output = '';
  let cursor = 0;

  for (let match = startTag.exec(html); match; match = startTag.exec(html)) {
    const attributes = new Map<string, string>(
      [...(match[1] ?? '').matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map((pair) => [pair[1], decodeAttribute(pair[2] ?? '')]),
    );
    if (attribute && attributes.get(attribute) !== value) continue;

    const endTag = `</${tag}>`;
    const endIndex = html.indexOf(endTag, match.index + match[0].length);
    const hasEndTag = !match[2] && endIndex !== -1 && !['meta', 'link'].includes(tag);
    let inner = hasEndTag ? html.slice(match.index + match[0].length, endIndex) : '';
    let removed = false;
    const element: FakeElement = {
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute: (name, next) => { attributes.set(name, next); },
      setInnerContent: (content, options) => { inner = options?.html ? content : escapeText(content); },
      append: (content, options) => { inner += options?.html ? content : escapeText(content); },
      remove: () => { removed = true; },
    };
    handler.element?.(element);

    const serialized = removed
      ? ''
      : `<${tag}${[...attributes].map(([name, next]) => ` ${name}="${escapeAttribute(next)}"`).join('')}${match[2] ?? ''}>` +
        (hasEndTag ? `${inner}${endTag}` : '');
    output += html.slice(cursor, match.index) + serialized;
    cursor = hasEndTag ? endIndex + endTag.length : match.index + match[0].length;
    startTag.lastIndex = cursor;
  }

  return output + html.slice(cursor);
}

export class FakeHTMLRewriter {
  private readonly handlers: Array<[string, Handler]> = [];

  on(selector: string, handler: Handler): this {
    this.handlers.push([selector, handler]);
    return this;
  }

  transform(response: Response): Response {
    const handlers = this.handlers;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let html = await response.text();
        for (const [selector, handler] of handlers) html = applyHandler(html, selector, handler);
        controller.enqueue(new TextEncoder().encode(html));
        controller.close();
      },
    });
    return new Response(body, response);
  }
}
