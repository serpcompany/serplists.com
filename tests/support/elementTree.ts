import { isValidElement, type ReactElement } from 'react';

export type AnyElement = ReactElement<Record<string, unknown>>;

export function findAllElements(node: unknown, matches: (element: AnyElement) => boolean): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAllElements(child, matches));
  if (!isValidElement(node)) return [];
  const element = node as AnyElement;
  return [...(matches(element) ? [element] : []), ...findAllElements(element.props.children, matches)];
}

export function findElement(node: unknown, matches: (element: AnyElement) => boolean): AnyElement | null {
  return findAllElements(node, matches)[0] ?? null;
}
