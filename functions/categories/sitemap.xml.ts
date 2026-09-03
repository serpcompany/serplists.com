export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const legacyPage = new URL(request.url).searchParams.get('page');
  const page = legacyPage && /^\d+$/.test(legacyPage) && Number(legacyPage) >= 1
    ? legacyPage
    : '1';
  return Response.redirect(`https://serplists.com/sitemaps/categories/${page}.xml`, 308);
};
