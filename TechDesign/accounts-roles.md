# TechDesign — Accounts and Roles

**Feature:** F11 · `accounts`
**Status:** Draft
**Requirements:** [Requirements/accounts-roles.md](../Requirements/accounts-roles.md) (R1–R12)
**Builds on:** [system-architecture.md](system-architecture.md) (D14, W1, _Security and access_), [data-model.md](data-model.md) (`app_user`, `staff_member`)
**Release:** 1 (planners; staff rights)

## Approach (changed 2026-09-27)

Jurisdiction membership is removed. The first design gave each person a per-city role and made every module function check it. With one pilot city and a planner's work being their own, that check answered a question nobody was asking, and a person who had just registered saw nothing until someone else acted. The access model is now two rules:

- A **project** belongs to the person who created it (`decision.created_by`). Every project function checks that, inside the function, and answers `NotFoundError` for a project that isn't the actor's, is deleted, or doesn't exist.
- **Staff rights** come from a `staff_member` row and gate the few actions that need a second pair of eyes: approving a profile change (F17), creating a jurisdiction or a dataset (F3), installing sample evidence (F23), and exporting records (F16).

**Rejected:** keeping `membership` for a future reviewer role. A table nothing can write would be dead code, and F12 needs a per-project grant, not a per-city one. F12's Requirements state that.

**Migration.** `0003` drops `membership` after nothing reads it. It doesn't touch `app_user` or `staff_member`. A project keeps its `created_by`, so each person keeps what they created; work that several members of a city could once see is now visible to its creator alone (see the deployment guide's upgrade note).

## Module

```
src/modules/accounts/
  index.ts          public API (below) — the only import path other modules use
  tables.ts         staff_member Drizzle table
  access.ts         requireStaff
  users.ts          provisionUser: finds or creates the app_user for a Supabase identity
  actor.ts          getActor(userId) -> Actor, pinned once per request
  access.test.ts, users.integration.test.ts   unit + Testcontainers integration tests
```

`memberships.ts` (`grantMembership`, `revokeMembership`, `listMemberships`) is deleted, and so are `requireMembership`, `requirePlanner`, and `requireReviewer`. The project-ownership check lives with the project, in `decisions` (`getDecision`, `lockEditableDecision`), because it reads `decision.created_by` and `accounts` can't import `decisions` (`decisions` imports `accounts` for `Actor`).

Supabase Auth owns identities, passwords, and sessions. UPlan's `app_user` table is UPlan's own record of each person: every other table's `created_by`, `granted_by`, and `user_id` column references its `id`, and that id never changes. A nullable, unique `auth_id` column holds the Supabase user id that signs in as the person. `src/platform/auth-tables.ts` defines it, and `accounts` never writes it except through `provisionUser`.

## Sign-in and registration (R1, R2, R8, R10, R11)

Everything runs on the server. The browser never holds a Supabase client, so no Supabase key reaches it and no `NEXT_PUBLIC_` variable exists.

`src/platform/auth.ts` is the auth boundary. It wraps `@supabase/ssr`'s `createServerClient` three ways, each with the same cookie hardening:

| Export                            | Used by                                          | What it does                                                                                     |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `createSupabaseClient()`          | Server Functions, the callback route, `requireActor` | A client over Next.js's request cookies                                                          |
| `getSessionUser()`                | `src/app/_lib/actor.ts`                          | `getClaims()` verified against Supabase's signing keys, parsed with Zod into `{ id, email, name }` |
| `refreshSession(request)`         | `src/proxy.ts`                                   | The same check on a `NextRequest`, writing any refreshed cookies onto the response               |

