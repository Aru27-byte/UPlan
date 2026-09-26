# Requirements — Accounts and Roles

**Feature:** F11 · `accounts`
**Status:** Draft — planner role only; reviewer role's workflow ships with F12. Sign-in moved from city OIDC and GitHub to email and password through Supabase Auth
**Serves:** every intent (access to all of them); I8 (later, with reviewers) · **Release:** 1 for planners
**Derived from:** [charter.md](charter.md) (Users, Posture), [features.md](features.md) (F11), [system-architecture.md](../TechDesign/system-architecture.md) (D14, W1)
**Related design doc:** [TechDesign/accounts-roles.md](../TechDesign/accounts-roles.md)

## Why

Every other feature assumes a signed-in person whose jurisdiction access is already known. Without accounts and roles there is no actor to authorize, so this is a release-1 foundation even though it delivers no intent on its own (charter: "the other features are foundations a real application can't run without").

## Scope

In scope for release 1: anyone registering and signing in with an email address and a password, handled by Supabase Auth; the sign-in and register pages; and the planner role — who can build decisions, propose profile changes, and release reports (without sign-off, since F12 hasn't shipped). Out of scope for release 1: the reviewer _workflow_ (F12) — but the data model must not need a migration to add it, since the charter already names reviewers as v1 users.

## Requirements

**R1. Every person signs in with an email address and a password, handled by Supabase Auth.** UPlan stores no password and offers no other sign-in method: no GitHub button, no city identity provider button. Sign-in fails clearly, and differently, in two cases: the credentials are wrong, and Supabase can't be reached. Neither is silent.

**R2. Registering creates an identity, never access.** Anyone can register with a name, an email address, and a password. A newly registered person has no jurisdiction membership and no staff rights until R4 grants a membership or a `staff_member` row links them. Staff rights come only from a `staff_member` row; being signed in, or being registered, grants none. The register page says so, so a new person isn't left wondering why no city data appears. A person who had a UPlan account before sign-in moved to Supabase Auth is linked to it by UPlan staff, on purpose; registering with the same email never claims it.

**R3. A person's role is per jurisdiction, not global.** Being a planner for one city's jurisdiction grants no access to another city's data (charter: multiple jurisdictions is out of scope for v1, but the schema and every check must already be jurisdiction-scoped, per `system-architecture.md`'s round-10 containment).

**R4. Only UPlan staff can grant or revoke a jurisdiction membership in release 1.** Planners cannot invite or remove each other. Every grant records who granted it and when, and that record is never edited (`membership.granted_by`, `granted_at`). A person must have registered and signed in at least once before they can be granted access.

**R5. The `reviewer` role exists in the data model from release 1, even though no release-1 screen grants reviewer capabilities.** F12 must be able to add its sign-off workflow to existing reviewer memberships without a schema migration or a data backfill.

**R6. Every read or write of city data checks the actor's membership for that specific jurisdiction, inside the module function that performs it.** `src/proxy.ts` (or any future middleware) is never the sole gate — it may redirect a signed-out visitor, but a signed-in visitor without the right membership must still be refused by the module (`.claude/rules/do-not.md`: "Don't rely on `src/proxy.ts` for authorization").

**R7. Denied access is a distinguishable, safe failure.** A request for a jurisdiction the actor doesn't belong to raises `ForbiddenError` and reveals nothing about that jurisdiction's data — not even that a given decision id exists.

**R8. Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production,** and a session ends when it expires or is revoked at Supabase. No sign-out control ships in release 1.

**R9. A staff member's own `staff_member` row cannot be used to grant itself a city membership meant for city staff**, and a city membership cannot be used to claim staff rights — the two access paths never cross.

**R10. The sign-in page is an email-and-password form with a clearly visible Register button.** It has no third-party sign-in buttons. A person sent there from a protected page returns to that page after signing in, and only to a path on this site.

**R11. The register page asks for a full name, an email address, a password, and the password again,** and rejects a mismatch or a password shorter than 8 characters before anything is sent to Supabase. What happens next follows the Supabase project's "Confirm email" setting: with it off, the person is signed in and lands on the app; with it on, the page tells them to confirm their address from the email and then sign in. It links back to sign-in.

**R12. Both pages fill the viewport with a centered form over a slowly moving background in the app's palette.** The motion stops for a visitor who prefers reduced motion. Every field has a visible label, errors are announced and tied to their field, and both pages meet WCAG 2.1 AA.

## Out of scope for this feature

- The reviewer sign-off workflow itself, and any UI for it (F12).
- Password reset, a sign-out control, and email-change flows.
- How the Supabase project is set up (a manual step, covered in the operator's guide, not a UPlan screen in release 1).
- Multi-jurisdiction UI for a single user holding memberships in more than one city (schema supports it; no release-1 screen needs it with one pilot city).

## Open items

- **Email confirmation needs an email sender.** Supabase's built-in email service delivers only to your own team members, at 2 messages an hour, so a real confirmation flow needs a custom SMTP provider — an external service that needs its own decision record. Until then the pilot runs with "Confirm email" off, which means an email address is not proven to belong to whoever registered it. Staff must check who a person is before granting access (R4).
- None from round 10 directly name F11. If v1 opens beyond Sammamish (round 10), R3's per-jurisdiction scoping is what makes that a data question, not an access-model rewrite.
