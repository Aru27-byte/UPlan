# TechDesign — Project Dashboard

**Feature:** F20 · `decisions` + `workflow` + `src/app/(app)`
**Status:** Draft
**Requirements:** [Requirements/project-dashboard.md](../Requirements/project-dashboard.md) (R1–R10)
**Builds on:** [decisions.md](decisions.md) (F5), [decision-overview.md](decision-overview.md) (F18), [research-phases.md](research-phases.md) (F21), [research-changes.md](research-changes.md) (F22), [accounts-roles.md](accounts-roles.md) (F11)
**Release:** 1

## Approach

The dashboard is a read model plus a handful of actions. It adds no table of its own. Two existing modules gain functions (`decisions`: list and delete; `workflow`: a per-project summary), and the signed-in app gets one visual system, the same one the public landing, sign-in, and register pages use, so the two read as one product.

**Rejected:** a `project` table separate from `decision`. The charter has one core object, and a second table would need to be kept in step with the first. The product word "project" lives in screens and routes, and the code keeps `decision`.

**Rejected:** restyling the landing and auth pages with the app. They were built as one brand surface and nobody asked for them to change. The two styles are separated by where they are used, and `Requirements/features.md` names the split.

## Routes

The `decisions` route folder is renamed `projects`, and every page moves with it. Old paths are not kept: nothing outside the app links to them, and a redirect would be a second way to reach one page.

```
src/app/(app)/
  layout.tsx                         requireActor, the city, and the AppShell
  dashboard/page.tsx                 F20: the landing page
  projects/page.tsx                  redirects to /dashboard (the one place research is listed)
  projects/actions.ts                createProject, createSampleProject, deleteProject, startResearchChange (Server Functions)
  projects/new/page.tsx              F20 R9: the new-research form
  projects/[projectId]/layout.tsx    header, stage rail, analysis banner (F18)
  projects/[projectId]/actions.ts    review, details, boundary, resolution, finish, cancel (Server Functions bound to the project)
  projects/[projectId]/overview/…    F18
  projects/[projectId]/site/…        F5/F6/F8: study area, map
  projects/[projectId]/evidence/…    F7/F19
  projects/[projectId]/screening/…   F14
  projects/[projectId]/studies/…     F14
  projects/[projectId]/footprint/…   F8
  projects/[projectId]/impact/…      F9
  projects/[projectId]/report/…      F10/F22
  profile/page.tsx                   F1/F17: the city profile
  profile/actions.ts                 upload a workbook, decide a change (staff), install sample evidence (staff)
  help/page.tsx
src/app/api/projects/[projectId]/documents/[versionNumber]/route.ts    download a document version
src/app/api/profile/template/route.ts                                  download the Excel template (F17 R1)
```

`DEFAULT_LANDING_PATH` in `src/app/_lib/auth-form.ts` becomes `/dashboard`. Sign-in, the emailed-link callback, and a completed registration all send a person there (R1). `safeNextPath` is unchanged: it still returns only a path on this site.

## Data (R2, R3, R5)

`decisions` gains, beside the existing functions:

```ts
// decisions.ts
export async function listDecisions(actor: Actor, jurisdictionId: string): Promise<Decision[]>; // own, in this city, not deleted, newest first (R2, R11)
export async function deleteDecision(actor: Actor, decisionId: string, expectedRowVersion: number): Promise<void>; // R5
```

- `listDecisions` filters on `created_by = actor.userId and jurisdiction_id = $city and deleted_at is null`. The city is a required parameter, not a default: the dashboard lists the current city's projects (R11), and the other cities' projects are untouched and listed when their city is chosen (R12). The filter narrows a list the person already owns; it grants nothing. `listProjectSummaries(actor, jurisdictionId)` passes it through.
- `getDecision` returns the row only when it is the actor's own and not deleted. Otherwise it throws `NotFoundError`, the same error for "doesn't exist", "isn't yours", and "was deleted", so a caller can't probe (R2, F11).
- `deleteDecision` is one compare-and-set: `update decision set deleted_at = now(), deleted_by = $actor, row_version = row_version + 1 where id = $id and row_version = $expected and created_by = $actor and deleted_at is null and status <> 'finishing'`. Zero rows means `ConflictError` ("This project changed since you loaded it, or a document is being generated"). Nothing is deleted from any other table (R5). The `decision` row stays, and every list and read filters it out.

