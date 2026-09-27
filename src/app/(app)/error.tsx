"use client";

import Link from "next/link";

import { actionClassName } from "@/ui/action-styles";
import { Panel } from "@/ui/panel";

// The boundary for an unexpected failure on any signed-in page (an invariant that didn't hold, a database that
// wasn't reachable). It says plainly that this is not the person's doing, keeps them inside the app shell, and
// gives the reference the operator finds in the logs. The message itself never reaches the browser.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Panel title="Something went wrong">
      <p className="max-w-prose text-sm text-text">
        UPlan couldn&apos;t show this page. Nothing you entered was lost or changed by this. Try again, and if it keeps
        happening, tell UPlan staff{error.digest ? ` and give them this reference: ${error.digest}` : ""}.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className={actionClassName("primary")}>
          Try again
        </button>
        <Link href="/dashboard" className={actionClassName("secondary")}>
          Back to the dashboard
        </Link>
      </div>
    </Panel>
  );
}
