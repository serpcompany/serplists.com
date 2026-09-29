import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, Outlet, RouterProvider, useSearchParams } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';

// Drives the page boundary under a real data router: a page crashes, the user clicks the
// fallback's home link (a router Link), and the router navigates the way it does in the
// browser. Only auth is faked.

let authUser: { id: string } | null = null;

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: authUser }),
}));

// Vitest runs in node with no DOM. React DOM needs only these node methods to render the
// fallback card and to dispatch a click through the listeners it adds to the root container.
const TEXT_NODE = 3;
type Listener = { type: string; listener: (event: unknown) => void; capture: boolean };

class FakeNode {
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

class FakeElement extends FakeNode {
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
    return new FakeElement(tagName, 'http://www.w3.org/1999/xhtml');
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
const globals = globalThis as Record<string, unknown>;
const savedGlobals = { window: globals.window, act: globals.IS_REACT_ACT_ENVIRONMENT };

beforeAll(() => {
  globals.window = { HTMLIFrameElement: class {}, document: fakeDocument, addEventListener() {}, removeEventListener() {} };
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globals.window = savedGlobals.window;
  globals.IS_REACT_ACT_ENVIRONMENT = savedGlobals.act;
});

const findAll = (node: FakeNode, match: (node: FakeNode) => boolean): FakeNode[] => [
  ...(match(node) ? [node] : []),
  ...node.childNodes.flatMap((child) => findAll(child, match)),
];

// A left click as the browser delivers it: capture listeners on the root first, then bubble.
const click = (container: FakeElement, target: FakeNode) => {
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

// The page under test. It throws while `pageBroken` is set, as a page does on a bad row.
let pageBroken = false;
let pageRenders = 0;
let pageMounts = 0;
let changeSearch: ((value: string) => void) | null = null;

function Page() {
  pageRenders += 1;
  const [, setSearchParams] = useSearchParams();
  changeSearch = (value) => setSearchParams({ scope: value });
  useEffect(() => {
    pageMounts += 1;
  }, []);
  if (pageBroken) throw new Error('bad template row');
  return <main>Page ok</main>;
}

// As Layout does: the boundary wraps the Outlet, so it stays mounted across the page routes.
const routes = [
  {
    element: (
      <RouteErrorBoundary>
        <Outlet />
      </RouteErrorBoundary>
    ),
    children: [
      { path: '/', element: <Page /> },
      { path: '/dashboard/templates', element: <Page /> },
    ],
  },
];

let root: Root | null = null;

async function renderAt(entry: string) {
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  const container = new FakeElement('div', 'http://www.w3.org/1999/xhtml');
  root = createRoot(container as unknown as HTMLElement);
  await act(async () => {
    root?.render(<RouterProvider router={router} />);
  });
  return {
    router,
    container,
    text: () => container.textContent,
    hasAlert: () => findAll(container, (node) => node instanceof FakeElement && node.getAttribute('role') === 'alert').length > 0,
    link: (label: string) => {
      const [link] = findAll(container, (node) => node.nodeName === 'A' && node.textContent === label);
      if (!link) throw new Error(`No link labelled ${label}`);
      return link;
    },
  };
}

// Lets the router finish the navigation and React commit it.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('RouteErrorBoundary', () => {
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    authUser = null;
    pageBroken = false;
    pageRenders = 0;
    pageMounts = 0;
    changeSearch = null;
    vi.restoreAllMocks();
  });

  const silenceCaughtErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it('recovers when a signed-in user clicks Go to My Templates on My Templates itself', async () => {
    silenceCaughtErrors();
    authUser = { id: 'user-1' };
    pageBroken = true;
    const page = await renderAt('/dashboard/templates');
    expect(page.hasAlert()).toBe(true);

    pageBroken = false;
    await act(async () => {
      const event = click(page.container, page.link('Go to My Templates'));
      expect(event.defaultPrevented).toBe(true);
    });
    await settle();

    expect(page.router.state.location.pathname).toBe('/dashboard/templates');
    expect(page.hasAlert()).toBe(false);
    expect(page.text()).toContain('Page ok');
  });

  it('recovers when a visitor clicks Go to home on the home page itself', async () => {
    silenceCaughtErrors();
    pageBroken = true;
    const page = await renderAt('/');
    expect(page.hasAlert()).toBe(true);

    pageBroken = false;
    await act(async () => {
      click(page.container, page.link('Go to home'));
    });
    await settle();

    expect(page.hasAlert()).toBe(false);
    expect(page.text()).toContain('Page ok');
  });

  it('recovers when the home link differs from the crashed page only by its query', async () => {
    silenceCaughtErrors();
    authUser = { id: 'user-1' };
    pageBroken = true;
    const page = await renderAt('/dashboard/templates?scope=team');
    expect(page.hasAlert()).toBe(true);

    pageBroken = false;
    await act(async () => {
      click(page.container, page.link('Go to My Templates'));
    });
    await settle();

    expect(page.router.state.location.search).toBe('');
    expect(page.hasAlert()).toBe(false);
    expect(page.text()).toContain('Page ok');
  });

  it('shows the card again, once, when the page still crashes after the click', async () => {
    silenceCaughtErrors();
    authUser = { id: 'user-1' };
    pageBroken = true;
    const page = await renderAt('/dashboard/templates');

    await act(async () => {
      click(page.container, page.link('Go to My Templates'));
    });
    await settle();
    const rendersAfterRetry = pageRenders;
    await settle();

    expect(page.hasAlert()).toBe(true);
    expect(pageRenders).toBe(rendersAfterRetry);
  });

  it('never remounts a healthy page when it navigates to itself or changes its query', async () => {
    const page = await renderAt('/dashboard/templates');
    expect(page.text()).toContain('Page ok');
    expect(pageMounts).toBe(1);

    await act(async () => {
      await page.router.navigate('/dashboard/templates', { replace: true });
    });
    await act(async () => {
      changeSearch?.('team');
    });
    await settle();

    expect(page.router.state.location.search).toBe('?scope=team');
    expect(pageMounts).toBe(1);
    expect(page.text()).toContain('Page ok');
  });
});
