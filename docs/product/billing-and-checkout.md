# Billing and checkout

What Billing (in Account Settings), the Pricing page and the billing API (`/api/billing/*`) do
for Personal Pro: Stripe Checkout, the Customer Portal and their refusals, subscription status,
how a page reads the plan, and plans that support manages. What each plan includes is in
[Pricing and Entitlements](pricing-and-entitlements.md).

Abbreviations: **Billing API tests** is `tests/unit/functions/api/billing-handler.test.ts`,
**Subscription guard tests** is `tests/unit/functions/api/billing-subscription-guard.test.ts`,
**Open session tests** is `tests/unit/functions/api/billing-open-checkout-sessions.test.ts`,
**Stale customer tests** is `tests/unit/functions/api/billing-stale-customer.test.ts`,
**Checkout race tests** is `tests/unit/functions/api/billing-checkout-concurrency.test.ts`,
**Access flow tests** is `tests/unit/lib/access-flow.test.ts`,
**Subscription tests** is `tests/unit/functions/api/entitlements-subscriptions.test.ts`,
**Billing section tests** is `tests/unit/components/BillingSection.dom.test.tsx`,
**Pricing tests** is `tests/unit/views/Pricing.dom.test.tsx`,
**Billing status tests** is `tests/unit/lib/billing.test.ts`,
**Plan check spec** is `tests/e2e/billing-status-failure.spec.ts`,
**Import page tests** is `tests/unit/components/TemplateBackup.test.tsx`,
**Template export tests** is `tests/unit/features/template-detail/templateExport.test.ts`, and
**Template actions tests** is `tests/unit/features/template-detail/useTemplateDetailModel.actions.test.ts`.

## Enforcement contract

Server-side checks are authoritative. Clients preserve structured API failures instead of
inferring access state from message text. Checkout and the Customer Portal answer:

**`503 billing_unavailable`.** Checkout cannot currently be started, nor the portal opened.

- Check: Billing API tests, "POST /api/billing/checkout returns 503 when Stripe is not configured"
  and "POST /api/billing/portal returns 503 when Stripe is not configured".

**`409 already_subscribed`.** The User already has Pro or a paid subscription.

- Check: Billing API tests, "POST /api/billing/checkout rejects users who already have Pro".

**`409 subscription_needs_attention`.** An open subscription is not paid up (`past_due`, `unpaid`,
`paused`).

- Check: Subscription guard tests, "returns 409 subscription_needs_attention for a %s subscription
  Stripe still lists".

The client then opens the Customer Portal instead of a second Checkout.

- Check: Access flow tests, "opens the Customer Portal when the subscription needs attention".

**`409 checkout_incomplete`.** An earlier checkout's first payment has not gone through and its
Checkout Session can no longer be offered (for example, the payment is still processing).

- Check: Subscription guard tests, "returns 409 checkout_incomplete, not the Customer Portal, for
  an incomplete subscription no session holds".

The client shows the message and never opens the Customer Portal.

- Check: Access flow tests, "explains an unfinished earlier checkout without opening the Customer
  Portal".

**`409 plan_managed_by_support`.** A manual Free override sets the Personal plan, so self-serve
checkout is closed.

- Check: Subscription guard tests, "refuses checkout under a Free override before creating a
  Stripe customer or session".

**`409 billing_customer_missing`.** Stripe no longer has the User's billing account (deleted, or
made with the other mode's keys), so the Customer Portal cannot open. The portal request replaces
the account, as checkout does, and Billing refetches its status: subscriptions stored for the old
account no longer show, so Billing offers Upgrade.

- Check: Stale customer tests, "returns 409 billing_customer_missing instead of a server error, and
  replaces the customer" and "stops Billing showing the old customer's subscription, so Upgrade
  can open Checkout".

While the User has an open subscription on a current Pro price, the account is kept and the
message asks them to contact support, since Stripe's answer then points at misconfigured keys.

- Check: Stale customer tests, "keeps the customer at the portal and says to contact support".

**`409 no_billing_account`.** The User has no billing account (for example, Pro granted by
support), so there is no Customer Portal to open.

- Check: Subscription guard tests, "refuses the portal with a code the client can explain when
  there is no Stripe customer".

**`409 checkout_in_progress`.** Another checkout for the User is still starting (a double click or
a second tab); trying again shortly succeeds.

- Check: Checkout race tests, "returns 409 checkout_in_progress for a double click by a user with a
  customer".

