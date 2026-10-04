import type { ReactNode } from "react";

import { requireActor } from "@/app/_lib/actor";
import { getCity } from "@/app/_lib/city";
import { Panel } from "@/ui/panel";
import { AppShell } from "@/ui/shell/app-shell";

// Wraps every authenticated route in the navigation shell. requireActor() here means every page under (app)
// is already known signed-in before it renders — proxy.ts only redirects a visitor with literally no session
// cookie; this is the actual sign-in gate (do-not.md: "Don't rely on src/proxy.ts for authorization"), and
// every module function checks access again itself.
//
// The city's name is in the navigation on every page (F20 R6). With no city, or more than one, the page is
// replaced by a plain statement of what is wrong, not by a guess (city.ts).
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Independent reads, so they overlap rather than queue (each is a database round trip).
  const [{ name, email }, city] = await Promise.all([requireActor(), getCity()]);

  return (
    <AppShell userName={name} userEmail={email} cityName={city.kind === "city" ? city.city.name : "No city set up"}>
      {city.kind === "problem" ? (
        <Panel title="This UPlan site isn't ready yet">
          <p className="text-sm text-text">{city.message}</p>
        </Panel>
      ) : (
        children
      )}
    </AppShell>
  );
}
