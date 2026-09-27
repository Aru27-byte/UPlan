# Requirements — Accounts and Roles

**Feature:** F11 · `accounts`
**Status:** Draft — everyone who signs in is a planner and works on their own projects; jurisdiction membership removed 2026-09-27; the reviewer role returns with F12. Sign-in moved from city OIDC and GitHub to email and password through Supabase Auth
**Serves:** every intent (access to all of them); I8 (later, with reviewers) · **Release:** 1 for planners
**Derived from:** [charter.md](charter.md) (Users, Posture), [features.md](features.md) (F11), [system-architecture.md](../TechDesign/system-architecture.md) (D14, W1)
**Related design doc:** [TechDesign/accounts-roles.md](../TechDesign/accounts-roles.md)

## Why

Every other feature assumes a signed-in person whose access is already known. Without accounts there is no actor to authorize, so this is a release-1 foundation even though it delivers no intent on its own (charter: "the other features are foundations a real application can't run without").

Until 2026-09-27 access was granted per city, by UPlan staff, as a _membership_. That made a person who had just registered look at an empty app until someone else acted, and it answered a question the pilot doesn't ask: there is one city, and a planner's own work is theirs. Membership is removed. A person works on the projects they create, and UPlan staff keep only the rights that need a second pair of eyes.

## Scope

In scope for release 1: anyone registering and signing in with an email address and a password, handled by Supabase Auth; the sign-in and register pages; and the planner — every signed-in person — who can create projects, work on their own, propose profile changes, and publish documents (without sign-off, since F12 hasn't shipped). Out of scope for release 1: the reviewer _workflow_ (F12) and any way to share a project with another person. F12 decides how a reviewer is given one project.

## Requirements

**R1. Every person signs in with an email address and a password, handled by Supabase Auth.** UPlan stores no password and offers no other sign-in method: no GitHub button, no city identity provider button. Sign-in fails clearly, and differently, in two cases: the credentials are wrong, and Supabase can't be reached. Neither is silent.

**R2. Registering creates an identity and a place to work, and nothing more.** Anyone can register with a name, an email address, and a password, and can then create projects and work on their own. Registering grants no staff rights: those come only from a `staff_member` row, and being signed in or registered grants none. The register page says what a new account can do. A person who had a UPlan account before sign-in moved to Supabase Auth is linked to it by UPlan staff, on purpose; registering with the same email never claims it.

**R3. A project belongs to the person who created it, and to no one else.** Nobody else sees it, opens it, changes it, or downloads its documents, whatever their role. Staff rights do not grant access to another person's project. The city's profile and evidence, which are not any person's project, are readable by everyone who is signed in.

**R4. There is no membership, and no way to grant one.** No table, screen, or function grants a person access to a city or to another person's project. Only UPlan staff hold rights beyond a planner's, and only through a `staff_member` row created by an operator (the setup script or the deployment guide's statement). Every staff row records who granted it and when, and is never edited.

**R5. The reviewer role is not in the data model in release 1.** F12 will introduce it with its own way to give a reviewer one project. Nothing in release 1 needs it, and a role nothing can grant would only be dead code.

**R6. Every read or write checks the actor inside the module function that performs it.** A project function checks that the actor created the project. A staff function checks `staff_member`. `src/proxy.ts` (or any future middleware) is never the sole gate — it may redirect a signed-out visitor, but a signed-in visitor still gets refused by the module (`.claude/rules/do-not.md`: "Don't rely on `src/proxy.ts` for authorization").

**R7. Denied access is a safe failure that reveals nothing.** A request for someone else's project, a deleted project, and a project that doesn't exist all raise the same `NotFoundError`. A request for a staff action by someone who isn't staff raises `ForbiddenError`.

**R8. Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production,** and a session ends when it expires or is revoked at Supabase. No sign-out control ships in release 1.

**R9. Staff rights and project ownership never combine.** A `staff_member` row does not open anyone's project, and owning a project does not allow a staff action. A staff member works on projects the same way anyone else does, on the ones they created.

**R10. The sign-in page is an email-and-password form with a clearly visible Register button.** It has no third-party sign-in buttons. A person sent there from a protected page returns to that page after signing in, and only to a path on this site.

**R11. The register page asks for a full name, an email address, a password, and the password again,** and rejects a mismatch or a password shorter than 8 characters before anything is sent to Supabase. What happens next follows the Supabase project's "Confirm email" setting: with it off, the person is signed in and lands on the dashboard (F20); with it on, the page tells them to confirm their address from the email and then sign in. It links back to sign-in.

**R12. Both pages fill the viewport with a centered form over a slowly moving background in the app's palette.** The motion stops for a visitor who prefers reduced motion. Every field has a visible label, errors are announced and tied to their field, and both pages meet WCAG 2.1 AA.

## Out of scope for this feature

- The reviewer sign-off workflow itself, and any UI for it (F12).
- Sharing a project with a colleague or a supervisor (F12 decides how).
- Password reset, a sign-out control, and email-change flows.
- How the Supabase project is set up (a manual step, covered in the operator's guide, not a UPlan screen in release 1).
- A city switcher. Every project is under the one pilot city.

## Open items

- **Email confirmation needs an email sender.** Supabase's built-in email service delivers only to your own team members, at 2 messages an hour, so a real confirmation flow needs a custom SMTP provider — an external service that needs its own decision record. Until then the pilot runs with "Confirm email" off, which means an email address is not proven to belong to whoever registered it. With membership gone that matters less for access (a stranger sees only their own empty dashboard), and still matters for who a project's author is.
- **Existing projects.** A project created by one person is now visible only to them. Work that several members of a city could see before is visible to its creator alone. The deployment guide covers what to check before upgrading.
- If v1 opens beyond Sammamish (round 10), a project would need to name its city (it already does) and the dashboard a city switcher.