`workflow` supplies the row's stage information:

```ts
// workflow/summaries.ts
export type ProjectSummary = {
  decision: Decision;
  state: "in-progress" | "finishing" | "completed";
  latestVersion: number | null;        // the highest released document version
  phasesReviewed: number;              // of PHASES.length, at each phase's current output
  phasesTotal: number;
  nextAction: NextAction | null;       // the first of deriveNextActions (F18 R6)
  phases: Pick<PhaseView, "phase" | "state">[]; // each phase's state, for the status graphic
  usesSampleData: boolean;             // F23: shown as a label on the row
  lastActivityAt: Date;
};
export async function listProjectSummaries(actor: Actor): Promise<ProjectSummary[]>;
```

`listProjectSummaries` calls `listDecisions`, then `getWorkflow` for each (F18) with the reads for one project done as one small batch. It carries a hard limit of 100 projects, and says so on the page when a person has more, so the cost per page load is bounded and the limit is visible instead of a silent truncation. `lastActivityAt` is the greatest of the decision's creation, its latest geometry revision, its latest phase review, and its latest document request, taken in one SQL query per project.

Counts are integers. Nothing in the type is a percentage or a rating (R3, R7).

## The shell (R6, R8)

```
src/ui/shell/app-shell.tsx          Server Component: the navigation rail, the content column
src/ui/shell/sidebar-nav.client.tsx client: usePathname for the current item
src/ui/shell/mobile-nav.client.tsx  client: a disclosure button that opens the rail on a phone
```

- **Navigation items:** Dashboard, City profile, Help. The city profile item shows the city's name beneath its label, so it reads as a place, not a setting (R6). On every page the rail also shows the signed-in person and a **New research** shortcut.
- **On a phone** the rail collapses into a top bar with a menu button. The button is a real `<button>` with `aria-expanded` and `aria-controls`. The links are in the DOM in both layouts, so nothing is hidden from a screen reader.
- The layout calls `requireActor()` and `getCity()`, then hands plain strings to `AppShell`. The shell never queries.

`getCity()` in `src/app/_lib/city.ts` reads the cities with `listJurisdictions()` from `profiles` and the remembered choice from the `uplan_city` cookie, and hands both to `resolveCity` in `src/app/_lib/city-choice.ts`, a pure function (R13). It returns one of three results: `city` (the current city and the list), `choose` (more than one city and no valid remembered choice), or `problem` (none set up, with the message that tells UPlan staff to run the setup script). Exactly one city is the current city without any choice. A cookie naming a city that no longer exists is treated as no choice and the person is asked, not given another city. The layout renders a `problem` or `choose` result in place of the page.

## Switching cities (R11–R13)

```
src/app/_lib/city-choice.ts         CITY_COOKIE, resolveCity (pure, unit-tested)
src/app/_lib/city.ts                getCity: the cities + the cookie → resolveCity
src/app/(app)/city/actions.ts       switchCityAction (Server Function)
src/ui/city-switcher.tsx            the City control: a select and a Switch button over an ActionForm
```

