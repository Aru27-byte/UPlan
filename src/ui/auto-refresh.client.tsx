"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// While an analysis or a document is being produced in the background worker, the page re-reads its
// records every few seconds so the planner sees it finish without reloading. It holds no state of its own
// and coordinates nothing between requests: each refresh is an ordinary render of the current records.
// A hidden tab doesn't poll.
export function AutoRefresh({
  active,
  intervalMs = 3000,
  maxRefreshes = 100,
}: {
  active: boolean;
  intervalMs?: number;
  maxRefreshes?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    // Bounded: if the worker is down, the page stops asking after maxRefreshes (five minutes by default)
    // instead of re-reading the project every few seconds for as long as the tab is open. The banner on the page
    // says what to check, and a reload starts it again.
    let refreshes = 0;
    const id = setInterval(() => {
      if (document.hidden) return;
      refreshes += 1;
      if (refreshes > maxRefreshes) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, maxRefreshes, router]);
  return null;
}
