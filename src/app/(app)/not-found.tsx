import Link from "next/link";

import { actionClassName } from "@/ui/action-styles";
import { Panel } from "@/ui/panel";

// One page for "there is no such project": it doesn't exist, it isn't yours, or it was deleted. They read the
// same on purpose (accounts-roles.md R7), so this page never says which.
export default function AppNotFound() {
  return (
    <Panel title="Not found">
      <p className="max-w-prose text-sm text-text">
        There is nothing at this address that you can open. The project may have been deleted, or the link may be
        wrong.
      </p>
      <div className="mt-4">
        <Link href="/dashboard" className={actionClassName("primary")}>
          Back to the dashboard
        </Link>
      </div>
    </Panel>
  );
}