- **Where the choice lives.** In a cookie, `uplan_city`, holding the city's id: `httpOnly`, `sameSite: lax`, `secure` in production, `path: /`, one year. It is a per-browser convenience, so it needs no table, migration, or job. It carries no authority: the id only selects which city's rows a page asks for, and every module function still scopes by the actor (R13). A tampered value is either not a UUID or not a city, and `resolveCity` treats both as no choice.
- **`switchCityAction`** (`runAction` pattern): `requireActor()`, `requiredUuid(formData, "jurisdictionId")`, `getJurisdiction(id)` (a `NotFoundError` for a city that doesn't exist, shown in the form), then `cookies().set(...)` and `redirect("/dashboard")`. Switching always lands on the dashboard, because the page the person was on may belong to the city they just left.
- **The control** is in the rail on every page, between **New research** and the navigation, and is the whole page content when `resolveCity` returns `choose`. It is a labelled `<select>` with a submit button, so it works without client script and a keyboard or screen-reader user needs nothing special (R8).
- **A project opened from another city.** A project page reads its city from the project (F5), so a link or bookmark to a project in a city that isn't current still opens, under its own city's profile (R12). The rail keeps naming the current city; it does not change the cookie on a read.
- **Sample data** (F23) is placed on the Sammamish site, so it is offered only for a city whose boundary contains that site; see `TechDesign/sample-data.md`.

## The visual system (R8)

Every page in UPlan, public and signed in, uses one visual system, taken from the "UPlan AI Website" landing design (decided 2026-10-16): a near-black warm page under a faint gold grid and soft green, blue, and gold glows (`Backdrop` in `src/ui/backdrop.tsx`); dark panels with a thin gold edge; a green pill for the primary action; gold, blue, lime, and tan accents; Bricolage Grotesque headings, Public Sans body text, and Space Mono captions and figures; and the UPlan mark, two oak leaves forming the "U" followed by "plan" in Chewy (`Brand` in `src/ui/brand.tsx`). One set of design tokens in `src/app/globals.css`, declared in Tailwind's `@theme`. Tokens carry meaning, and components use them rather than raw colors.

| Token | Value | Use |
| --- | --- | --- |
| `page` | `#120f08` | The page behind everything |
| `surface`, `canvas`, `raised` | `#1a1509`, `#221d12`, `#2a2618` | A panel; a quieter block inside one (a row, an inner panel, a disabled field); a hovered or selected row |
| `line`, `line-strong` | gold at 14% and 30% | A panel's edge and its dividers; an input's edge |
| `heading`, `text`, `muted`, `faint` | `#ffffff`, `#f6f3ec`, `#c9bfa0`, `#a39a7e` | Headings, body text, secondary text, footnotes |
| `nav`, `nav-text`, `nav-muted` | `#16120a`, `#f6f3ec`, `#c9bfa0` | The navigation rail |
| `brand`, `brand-soft` | `#aadc6e`, `#313519` | Links and quiet accents |
| `accent-green`, `-lime`, `-gold`, `-blue`, `-steel`, `-tan`, `-teal`, `-butter` | `#82b45a`, `#aadc6e`, `#eec975`, `#8fc3d6`, `#5c8fa8`, `#d9b07a`, `#6fb5aa`, `#eee6a0` | The primary action (green, ink text), the four research groups, and the landing page's sections |
| `info`, `warn`, `danger`, `ok` and their `-soft` fills | blue `#8fc3d6`, gold `#eec975`, coral `#f2917f`, lime `#aadc6e`, each on a 16% tint of itself over a surface | The four states below |
| `ink`, `cream` | `#120f08`, `#f6f3ec` | Dark text on a bright fill; light text |

`src/ui/tokens.test.ts` reads these values and asserts at least 4.5:1 for every text and fill pair.

- **Type.** The four families are self-hosted with `next/font/local` from `src/app/fonts/` (latin subsets, licenses in `LICENSES.txt` there), so nothing is fetched from a font service at runtime (`tech-stack.md`). Page titles are Bricolage Grotesque, extra bold, with tight tracking; captions and table headers are the Space Mono uppercase `eyebrow`; numbers use tabular figures; body text is 15px on a 1.5 line height, and no text is smaller than 11px.
- **Panels.** `surface`, a 1px `line` edge, an 18px radius, and a soft deep shadow (`panelClassName` in `src/ui/panel.tsx`). Rows inside a panel are `canvas` with a 1px edge that turns green when open. The landing page's product views, the sign-in card, and dialogs use the design's window, `.frame-glow`: a gradient green-gold-blue edge and a deeper shadow.
- **Buttons.** Pills, from `actionClassName` in `src/ui/action-styles.ts` and nowhere else: `primary` green with ink text, `secondary` a translucent cream outline, `danger` a coral outline, `ghost` a text link; `md` for the app and `lg` for the public pages' calls to action.
- **Inputs and dropdowns.** `inputClassName`: the page color inside a 1px `line-strong` edge with a 12px radius, gold on hover and green on focus. `color-scheme: dark` makes the browser draw a select's list and the date picker dark to match.
- **Status.** A pill with a shape and words, never color alone, on its state's tint.
- **Research groups.** Set up, Assemble, Analyze, and Report are blue, lime, gold, and tan (`src/ui/phase/group-tones.ts`): a faint tint with a 4px top edge in the group's color, as the landing page's step cards are drawn.
- **Maps.** The Protomaps dark basemap flavor. The study area is a dashed cream line and the footprint a gold one, each over a dark casing; the evidence palette in `map-styles.ts` is validated for dark backgrounds.
- **The report stays paper.** The released document and its in-app section preview keep their own print styling (white paper, serif), because the report is a document, not a screen (P3).
- **Motion.** A 150ms color transition on interactive elements. The backdrop's glows drift slowly, and under `prefers-reduced-motion: reduce` they and the transitions are off.
- **Focus.** A 3px gold outline offset by 2px on every interactive element. It is never removed.
- **The stage rail** wraps instead of scrolling: one column on a narrow container, the four groups side by side on a wide one, so no stage is ever hidden.

### Components (`src/ui/`)

| Component | Replaces | Notes |
| --- | --- | --- |
| `Panel`, `panelClassName` | `Card` | Titled surface with optional actions and footer; the class string for a section that needs its own header |
| `StatusLabel` | `Badge`, `StatusPill` | Text plus a shape and an icon, in one of `neutral`, `info`, `warn`, `danger`, `ok`. Color is never the only signal (R8) |
| `StatBox` | `StatTile`, `Metric` | A label and an integer, for a panel header (the dashboard's table, a project row's phases left, and the profile's resource-type list) |
| `PageHeader` | itself | Breadcrumb, title, meta line, actions |
| `Brand` | the emoji mark | The leaf "U" and the Chewy "plan", named "UPlan" for a screen reader |
| `Backdrop` | the contour-line background | The grid and glows behind every page |
| `actionClassName(variant, className, size)` | `buttonClassName` | `primary`, `secondary`, `danger`, `ghost` class strings, for a link or a plain button, in `md` or `lg` |
| `Button` (client) | — | A React Aria button with `actionClassName`'s look, for the sign-in and register forms and the landing showcase |
| `SubmitButton` (client) | — | A submit button that reads `useFormStatus`, disables itself while pending, and says what it is doing (R10) |
| `ActionForm` (client) | — | Wraps `useActionState` around a Server Function, and shows its error in a `role="alert"` region and its notice in a `role="status"` region (R10) |
| `ConfirmDialog` (client) | — | A native `<dialog>` opened by a button, with a title, a body, and Cancel and confirm buttons. It focuses the cancel button first, closes on Escape, and returns focus to the button that opened it. Used by Delete research |

`Card`, `Badge`, `StatTile`, `StatusPill`, the sticker `PageHeader` and `TabNav`, and `button-styles.ts` were rewritten or removed when they were replaced, not kept beside their replacements.

**Server Function pattern.** A Server Function in the app returns `ActionState = { error?: string; notice?: string }`. A shared helper, `runAction(fn)` in `src/app/_lib/action-state.ts`, calls it and turns the four expected error classes (`ValidationError`, `ConflictError`, `ForbiddenError`, `NotFoundError`) into `{ error: message }`, and lets everything else, including `redirect()`, propagate (conventions: catch only at a boundary, and rethrow what you can't handle). A success returns `{ notice }` and calls `refresh()` from `next/cache`, so the current page re-renders without a redirect. Redirecting actions (create) call `redirect()` after success.

## The pages

**Dashboard (R1–R7).** A Server Component. It calls `listProjectSummaries` and `getCity`, then renders: the header, titled "Welcome back, {first name}" with the line "Your {city} research", and **View city profile** beside **New research**; then one **My Research Projects** table. Its header carries two `StatBox`es (in progress, completed). Rows are sorted by phases left to review (`phasesTotal - phasesReviewed`), most first, then by last activity, newest first. Each row is an `ExpandableRow` (client: it holds only the open state; the summary, actions, and details are rendered on the server). Collapsed, a row shows the title, the progress badge, a small counter of phases left for review, a "Sample data" badge if needed, and the last-updated time, with the actions beside it. Opened, it shows `PhaseStatus`: six numbered nodes joined by a track, each with an icon, the phase name, and its state in words, linking to that phase, with "Phases left for review" at the top right, and links to the overview (and, once completed, the document). The actions:

| State | Actions |
| --- | --- |
| in progress | **Resume** (a link to the step named in `nextStep`, or Overview) · **Delete** |
| completed | **Re-research** · **Delete** (Download document is in the opened row) |
| finishing | None, and the badge "Generating document" |

**Resume** is a link. **Re-research** and **Delete** are forms whose Server Functions call `startResearchChange` and `deleteDecision` with the row version the page was rendered with (R5, F22). **Delete** opens `ConfirmDialog`, which names the project and says the records are kept. The toggle is a `<button aria-expanded aria-controls>` and the actions sit beside it, never inside it.

An empty list renders an empty state with the two ways to begin (R1).

**New research (R9).** One form in a `Panel`, an `ActionForm` over `createProject`. The city is shown as a read-only line. Two submit buttons share the form: **Create project** and **Create with sample data** (F23), distinguished by the submitter's `name`/`value`, so the sample path is the same validation plus one more call and never a second form.

## Accessibility (R8)

- The rail is a `<nav aria-label="Main">`. The current item has `aria-current="page"`. A project row's actions are buttons or links with names that include the project's title through `aria-label`, so a screen reader hears "Resume research: Sammamish Ridge Estates", not a list of identical "Resume research" labels.
- `StatusLabel` renders its text and a `<svg aria-hidden>` icon. The table has `<th scope>` headers. `ConfirmDialog` uses `<dialog>` so focus is trapped by the browser.
- All text and control colors are the tokens above, chosen for at least 4.5:1 against their fill. A unit test computes the contrast ratios from the token values, so a token change that breaks contrast fails the build.

## Requirement coverage

| Req | Satisfied by | Notes |
| --- | --- | --- |
| R1 | `DEFAULT_LANDING_PATH`, dashboard empty state | Sign-in, callback, and register all use it |
| R2 | `listDecisions`, `getDecision` | `created_by` and `deleted_at` filters; one `NotFoundError` |
| R3 | `ProjectSummary`, `ExpandableRow`, `PhaseStatus` | Counts and words only |
| R4 | The state table above | Actions chosen by `state`; enforced again inside each module function |
| R5 | `deleteDecision`, `ConfirmDialog` | Compare-and-set on `row_version`; nothing else deleted |
| R6 | The header's View city profile button, the rail item | Also in the rail on every page |
| R7 | The two `StatBox`es | Integers |
| R8 | The token table, components, accessibility rules, contrast test | Axe checks in the end-to-end specs |
| R9 | `projects/new`, `createProject`, `createSampleProject` | One form, two submitters |
| R10 | `ActionForm`, `SubmitButton`, `runAction` | `role="alert"` and `role="status"` |
| R11 | `CitySwitcher`, `switchCityAction`, `getCity`, `listDecisions(actor, jurisdictionId)` | The `uplan_city` cookie |
| R12 | `listDecisions` city filter; project pages read the project's own city | Nothing is moved or deleted |
| R13 | `resolveCity` | One city needs no choice; several with no valid choice ask; none is a problem |

## Risks and tradeoffs

- **Two visual styles in one repo.** The public pages and the app differ on purpose. The cost is two sets of tokens until the public pages are redesigned; the benefit is that a request to make the app professional doesn't rewrite a landing page nobody asked to change.
- **One `getWorkflow` per project on the dashboard** is many small queries. The 100-project limit bounds it, and a person's own list is short in the pilot. If it grows, the fix is one set-based query for the summary fields, not caching (Next.js data caching is forbidden for decisions).
- **Soft delete keeps data a person believes is gone.** The confirmation says so. Purging is a records process.

## Verification

- Vitest unit tests: `resolveCity` returns the only city without a choice, the chosen city when several exist, `choose` for no choice, a choice that is not a city, and a choice that is not a UUID, and `problem` for none (R13); `runAction` maps each expected error class to `{ error }` and rethrows an unexpected error and a redirect (R10); the token contrast test (R8); `safeNextPath` and `DEFAULT_LANDING_PATH` (R1).
- Testcontainers integration tests: `listDecisions` returns only the actor's own non-deleted projects, and a second actor gets `NotFoundError` from `getDecision` on the first's project (R2); `deleteDecision` hides the project, leaves its geometry, runs, and reviews in place, and fails with `ConflictError` on a stale `row_version` and while a document is being generated (R5); **a race test** fires two `deleteDecision` calls on one version at once and asserts one succeeds (R5); `listProjectSummaries` for a project in each state (R3, R4).
- Playwright: sign in, land on the dashboard, see the research table sorted by phases left, expand a row to see its phase status, see the correct actions for an in-progress and a completed project, delete with confirmation, and pass `@axe-core/playwright` at desktop and phone widths (R1–R8).

## Open questions

- None. Restoring a deleted project is in the Requirements' open items.

## As built: page plumbing

Shared by the pages above, so each page stays a thin read and a render:

- **`src/app/_lib/project.ts` — `loadProject(projectId)`.** Validates the id, calls `requireActor`, then `getWorkflow`, and turns `NotFoundError` into the framework's 404. It is wrapped in React's per-request `cache`, so the layout and the page share one read, and the next request reads afresh. That is a per-request memo, not Next.js data caching, which stays forbidden for decisions.
- **`src/app/_lib/action-state.ts` — `runAction`.** The one Server Function boundary: it turns `ValidationError`, `ConflictError`, `ForbiddenError`, and `NotFoundError` into a message the person can act on, refreshes the page after success, and rethrows everything else (including `redirect()`, which works by throwing).
- **`src/app/_lib/workflow-labels.ts` and `phase-model.ts`.** The words for every state, in one place, so the rail, the Overview, the dashboard, and each phase page say the same thing; `phaseModel` builds the plain view model a phase page renders. None of the words means done, complete, clear, safe, or approved.
- **`_components/boundary-panel.tsx`.** One panel for both boundaries: draw on the map, upload GeoJSON, or load the sample. The map editor's save returns `{ error }` instead of throwing, because a thrown message doesn't reach the browser in production.
- **`src/ui/`** holds server-safe presentational pieces (`Panel`, `StatusLabel`, `Metric`, `DataTable`, `PageHeader`, the phase page parts) and small client pieces (`ActionForm`, `SubmitButton`, `ConfirmDialog`, `AutoRefresh`, `StageRail`). None imports runtime code from `@/modules` or `@/platform`. `AutoRefresh` re-reads the page every three seconds while an analysis or a document is being produced, and not while the tab is hidden.
- **Raw SQL readers return timestamps as text.** Drizzle's `execute` hands `timestamptz` back as the driver's text whatever the row type says, so `decisions/geometry.ts` converts with `toDate`; a regression test asserts `Date`s. The column readers (`select()`) are unaffected.
- **`ActionForm` submits through `onSubmit`, not through the form's `action`.** React 19 resets an uncontrolled form after any function action, even one that returned an error, which would empty a required reason the person had just typed. So the form calls `startTransition(() => formAction(new FormData(form, submitter)))` itself: the fields keep what was typed when the action returns an error, and are cleared only after a success. `SubmitButton` reads the form's pending state from a context, because `useFormStatus` only sees the form's own `action`. Verified in a browser: an error keeps the typed reason, and a success clears the note.
- **Polling is bounded.** `AutoRefresh` stops after 100 refreshes (five minutes) so a stopped worker doesn't make an open tab re-read the project forever; a reload starts it again. The dashboard refreshes while any project is generating its document.
- **The map is built once per change.** `MapWorkspace` rebuilds only when a layer, or the content of a boundary, changes (stable string keys), not on every refresh, and reapplies the layer toggles after a rebuild.
- **Every Server Function authenticates inside `runAction`,** so an expired session is a message, and hidden-field ids are checked as UUIDs (`requiredUuid`) before they reach the database. `requireActor` is memoized per request, so the session is read once however many components ask.