- **Cookies (R8).** `@supabase/ssr` writes its cookies readable by browser scripts, because its own browser client needs them. Nothing here uses a browser client, so `setAll` overrides every cookie to `httpOnly: true`, `sameSite: "lax"`, and `secure` when `NODE_ENV` is `production`. `hardenCookie(options)` is a pure function so a unit test can assert it.
- **`getSessionUser()`** returns `null` when there is no session, or when Supabase rejects the session with an API error (revoked or expired refresh token). Anything else — a network failure, a malformed claim set — throws, so it reaches the logs. A user whose account has no `full_name` metadata (created in the Supabase dashboard, not through UPlan's register page) gets a `ValidationError` naming the fix.
- **`src/proxy.ts`** calls `refreshSession`, redirects a signed-out visitor to `/sign-in?next=<path>`, and copies any refreshed cookies onto the redirect. Public paths: `/`, `/sign-in`, `/register`, `/auth/callback`. It never inspects role or jurisdiction (R6).

Routes and files:

```
src/app/sign-in/page.tsx                     the page; a Server Component inside AuthShell
src/app/sign-in/sign-in-form.client.tsx      the form: useActionState over the Server Function
src/app/sign-in/actions.ts                   signIn(prevState, formData)
src/app/register/page.tsx
src/app/register/register-form.client.tsx
src/app/register/actions.ts                  register(prevState, formData)
src/app/auth/callback/route.ts               exchanges the emailed confirmation code for a session
src/app/_lib/auth-form.ts                    form schemas, safeNextPath, describeAuthError, AuthFormState
src/ui/auth-shell.tsx                        full-viewport layout, centered card, animated contour background
src/ui/text-field.client.tsx                 labeled input with error text and a show-password toggle
```

- **`signIn`** validates the form with `SignInFormSchema`, calls `supabase.auth.signInWithPassword`, and on success calls `redirect(safeNextPath(next))`. On failure it returns `{ error }` for the form to show. `redirect` sits outside any `try`, because it works by throwing.
- **`register`** validates with `RegisterFormSchema` (name, email, password of at least 8 characters, matching confirmation), then calls `supabase.auth.signUp` with `options.data.full_name` and `emailRedirectTo: <APP_URL>/auth/callback`. If the response carries a session, it redirects to `/dashboard`. If it doesn't, "Confirm email" is on, and the action returns `{ confirmEmail: <address> }`; the form replaces itself with a message to check the inbox. If Supabase answers with a user that has no identities, the address is already registered, and the form says to sign in.
- **`describeAuthError(error)`** turns a Supabase error into the text a person sees, and keeps the two R1 cases apart: an `AuthApiError` with code `invalid_credentials` reads "That email and password don't match"; `email_not_confirmed` and rate-limit codes have their own text; any other API error shows Supabase's message; a non-API error (Supabase unreachable) reads "UPlan couldn't reach the sign-in service" and the Server Function logs it once with `logger.error`.
- **`safeNextPath(next)`** (R10) returns `next` only if it starts with a single `/` and contains no `//`, `\`, or scheme; otherwise `/dashboard`. A sign-in must never redirect off the site.
- **`/auth/callback`** reads `code`, calls `exchangeCodeForSession`, and redirects to `/dashboard`. If the code is missing or can't be exchanged — for example the link was opened in a different browser from the one that registered, so the PKCE verifier cookie is absent — it redirects to `/sign-in?notice=confirm-failed`, and the page tells the person that their address may already be confirmed and to try signing in. Supabase has confirmed the address before it redirects here, so signing in works.
- **Field errors** use React Aria's `Form` `validationErrors`, so each message is tied to its field and announced (R12). The general error sits in an element with `role="alert"`. Fields keep their entered values across a failed submit, because React resets an uncontrolled form after an action: the action returns `values` and the inputs use `defaultValue`. Passwords are never returned.

### The pages (R10, R11, R12)

`AuthShell` is the one layout both pages use, in `src/ui/` because two routes need it.

- **Fills the page.** `min-h-dvh`, no max-width wrapper around the background. A single card, about 36rem wide, sits in the centre and holds only the form: the logo link, a heading, the fields, and the buttons. There is no side panel.
- **Background.** Two layers on `--color-ink`, both pure CSS animation with no JavaScript: (1) two sets of topographic contour lines, drawn as SVG paths whose radii vary smoothly, cream at about 7% opacity, drifting and turning over 90–140 seconds; (2) two large blurred radial glows in the palette's green and gold, moving over 40–60 seconds. Under `prefers-reduced-motion: reduce` the animations are switched off and the layers stay as a still image. The contour paths are generated once, on the server, from fixed sine terms, so there is no randomness and no hydration mismatch. The layers are `aria-hidden` and `pointer-events-none`.
- **Sign-in page:** heading, email, password with a show toggle, a gold "Sign in" button, then a divider and a full-width green "Register" button under "New to UPlan?". The Register button is a `Link` styled by `buttonClassName`, per that file's rule for links that look like buttons.
- **Register page:** the same shell, four fields, a hint under the password, a gold "Create account" button, a plain sentence saying a new account can start research right away and that UPlan staff hold the extra rights (R2), and a link back to sign-in.
- **Contrast.** Text sits on the white card, ink on white. The only text over the animated background is the footer line, cream on ink, with the glows kept dark enough that it stays above 4.5:1.

## Types

```ts
export type Actor = {
  userId: string; // app_user.id — UPlan's id for the person, not the Supabase user id
  isStaff: boolean;
};
```

`actor.ts`'s `getActor(db, userId)` reads `staff_member` once per request/job and returns this plain object — every module function takes an `Actor`, never a raw session, and never re-queries staff status mid-computation (`conventions.md`: "Pin exact versions in every computation").

`src/app/_lib/actor.ts`'s `requireActor()` is the one bridge from a request to an `Actor`: `getSessionUser()` (which yields the Supabase id as `authId`), then `provisionUser` (which returns `app_user.id`), then `getActor`.

## Finding or creating the person (R2, R4)

```ts
// users.ts — returns app_user.id
export async function provisionUser(
  db: DbOrTx,
  user: { authId: string; email: string; name: string },
): Promise<string> {
  const [inserted] = await db
    .insert(appUser)
    .values(user)
    .onConflictDoUpdate({
      target: appUser.authId,
      set: { email: user.email, name: user.name },
      setWhere: sql`${appUser.email} is distinct from ${user.email} or ${appUser.name} is distinct from ${user.name}`,
    })
    .returning({ id: appUser.id });
  if (inserted) return inserted.id;
  // The update was skipped because nothing changed, so the conflicting row exists: read its id.
  const [existing] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.authId, user.authId));
  // …a missing row here is a defect and throws
  return existing.id;
}
```

- One insert keyed on `auth_id`, no check-then-insert: two requests provisioning the same person at once both succeed and get the same id. `setWhere` means an unchanged person costs no write.
- It creates an identity and nothing else. No `staff_member` row appears (R2), so a new person is a planner with an empty dashboard and no staff rights.
- **People from before Supabase.** Their `app_user` row already holds their staff rights and the projects they created, and has a null `auth_id`. An operator links it on purpose, once, for an email they trust: `update app_user set auth_id = <supabase user id> where email = … and auth_id is null` (the deployment guide has the statement). Until then, a new identity with that email hits `app_user.email`'s unique constraint and `provisionUser` throws a `ConflictError` that says staff must link the account. A matching email is never enough on its own to claim an account, because while "Confirm email" is off nobody has proved they own the address.
- After linking, the person signs in as the same `app_user.id`, so every decision, geometry revision, and report they created stays theirs. No foreign key is rewritten.

## Authorization (R3, R6, R7, R9)

```ts
// access.ts
export function requireStaff(actor: Actor): void {
  if (!actor.isStaff) throw new ForbiddenError("staff access required");
}
```

That is the whole of `accounts`' access API. Project access is in `decisions`:

```ts
// decisions.ts
export async function getDecision(actor: Actor, decisionId: string): Promise<Decision> {
  const [row] = await db.select().from(decision)
    .where(and(eq(decision.id, decisionId), eq(decision.createdBy, actor.userId), isNull(decision.deletedAt)));
  if (!row) throw new NotFoundError("project"); // not yours, deleted, or absent: one answer (R7)
  return row;
}
```

- The ownership condition is part of the query, not a check after it, so a caller never holds a row it may not see (R3, R6, R7).
- Every module function that takes a `decisionId` reaches the project through `getDecision` or `lockEditableDecision`, both of which apply the same condition. A route never checks ownership itself.
- **R9.** `requireStaff` reads `staff_member` and ownership reads `decision.created_by`. Nothing ORs them, so a staff member gets no view of another person's project. `eslint.config.js`'s `no-restricted-syntax` rule now forbids a logical-or with a `requireStaff` call, so a future staff shortcut fails lint.
- `src/proxy.ts` only redirects a visitor with no session at all to `/sign-in`; it never inspects role or ownership (R6; matches `system-architecture.md`'s _Security and access_).

## Staff rights (R4)

There is no function that grants staff rights. An operator inserts a `staff_member` row (the setup script does it for the person it is given, and the deployment guide has the statement). `granted_by` and `granted_at` are set once and never updated. The reviewer role, and a way to give a reviewer one project, are F12's (R5).

## Verification

- Unit tests (no database): `requireStaff` pass and fail (R6, R7). `safeNextPath` accepts `/projects/abc/overview` and rejects `//evil.test`, `/\evil.test`, and `https://evil.test` (R10), and returns `/dashboard` for everything else. `RegisterFormSchema` rejects a short password, a mismatch, and a blank name (R11). `describeAuthError` gives different text for `invalid_credentials` and for an unreachable Supabase (R1). `hardenCookie` forces `httpOnly` and `sameSite: "lax"` whatever it is given, and `secure` only in production (R8).
- Testcontainers integration tests: `provisionUser` creates an `app_user` row with no membership and no staff rights (R2); two concurrent `provisionUser` calls for one Supabase id leave exactly one row and return the same id; a second Supabase id with an existing email is refused with a `ConflictError`; a legacy row is refused until linked, then signs in as the same id with its staff rights intact (R4). Project ownership is tested with the decisions module: a second actor gets `NotFoundError` for the first's project, a staff actor does too, and a deleted project reads the same as an absent one (R3, R7, R9).
- End-to-end (Playwright, with axe): `/sign-in` and `/register` render with the Register button visible, no third-party buttons, no WCAG 2.1 A or AA violations, and a phone-width viewport without horizontal scroll (R10, R12). No test calls a real Supabase project: a signed-out visit needs none, and the sign-in round trip is checked by hand against a development project.
