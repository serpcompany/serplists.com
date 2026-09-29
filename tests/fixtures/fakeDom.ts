// Vitest runs in node with no DOM, and the repo has no jsdom. React DOM needs only these few
// node methods to render a page into a container and to dispatch a click through the
// listeners it adds to that container, so a test can drive a page the way a user does.

const TEXT_NODE = 3;
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

type Listener = { type: string; listener: (event: unknown) => void; capture: boolean };

export class FakeNode {
  childNodes: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  nodeValue: string | null = null;
  listeners: Listener[] = [];

  constructor(
    readonly nodeType: number,
    readonly nodeName: string,
    readonly ownerDocument: FakeDocument | null,
  ) {}

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  appendChild(child: FakeNode) {
    return this.insertBefore(child, null);
  }

  insertBefore(child: FakeNode, before: FakeNode | null) {
    child.parentNode?.removeChild(child);
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index === -1) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    child.parentNode = this;
    return child;
  }

  removeChild(child: FakeNode) {
    this.childNodes = this.childNodes.filter((node) => node !== child);
    child.parentNode = null;
    return child;
  }

  get textContent(): string {
    if (this.nodeType === TEXT_NODE) return this.nodeValue ?? '';
    return this.childNodes.map((node) => node.textContent).join('');
  }

  set textContent(value: string) {
    if (this.nodeType === TEXT_NODE) {
      this.nodeValue = value;
      return;
    }
    for (const node of [...this.childNodes]) this.removeChild(node);
    if (value) this.appendChild(fakeDocument.createTextNode(value));
  }

  addEventListener(type: string, listener: Listener['listener'], options?: boolean | { capture?: boolean }) {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    this.listeners.push({ type, listener, capture });
  }

  removeEventListener(type: string, listener: Listener['listener']) {
    this.listeners = this.listeners.filter((entry) => entry.type !== type || entry.listener !== listener);
  }
}

export class FakeElement extends FakeNode {
  readonly tagName: string;
  readonly attributes = new Map<string, string>();
  readonly style: Record<string, unknown> = { setProperty() {} };

  constructor(
    tagName: string,
    readonly namespaceURI: string,
  ) {
    super(1, tagName.toUpperCase(), fakeDocument);
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: unknown) {
    this.attributes.set(name, String(value));
  }

  setAttributeNS(_namespace: string, name: string, value: unknown) {
    this.setAttribute(name, value);
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
}

class FakeDocument extends FakeNode {
  activeElement = null;

  constructor() {
    super(9, '#document', null);
  }

  createElement(tagName: string) {
    return new FakeElement(tagName, HTML_NAMESPACE);
  }

  createElementNS(namespace: string, tagName: string) {
    return new FakeElement(tagName, namespace);
  }

  createTextNode(text: string) {
    const node = new FakeNode(TEXT_NODE, '#text', fakeDocument);
    node.nodeValue = text;
    return node;
  }
}

const fakeDocument = new FakeDocument();

/** A container to pass to createRoot. */
export const createFakeContainer = () => new FakeElement('div', HTML_NAMESPACE);

/**
 * Gives React DOM a window while it commits (it reads the focused element) and turns on act().
 * Call from beforeAll, and call the returned function from afterAll.
 */
export function installFakeDomGlobals(): () => void {
  const globals = globalThis as Record<string, unknown>;
  const saved = { window: globals.window, act: globals.IS_REACT_ACT_ENVIRONMENT };
  globals.window = {
    HTMLIFrameElement: class {},
    document: fakeDocument,
    addEventListener() {},
    removeEventListener() {},
  };
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  return () => {
    globals.window = saved.window;
    globals.IS_REACT_ACT_ENVIRONMENT = saved.act;
  };
}

export const findAll = (node: FakeNode, match: (node: FakeNode) => boolean): FakeNode[] => [
  ...(match(node) ? [node] : []),
  ...node.childNodes.flatMap((child) => findAll(child, match)),
];

/** The first element with this tag (for example 'A' or 'BUTTON') whose text is `label`. */
export const findByText = (container: FakeNode, nodeName: string, label: string): FakeNode => {
  const [node] = findAll(container, (entry) => entry.nodeName === nodeName && entry.textContent === label);
  if (!node) throw new Error(`No ${nodeName} labelled ${label}`);
  return node;
};

/** A left click as the browser delivers it: capture listeners on the root first, then bubble. */
export const click = (container: FakeElement, target: FakeNode) => {
  const event = {
    type: 'click',
    target,
    button: 0,
    defaultPrevented: false,
    timeStamp: Date.now(),
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
  };
  const listeners = container.listeners.filter((entry) => entry.type === 'click');
  for (const entry of [...listeners.filter((l) => l.capture), ...listeners.filter((l) => !l.capture)]) {
    entry.listener(event);
  }
  return event;
};
