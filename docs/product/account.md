# Auth and account

How people sign up, sign in and manage their account, and the public Profiles of Users and
Organizations at `/profile/:handle` and `/profiles/`.

Abbreviations: **Router on D1** is `tests/integration/api-router-local-d1.test.ts`,
**Password reset tests** is `tests/unit/functions/api/password-reset-sessions.test.ts`,
**Sign-in smoke spec** is `tests/e2e/smoke-sign-in.spec.ts`,
**Return path tests** is `tests/unit/lib/auth/returnPath.test.ts`,
**Return path spec** is `tests/e2e/auth-return-path.spec.ts`,
**Workspace selection tests** is `tests/unit/contexts/workspaceSelection.test.ts`,
**Verification spec** is `tests/e2e/auth-verification.spec.ts`,
**Password policy tests** is `tests/unit/lib/auth/passwordPolicy.test.ts`,
**Password limit tests** is `tests/unit/functions/api/better-auth-password-length.test.ts`,
**Auth config tests** is `tests/unit/functions/api/better-auth-config.test.ts`,
**Session cookie tests** is `tests/unit/functions/api/better-auth-session-cookies.test.ts`,
**Token storage tests** is `tests/unit/contexts/authTokenStorage.dom.test.tsx`,
**Settings tests** is `tests/unit/components/SettingsContexts.dom.test.tsx`,
**Routes spec** is `tests/e2e/route-structure.spec.ts`,
**Profiles API tests** is `tests/unit/functions/api/public-profiles-d1.test.ts`,
**Profile case spec** is `tests/e2e/profile-username-case.spec.ts`,
**Organization profile spec** is `tests/e2e/organization-public-profile.spec.ts`,
**Public profile tests** is `tests/unit/views/PublicProfile.test.tsx`,
**Public template view tests** is `tests/unit/components/PublicTemplateView.test.tsx`,
**Directory spec** is `tests/e2e/profiles-directory.spec.ts`,
**Directory API tests** is `tests/unit/functions/api/profile-directory-d1.test.ts`, and
**Directory page tests** is `tests/unit/views/ProfilesDirectory.dom.test.tsx`.

## Signing up and signing in

**Sessions.** Better Auth is the session layer for email sign-up, sign-in, sign-out, password
changes, password reset, email verification, session lookup and session revocation. Sign-up
creates the account and signs it in with a session cookie, each request reads the account from
that cookie, and a forged cookie reads as signed out.

- Check: Router on D1, "signs up a new account and signs it in", "reads the signed-in account
  from its session cookie" and "treats a forged session cookie as signed out".

**No tokens in the browser.** Browser auth state lives in Better Auth's httpOnly cookies.

- Check: Session cookie tests, "sets every auth cookie of a sign-up and a sign-in httpOnly,
  locally and on https, so no page script can read the session".

The client does not store auth tokens.

- Check: Token storage tests, "keeps no auth token in the browser's storage or readable cookies,
  though the sign-in and session answers carry one".

**Protected pages.** A protected page sends a signed-out visitor to `/login/`, with the page they
asked for in `?next=`.

- Check: Sign-in smoke spec, "protected routes render login after redirect without refresh, with
  the page they came from in ?next=".

**Return path.** Sign-in returns them to that page, query string and hash included
(`getPostSignInDestination` in `src/lib/auth/returnPath.ts`). A `next` that leads to another
origin or to a sign-in page is ignored.

- Check: Return path tests, "keeps the path, query, and hash of an in-app path", "returns someone
  to where they were headed", "only returns paths that resolve to the app origin" and "rejects
  the auth page %s so sign-in cannot loop".

The login page never sends anyone to another origin, even when `next` turns into one once the
browser normalizes it.

- Check: Return path spec, "stays on the app when next normalizes to another origin" and "does
  not send a signed-in user to another origin from the login page".

**No saved destination.** Sign-in goes to `/dashboard`, which opens the remembered context's
Templates.

- Check: Return path tests, "opens the dashboard home, which opens the remembered context, not
  Account Settings, without a return path".

Once the server confirms a sign-out, the tab forgets its Organization, so the next sign-in opens
Personal's Templates.

- Check: Workspace selection tests, "forgets the stored Organization only when the server
  confirmed there is no session, never while get-session is unavailable and the user may still
  be signed in".

**Sign-up.** Sign-up without email verification goes to the saved destination, or to
`/dashboard` without one. A sign-up that must verify its email goes to the login page with the
saved destination kept.

- Check: Return path tests, "returns a new account straight to where it came from", "falls back
  to the console without a return path" and "sends an account that must verify to login with the
  return path kept".

**Email verification.** The link in the verification email ends on the login page, which says the
email is verified, or that the link expired, with Resend verification email. Sign-in then follows
the same rule.

- Check: Verification spec, "an expired link explains itself and offers a new email instead of
  claiming success" and "a successful link still confirms verification once".

**Password reset.** A reset ends on the login page too, so sign-in follows the same rule. Setting
the new password signs out every session of the account at once.

- Check: Password reset tests, "signs out every existing session, including a hijacked one".

**Password rules.** Register, a password change and a password reset take a password of at least
10 characters and at most 72 bytes of UTF-8 (fewer characters with emoji or accented letters,
since bcrypt reads only the first 72 bytes), and say which rule a password breaks before sending.

- Check: Password policy tests, "accepts %s", "rejects %s as too long" and "rejects a password
  shorter than 10 characters".

The API holds the same limit: a longer password is refused at sign-up, password change and reset,
and nothing changes.

- Check: Password limit tests, "refuses a sign-up password longer than 72 bytes and creates no
  account", "refuses a change-password newPassword longer than 72 bytes and keeps the old
  password" and "refuses a reset newPassword longer than 72 bytes and leaves the token usable".

