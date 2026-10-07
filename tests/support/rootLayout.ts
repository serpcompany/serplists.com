import RootLayout from '@/app/layout';

import { findAllElements, findElement, type AnyElement } from './elementTree';
import { withSiteEnv } from './siteEnv';

export const rootLayoutOn = (siteEnv: string | undefined) => withSiteEnv(siteEnv, () => RootLayout({ children: null }));

const innerHtmlOf = (element: AnyElement): string | null => {
  const html = element.props.dangerouslySetInnerHTML;
  return typeof html === 'object' && html !== null && '__html' in html && typeof html.__html === 'string' ? html.__html : null;
};

export function plainScriptsInTheHead(layout: unknown): Array<string | null> {
  const head = findElement(layout, (element) => element.type === 'head');
  return findAllElements(head?.props.children, (element) => element.type === 'script').map(innerHtmlOf);
}

export const elementsOfType = (layout: unknown, type: string) => findAllElements(layout, (element) => element.type === type);
