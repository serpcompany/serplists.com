import type { Metadata } from 'next';

import { findFeature } from '@/data/publicFeatures';
import { buildPageTitle } from '@/lib/brand';
import { routeParam } from '@/server/routeParam';
import Features from '@/views/Features';
import NotFound from '@/views/NotFound';

type Props = { params: Promise<{ featureSlug: string }> };

const loadFeature = async (params: Props['params']) => findFeature(routeParam((await params).featureSlug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return (await loadFeature(params))
    ? {}
    : { title: { absolute: buildPageTitle('Page not found') }, robots: 'noindex, follow' };
}

export default async function Page({ params }: Props) {
  return (await loadFeature(params)) ? <Features /> : <NotFound />;
}
