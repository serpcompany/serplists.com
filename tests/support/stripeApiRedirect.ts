const standIn = process.env['STRIPE_API_STAND_IN'];
if (!standIn) throw new Error('STRIPE_API_STAND_IN must name the local server that stands in for the Stripe API.');

const fetchFromTheStandIn = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.origin !== 'https://api.stripe.com') {
    return Promise.reject(new Error(`The Stripe stand-in only answers https://api.stripe.com, not ${url.origin}.`));
  }
  return fetchFromTheStandIn(new URL(`${url.pathname}${url.search}`, standIn), init);
};