## Subscription status

**What grants Pro.** Only `active` and `trialing` Stripe subscriptions grant Pro. A `past_due`,
`unpaid`, `paused`, or `incomplete` subscription resolves to Free.

- Check: Subscription tests, "resolves a %s subscription to %s".

**Not paid up.** `past_due`, `unpaid` and `paused` block a new Checkout, and Billing shows a
notice with Manage subscription so the User can fix the payment in the Customer Portal.

- Check: Billing section tests, "sends a past-due subscriber to Manage subscription instead of a
  second checkout" and "sends a subscriber whose subscription is not paid up to Manage
  subscription".

The Pricing page sends such a subscriber to manage the subscription too.

- Check: Pricing tests, "sends a past-due subscriber to manage the subscription instead of
  upgrading again".

**A first payment that did not go through.** An `incomplete` subscription is a first payment that
did not go through in Checkout (a declined card or an abandoned 3DS step), which the Customer
Portal cannot pay. Billing and Pricing keep offering Upgrade.

- Check: Billing section tests, "offers Upgrade again after a first payment did not go through in
  Checkout".

Checkout sends the User back to the Checkout Session that holds it.

- Check: Open session tests, "sends the buyer back to the session that holds the incomplete
  subscription".

Whether `past_due` should keep Pro during Stripe's retry window is an open product decision;
change it here first if it is made.

## The plan in the browser

**One User's plan.** Billing status query keys include the current user id (or an explicit guest
marker). A cached plan is never reused between accounts.

- Check: Billing status tests, "scopes the billing query to the current user" and "uses a stable
  guest key when no user is logged in".

**Unknown, not Free.** A Free or Pro label is never shown as known while billing status is still
loading. If billing status fails to load, the plan is unknown, not Free: Billing shows
"Unavailable" with a Retry, and no upgrade prompts, plan gates, or subscription actions until it
loads (`getBillingPlanStatus` in `src/lib/billing.ts`).

- Check: Billing status tests, "never guesses a plan while billing status is loading or failed"
  and "reports an error, not the Free plan, when the request failed with no data".

**Pricing.** The Pricing page's Pro card shows "Couldn't check your plan. Try again." with Retry
in place of Upgrade.

- Check: Plan check spec, "pricing offers a retry, not the upgrade, when the plan check fails".

**Retries.** Status requests retry transient failures (`shouldRetryBillingStatus`) before the
plan counts as unknown.

- Check: Billing status tests, "retries server and network failures", "does not retry client
  errors such as an expired session or a removed Organization" and "stops after a bounded number
  of retries".

**Feature gates.** Feature gates read the plan through `useBillingStatus`
(`src/hooks/useBillingStatus.ts`), which reports `loading`, `error` or `known`. Only a `known`
Free plan shows an upgrade prompt or starts checkout.

- Check: Import page tests, "does not treat a failed billing-status request as the Free plan" and
  "still shows the upgrade banner when the plan is known to be Free".

When the status check fails, the page offers a retry and no upgrade prompt. Import/export lets the
action through for the server to decide.

- Check: Plan check spec, "import and export stay usable when the plan check fails".

Exporting a Template from its detail page (a pack built in the browser) asks the user to try
again and checks the plan again.

- Check: Template export tests, "asks for a retry, never an upgrade, when the plan check failed".

Copying a public Template does the same: it says "Couldn't check your plan. Try again.", copies
nothing and starts no checkout, and the page checks the plan again.

- Check: Template actions tests, "does not send a user to checkout when the plan could not be
  checked".

## Manual personal-plan overrides

**Overrides win.** Personal manual overrides take precedence over Stripe-derived state until they
are removed or expire.

- Check: Subscription tests, "keeps a Free override visible as an override, even over an active
  subscription" and "ignores an expired override".

**Checkout is closed.** While one is active, checkout is refused (a subscription bought under a
Free override would never grant Pro) and Billing says support manages the plan.

- Check: Billing section tests, "does not offer checkout when support manages the plan".

**The portal.** Billing offers Manage subscription only to a User with a Stripe billing account,
so Pro granted by support shows just that notice.

- Check: Billing section tests, "keeps the portal for an existing customer when support manages
  the plan" and "does not offer a portal that cannot open to Pro granted by support".

Use the [admin override procedure](../agents/security.md#admin-entitlement-override) for
prerequisites, commands, verification, and temporary-secret cleanup.