In production, a password found in a known breach is refused when it is set, never at sign-in.

- Check: Auth config tests, "enables breached-password checks when setting production passwords"
  and "does not check breached passwords on production sign-in".

## Settings

**Account Settings.** `/dashboard/settings` is Account Settings, always in Personal: the account's
profile, security, Personal Run Keys (where enabled) and Personal billing, with incoming invites,
Create Organization and the user's Organizations.

- Check: Settings tests, "is Account Settings at the Personal URL, whatever the tab remembered: the
  User's own controls, Personal billing and Organization choices, and no Organization's
  management".

**An Organization's settings.** `/dashboard/organization/:organizationId/settings` is its own
page, named after the Organization: its billing, its management by role, and Leave Organization,
with a link back to Account Settings and none of the User's own controls.

- Check: Settings tests, "is the Organization's own page at its URL, named after it, with its
  billing and management and none of the User's Account controls".

**Old addresses.** `/account` and `/dashboard/profile` redirect to `/dashboard/settings`, keeping
the query string and hash (legacy redirects use `LegacyRedirect`).

- Check: Routes spec, "legacy console routes redirect to the live canonical dashboard path" and
  "legacy redirects keep the query string and hash".

## Public Profiles

**Handles.** Public Profiles live at `/profile/:handle`. The handle is looked up in the
[public handle registry](../agents/database-operations.md#public-handle-registry), in any letter
case, never by trying a User first: a User's handle shows that User's profile, as it always has,
and an Organization's shows the Organization Public Profile while the Organization is active.

- Check: Profiles API tests, "answers the User a handle names, in any letter case, as the username
  lookup did (%j)" and "answers an active Organization's handle with its name, handle, avatar and
  description, and nothing else".

**Not found.** An archived Organization keeps its handle but has no public page, and a handle no
one holds shows the same not-found page ("Profile not found").

- Check: Profiles API tests, "answers 404 for an archived Organization, which keeps its handle but
  has no public page" and "answers 404 for a handle no one holds and 400 for a blank one".

**Letter case.** A profile opened in another letter case replaces its address with the stored
handle.

- Check: Profile case spec, "a mixed-case profile URL shows the profile at its lowercase URL, since
  usernames are stored lowercase".

**Organization Public Profile.** An Organization's Public Profile shows its name, `@handle` and
description, the User profile's three stats, and its public, non-deleted Templates as cards that
open them under its handle. It is public whenever the Organization has a handle, with or without
public Templates ("No public templates").

- Check: Organization profile spec, "an Organization's Public Profile shows its name, handle and
  description, and opens its public Template under its handle".

It shows the Organization's avatar, or its initials (also while the avatar loads), and without a
description, a summary of its public Templates.

- Check: Public profile tests, "summarizes its public Templates when the Organization has no
  description" and "shows the Organization's initials until its avatar loads".

It shows nothing else about the Organization: no members, roles, invites, billing, Runs, activity
or private Templates.

- Check: Profiles API tests, "answers an active Organization's handle with its name, handle,
  avatar and description, and nothing else" and "names the Organization by its handle and name,
  never its id, members or private Templates".

**Who owns a public Template.** The Template Library's cards and the public template page name an
Organization Template's Organization, by its name and handle, and link to its Public Profile,
never to its Creator's.

- Check: Public template view tests, "names an Organization Template's Organization, never its
  Creator, on the link to the Organization's Public Profile".

**View Organization profile.** While an Organization with a handle is the active context, the
context switcher's menu has "View Organization profile", a link to `/profile/:handle/`. Personal,
and an Organization without a handle, show no such link.

- Check: Organization profile spec, "the context switcher links the active Organization's Public
  Profile, and only while that Organization is chosen".

## Profiles directory

**Two collections.** The Profiles directory at `/profiles/` (the footer's "Profiles" link) lists
Profile Owners in two tabs, "People" and "Organizations", and each card opens the one
`/profile/:handle/`.

- Check: Directory spec, "the footer links the Profiles directory, whose People open their one
  canonical profile", "switching to Organizations keeps the page and puts the collection in the
  address" and "an Organization with a handle is listed under Organizations and opens its public
  profile".

**Who is listed.** People are the Users whose username passes the
[public handle rule](../agents/database-operations.md#public-handle-registry); Organizations are
the active ones whose handle passes it, the owners the profiles sitemap lists. They come 24 cards
a page in handle order, with Previous and Next.

- Check: Directory API tests, "lists every User whose username passes the public handle rule, by
  username, as the profiles sitemap does", "lists each active Organization with a handle that
  passes the rule, and none archived or without one" and "pages in a stable order with a cursor,
  forwards and back".

**Cards.** Each card shows only the avatar (or initials), the name (or `@handle` without one),
`@handle` and the number of public Templates.

- Check: Directory API tests, "shows each one's name, avatar and public Template count, and
  nothing private" and "shows its name, avatar and public Template count, and never its id,
  members, roles or billing".

**Address.** The tab and page live in the address (`?collection=organizations`, `?after=` or
`?before=` a handle), and every address names `/profiles/` as its canonical URL.

- Check: Directory page tests, "is indexable with its canonical URL on the first page", "switches
  to Organizations in the URL, without a new history entry" and "links the previous and next pages
  of the collection through their cursors".

**States.** Each tab shows a loading line, a load error with Retry, "No people yet" or "No
Organizations yet", and "No more people" or "No more Organizations" with "Go to the first page"
past the last page.

- Check: Directory page tests, "says so while it loads, and offers Retry when it fails" and "says
  a collection is empty, and offers the first page when a later one is".
