import { isValidElement, type JSXElementConstructor, type ReactElement } from 'react';
import { z } from 'zod';
import { present } from './elements';

export interface ElementProps extends Record<string, unknown> {
  children?: unknown;
  className?: unknown;
  id?: unknown;
  role?: unknown;
  type?: unknown;
  href?: unknown;
  src?: unknown;
  style?: unknown;
  value?: unknown;
  checked?: unknown;
  disabled?: unknown;
  readOnly?: unknown;
  accept?: unknown;
  maxLength?: unknown;
  draggable?: unknown;
  dangerouslySetInnerHTML?: unknown;
  'aria-label'?: unknown;
  ref?: unknown;
  open?: unknown;
  label?: unknown;
  variant?: unknown;
  onClick?: unknown;
  onDoubleClick?: unknown;
  onChange?: unknown;
  onSubmit?: unknown;
  onKeyDown?: unknown;
  onDragStart?: unknown;
  onDragOver?: unknown;
  onDrop?: unknown;
  onError?: unknown;
  onOpenChange?: unknown;
}

export type AnyElement = ReactElement<ElementProps>;

export const isElement = (node: unknown): node is AnyElement => isValidElement<ElementProps>(node);

const callable = z.function();

export function handlerIn(props: Readonly<Record<string, unknown>> | null | undefined, name: string): (...args: unknown[]) => unknown {
  const handler = present(props, `props with ${name}`)[name];
  if (typeof handler !== 'function') throw new Error(`Expected ${name} to be a function, but it is ${typeof handler}.`);
  return callable.parse(handler);
}

export const handlerOf = (element: AnyElement | null | undefined, name: string) =>
  handlerIn(present(element, `an element with ${name}`).props, name);

export function findAllElements(node: unknown, matches: (element: AnyElement) => boolean): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAllElements(child, matches));
  if (!isElement(node)) return [];
  return [...(matches(node) ? [node] : []), ...findAllElements(node.props.children, matches)];
}

export function findElement(node: unknown, matches: (element: AnyElement) => boolean): AnyElement | null {
  return findAllElements(node, matches)[0] ?? null;
}

export function findElementOf<Props>(
  node: unknown,
  component: JSXElementConstructor<Props>,
): (AnyElement & ReactElement<Props>) | null {
  const isOf = (element: AnyElement): element is AnyElement & ReactElement<Props> => element.type === component;
  return findAllElements(node, isOf).find(isOf) ?? null;
}

export const findByAriaLabel = (node: unknown, label: string) =>
  findElement(node, (element) => element.props['aria-label'] === label);

export const findFileInput = (node: unknown) => findElement(node, (element) => element.props.type === 'file');

export function withComponentsRenderedOneLevel(
  tree: unknown,
  renders: (element: AnyElement) => boolean = () => true,
): unknown[] {
  const outputs = findAllElements(tree, (element) => typeof element.type === 'function' && renders(element)).flatMap(
    (element) => {
      try {
        return [callable.parse(element.type)(element.props)];
      } catch {
        return [];
      }
    },
  );
  return [tree, ...outputs];
}

export const findDomElement = (
  tree: unknown,
  matches: (element: AnyElement) => boolean,
  renders?: (element: AnyElement) => boolean,
): AnyElement | undefined =>
  findAllElements(withComponentsRenderedOneLevel(tree, renders), (element) => typeof element.type === 'string' && matches(element))[0];
