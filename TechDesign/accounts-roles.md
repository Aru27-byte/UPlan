# TechDesign — Accounts and Roles

**Feature:** F11 · `accounts`
**Status:** Draft
**Requirements:** [Requirements/accounts-roles.md](../Requirements/accounts-roles.md) (R1–R9)
**Builds on:** [system-architecture.md](system-architecture.md) (D14, W1, _Security and access_), [data-model.md](data-model.md) (`membership`, `staff_member`)
**Release:** 1 (planner role; reviewer role's schema only)

## Module

```
src/modules/accounts/
  index.ts          public API (below) — the only import path other modules use
  tables.ts         membership, staff_member Drizzle tables
  access.ts         requireMembership, requirePlanner, requireReviewer, requireStaff
  memberships.ts    grantMembership, revokeMembership, listMemberships
  actor.ts          getActor(session) -> Actor, pinned once per request
  access.test.ts, memberships.test.ts   unit + Testcontainers integration tests
```

Better Auth owns `app_user`, `session`, `account`, `verification` and generates their Drizzle schema itself (renaming its `user` table to `app_user`, since `user` is reserved in PostgreSQL — see `data-model.md`). `src/platform/auth.ts` configures Better Auth; `accounts` never redefines those tables, it only references `app_user.id`.

## Sign-in (R1, R2)

`src/platform/auth.ts`:

```ts
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  user: { modelName: "app_user" },
  plugins: [
    sso({
      // one static OIDC provider for the pilot city, from env — no self-service
      // provider registration UI in release 1 (round 10: cities beyond Sammamish
      // would add a provider row per city, not a new sign-in design).
      providers: [{ providerId: "city-oidc", issuer: env.CITY_OIDC_ISSUER /* … */ }],
    }),
  ],
  socialProviders: {
    github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
  },
});
```

- City staff visit `/sign-in`, choose the city's OIDC provider (only one exists in release 1), and land back with a session. A misconfigured or unreachable IdP surfaces Better Auth's own error page — no UPlan code swallows it (R1; no-fallback rule).
- UPlan staff sign in with the GitHub button. `requireStaff` (below) is the only thing that turns that session into staff rights (R2).
- There is no password sign-in path, and no invite-by-email flow — the stack has no email service (`tech-stack.md`'s _Deliberately left out_ has no SMTP/email provider), so R4's grant flow (below) requires the person to have signed in at least once already.

## Types

```ts
export type Role = "planner" | "reviewer";

export type Actor = {
  userId: string; // app_user.id (Better Auth's text id)
  isStaff: boolean;
  memberships: { jurisdictionId: string; role: Role }[];
};
```

`actor.ts`'s `getActor(session)` reads `staff_member` and `membership` once per request/job and returns this plain object — every module function takes an `Actor`, never a raw session, and never re-queries membership mid-computation (`conventions.md`: "Pin exact versions in every computation").

## Authorization (R3, R6, R7, R9)

```ts
// access.ts
export function requireMembership(actor: Actor, jurisdictionId: string, role?: Role): void {
  const has = actor.memberships.some(
    (m) => m.jurisdictionId === jurisdictionId && (role === undefined || m.role === role),
  );
  if (!has) throw new ForbiddenError(`no ${role ?? "membership"} access to this jurisdiction`);
}

export const requirePlanner = (actor: Actor, jurisdictionId: string) =>
  requireMembership(actor, jurisdictionId, "planner");
export const requireReviewer = (actor: Actor, jurisdictionId: string) =>
  requireMembership(actor, jurisdictionId, "reviewer");

export function requireStaff(actor: Actor): void {
  if (!actor.isStaff) throw new ForbiddenError("staff access required");
}
```

- Every other module's exported functions call one of these first, with the jurisdiction id the caller supplied — never a jurisdiction id read back out of the row being fetched (R3, R6). For example, `decisions.getDecision(actor, decisionId)` loads the decision's `jurisdiction_id` and calls `requireMembership` before returning anything, so a `NotFoundError`-shaped 404 and a `ForbiddenError`-shaped 403 are indistinguishable in what they reveal (R7): both say nothing about the row's contents.
- `requireStaff` and `requireMembership` read from disjoint tables (`staff_member` vs. `membership`) and are never combined with `||` anywhere in the codebase — a lint rule (`no-restricted-syntax` for a logical-or between calls to these two functions) keeps R9 true as new code is added.
- `src/proxy.ts` only redirects a visitor with no session at all to `/sign-in`; it never inspects role or jurisdiction (R6; matches `system-architecture.md`'s _Security and access_).

## Granting and revoking membership (R4, R5, R8)

```ts
// memberships.ts
export async function grantMembership(
  actor: Actor,
  jurisdictionId: string,
  userEmail: string,
  role: Role,
): Promise<void> {
  requireStaff(actor);
  const user = await findUserByEmail(userEmail); // Better Auth's app_user table
  if (!user) throw new ValidationError(`${userEmail} must sign in at least once before being granted access`);
  await db.insert(membership).values({
    userId: user.id,
    jurisdictionId,
    role,
    grantedBy: actor.userId,
  }); // primary key (user_id, jurisdiction_id, role) rejects a duplicate grant
}

export async function revokeMembership(actor: Actor, jurisdictionId: string, userId: string, role: Role) {
  requireStaff(actor);
  await db.delete(membership).where(/* user_id, jurisdiction_id, role */);
}
```

- Only `requireStaff` gates a grant or revoke in release 1 (R4, R8) — there is no planner-facing invite screen yet.
- `role` already accepts `"reviewer"` today (R5): the column, the check constraint, and `grantMembership` all work for a reviewer membership now, so F12 adds a sign-off _workflow_ against existing rows, never a migration or backfill.
- `granted_by` and `granted_at` are set once at insert and never updated — there is no `updateMembership`; a role change is a revoke plus a new grant, which keeps the audit trail honest (R4).

## Session security (R7, R8)

Better Auth's defaults already set `HttpOnly`, `Secure`, `SameSite=Lax` cookies and server-side session invalidation on sign-out; `src/platform/auth.ts` does not override them. Session rows live in PostgreSQL per `tech-stack.md`.

## Verification

- Unit tests (no database): `requireMembership`/`requireStaff` pass/fail matrices, one test per R3, R6, R7, R9 (asserting `staff_member` and `membership` are never OR'd).
- Testcontainers integration tests: `grantMembership` rejects an unknown email (R4 wording), rejects a non-staff actor (R8), and a duplicate grant hits the primary key and surfaces as `ConflictError` at the module boundary. A race test starts two `grantMembership` calls for the same `(user, jurisdiction, role)` on separate connections and asserts exactly one succeeds (concurrency rule: "a guard isn't done until its race test passes").
- No end-to-end sign-in test against a real OIDC provider runs in CI; `tests/e2e/` uses a recorded/stub OIDC responder for the sign-in flow, per the testing rules ("mock only what lies outside UPlan's infrastructure").
