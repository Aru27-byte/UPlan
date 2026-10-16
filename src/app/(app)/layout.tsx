import type { ReactNode } from "react";

import { requireActor } from "@/app/_lib/actor";
import { getCity } from "@/app/_lib/city";
import { CitySwitcher } from "@/ui/city-switcher";
import { Panel } from "@/ui/panel";
import { AppShell } from "@/ui/shell/app-shell";

import { switchCityAction } from "./city/actions";

// Wraps every authenticated route in the navigation shell. requireActor() here means every page under (app)
// is already known signed-in before it renders — proxy.ts only redirects a visitor with literally no session
// cookie; this is the actual sign-in gate (do-not.md: "Don't rely on src/proxy.ts for authorization"), and
// every module function checks access again itself.
//
// The current city's name is in the navigation on every page (F20 R6), with the City control to switch it
// (R11). With no city set up, or several and none chosen, the page is replaced by a plain statement of what
// is wrong or a request to choose, not by a guess (city.ts, R13).
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Independent reads, so they overlap rather than queue (each is a database round trip).
  const [{ name, email }, city] = await Promise.all([requireActor(), getCity()]);

  // When a choice is needed the panel below is the control, so the rail doesn't carry a second copy of it,
  // and with one city there is nothing to switch to.
  const citySwitcher =
    city.kind === "city" && city.cities.length > 1 ? <CitySwitcher cities={city.cities} currentId={city.city.id} action={switchCityAction} onDark /> : null;

  return (
    <AppShell
      userName={name}
      userEmail={email}
      cityName={city.kind === "city" ? city.city.name : city.kind === "choose" ? "No city chosen" : "No city set up"}
      citySwitcher={citySwitcher}
    >
      {city.kind === "problem" ? (
        <Panel title="This UPlan site isn't ready yet">
          <p className="text-sm text-text">{city.message}</p>
        </Panel>
      ) : city.kind === "choose" ? (
        <Panel title="Choose a city" description="Several cities are set up. Pick the one you are working in; UPlan applies that city's rules and shows its research.">
          <div className="max-w-sm">
            <CitySwitcher cities={city.cities} currentId={null} action={switchCityAction} />
          </div>
        </Panel>
      ) : (
        children
      )}
    </AppShell>
  );
}
