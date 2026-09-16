# Requirements — Accounts and Roles

**Feature:** F11 · `accounts`
**Status:** Draft — planner role only; reviewer role's workflow ships with F12
**Serves:** every intent (access to all of them); I8 (later, with reviewers) · **Release:** 1 for planners
**Derived from:** [charter.md](charter.md) (Users, Posture), [features.md](features.md) (F11), [system-architecture.md](../TechDesign/system-architecture.md) (D14, W1)
**Related design doc:** [TechDesign/accounts-roles.md](../TechDesign/accounts-roles.md)

## Why

Every other feature assumes a signed-in person whose jurisdiction access is already known. Without accounts and roles there is no actor to authorize, so this is a release-1 foundation even though it delivers no intent on its own (charter: "the other features are foundations a real application can't run without").

## Scope

In scope for release 1: city staff signing in through the city's own identity provider, UPlan staff signing in through GitHub, and the planner role — who can build decisions, propose profile changes, and release reports (without sign-off, since F12 hasn't shipped). Out of scope for release 1: the reviewer _workflow_ (F12) — but the data model must not need a migration to add it, since the charter already names reviewers as v1 users.

## Requirements

**R1. City staff sign in through their city's own identity provider over OIDC.** No UPlan-managed password exists for city staff. Sign-in fails clearly (not silently) when the city's identity provider is unreachable or misconfigured.

**R2. UPlan staff sign in with GitHub, and get staff rights only if their GitHub account is linked to a `staff_member` row.** A GitHub sign-in from an unlinked account creates no access — it authenticates a person, not a role.

**R3. A person's role is per jurisdiction, not global.** Being a planner for one city's jurisdiction grants no access to another city's data (charter: multiple jurisdictions is out of scope for v1, but the schema and every check must already be jurisdiction-scoped, per `system-architecture.md`'s round-10 containment).

**R4. Only UPlan staff can grant or revoke a jurisdiction membership in release 1.** Planners cannot invite or remove each other. Every grant records who granted it and when, and that record is never edited (`membership.granted_by`, `granted_at`).

**R5. The `reviewer` role exists in the data model from release 1, even though no release-1 screen grants reviewer capabilities.** F12 must be able to add its sign-off workflow to existing reviewer memberships without a schema migration or a data backfill.

**R6. Every read or write of city data checks the actor's membership for that specific jurisdiction, inside the module function that performs it.** `src/proxy.ts` (or any future middleware) is never the sole gate — it may redirect a signed-out visitor, but a signed-in visitor without the right membership must still be refused by the module (`.claude/rules/do-not.md`: "Don't rely on `src/proxy.ts` for authorization").

**R7. Denied access is a distinguishable, safe failure.** A request for a jurisdiction the actor doesn't belong to raises `ForbiddenError` and reveals nothing about that jurisdiction's data — not even that a given decision id exists.

**R8. Session cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`,** and a session is invalidated on sign-out and on expiry, per Better Auth's defaults plus `system-architecture.md`'s _Security and access_.

**R9. A staff member's own `staff_member` row cannot be used to grant itself a city membership meant for city staff**, and a city membership cannot be used to claim staff rights — the two access paths never cross.

## Out of scope for this feature

- The reviewer sign-off workflow itself, and any UI for it (F12).
- How a city's IdP is registered (a manual setup step, covered in the operator's guide, not a UPlan screen in release 1).
- Multi-jurisdiction UI for a single user holding memberships in more than one city (schema supports it; no release-1 screen needs it with one pilot city).

## Open items

None from round 10 directly name F11. If v1 opens beyond Sammamish (round 10), R3's per-jurisdiction scoping is what makes that a data question, not an access-model rewrite.
