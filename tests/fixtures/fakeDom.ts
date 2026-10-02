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

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): FakeNode | null {
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
  declare value?: string;
  declare type?: string;
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

  closest(tagNameSelector: string): FakeElement | null {
    return closestElementNamed(this, tagNameSelector.toUpperCase());
  }
}

function closestElementNamed(node: FakeNode | null, tagName: string): FakeElement | null {
  if (!node) return null;
  if (node instanceof FakeElement && node.nodeName === tagName) return node;
  return closestElementNamed(node.parentNode, tagName);
}

declare module 'react-dom/client' {
  interface DO_NOT_USE_OR_YOU_WILL_BE_FIRED_EXPERIMENTAL_CREATE_ROOT_CONTAINERS {
    fakeDomElement: FakeElement;
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

export const createFakeContainer = () => new FakeElement('div', HTML_NAMESPACE);

export const aWindowOnTheSite = () => ({
  location: { origin: 'https://serplists.com' },
  addEventListener() {},
  removeEventListener() {},
});

export function installFakeDomGlobals(navigationWindow?: object): () => void {
  const globals: { window?: unknown; IS_REACT_ACT_ENVIRONMENT?: unknown } = globalThis;
  const saved = { window: globals.window, act: globals.IS_REACT_ACT_ENVIRONMENT };
  globals.window = Object.assign(
    Object.create(navigationWindow ?? { addEventListener() {}, removeEventListener() {} }),
    {
      HTMLIFrameElement: class {},
      Image: class ImageReactDomPreloads {
        src = '';
        decode = () => Promise.resolve();
      },
      document: fakeDocument,
    },
  );
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

export const findAllByRole = (node: FakeNode, role: string): FakeNode[] =>
  findAll(node, (entry) => entry instanceof FakeElement && entry.getAttribute('role') === role);

export const isFakeElement = (node: FakeNode | null | undefined): node is FakeElement => node instanceof FakeElement;

export function elementOf(node: FakeNode | null | undefined, what: string): FakeElement {
  if (isFakeElement(node)) return node;
  throw new Error(`Expected ${what} to be an element, but found ${node ? node.nodeName : 'nothing'}.`);
}

export const findByText = (container: FakeNode, nodeName: string, label: string): FakeNode => {
  const [node] = findAll(container, (entry) => entry.nodeName === nodeName && entry.textContent === label);
  if (!node) throw new Error(`No ${nodeName} labelled ${label}`);
  return node;
};

type ClickCount = number;

type ClickModifiers = { button?: number; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean; detail?: ClickCount };

const deliverToCaptureThenBubbleListeners = <E extends { type: string }>(container: FakeElement, event: E) => {
  const listeners = container.listeners.filter((entry) => entry.type === event.type);
  for (const entry of [...listeners.filter((l) => l.capture), ...listeners.filter((l) => !l.capture)]) {
    entry.listener(event);
  }
  return event;
};

export const click = (container: FakeElement, target: FakeNode, modifiers: ClickModifiers = {}) => {
  const event = {
    type: 'click',
    target,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
    defaultPrevented: false,
    timeStamp: Date.now(),
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
  };
  return deliverToCaptureThenBubbleListeners(container, event);
};

export const dispatch = (container: FakeElement, target: FakeNode, type: string) => {
  const event = {
    type,
    target,
    defaultPrevented: false,
    timeStamp: Date.now(),
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
  };
  return deliverToCaptureThenBubbleListeners(container, event);
};
