import { isValidElement, type JSXElementConstructor, type ReactElement } from 'react';

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
        return [(element.type as (props: unknown) => unknown)(element.props)];
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
