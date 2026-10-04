import { Panel } from "./panel";

// What a signed-in page shows in the instant between a click and its data arriving (a `loading.tsx`, or the
// fallback of a Suspense boundary). The navigation shell around it stays put and interactive; only this
// area is a placeholder. `header` adds a page-title placeholder for the routes that open with a PageHeader;
// `body` is the content placeholder, left off where the content has its own boundary beside this one (a
// project's frame, above its page). A project stage leaves `header` off, because the project's own header
// is already on screen. Server-safe: no state, no hooks. The pulse stops for anyone who has asked their
// system for reduced motion, and the region is announced once, as "Loading", not as a set of empty shapes.
export function PageSkeleton({ header = false, body = true }: { header?: boolean; body?: boolean }) {
  return (
    <div role={body ? "status" : undefined} aria-busy="true" className="flex flex-col gap-5">
      {body ? <span className="sr-only">Loading</span> : null}
      {header ? (
        <div aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
          <div className="h-8 w-64 max-w-full rounded-lg bg-white/15" />
          <div className="h-4 w-96 max-w-full rounded bg-white/10" />
        </div>
      ) : null}
      {body ? (
        <Panel>
          <div aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
            <div className="h-5 w-48 max-w-full rounded bg-line" />
            <div className="h-4 w-full rounded bg-line" />
            <div className="h-4 w-5/6 rounded bg-line" />
            <div className="h-4 w-2/3 rounded bg-line" />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
