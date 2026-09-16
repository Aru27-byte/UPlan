import type { ReactNode } from "react";

import { getJurisdiction } from "@/modules/profiles";

import { requireActor } from "@/app/_lib/actor";
import { AppShell } from "@/ui/shell/app-shell";

// Wraps every authenticated route in the sidebar shell (UIDesign/Dashboard.png). requireActor()
// here means every page under (app) is already known signed-in before it renders — proxy.ts only
// redirects a visitor with literally no session cookie; this is the actual authorization gate
// (do-not.md: "Don't rely on src/proxy.ts for authorization").
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { actor, name } = await requireActor();

  // v1 is a single-jurisdiction pilot (charter.md): the first membership is the city this person
  // works for. A future multi-city release would need a real city switcher here, not this.
  const firstMembership = actor.memberships[0];
  const cityName = firstMembership
    ? (await getJurisdiction(actor, firstMembership.jurisdictionId)).name
    : "UPlan staff";

  return (
    <AppShell userName={name} cityName={cityName}>
      {children}
    </AppShell>
  );
}
