"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireActor } from "@/app/_lib/actor";
import { requiredUuid, runAction } from "@/app/_lib/action-state";
import { CITY_COOKIE } from "@/app/_lib/city-choice";
import { getJurisdiction } from "@/modules/profiles";
import { env } from "@/platform/env";
import type { ActionState } from "@/ui/action-state";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// TechDesign/project-dashboard.md, "Switching cities" (R11). Remembers which city the person is working in.
// The cookie only selects whose rows a page asks for; every module function still scopes by the actor
// (R13). A city that doesn't exist is a NotFoundError shown in the form, never a cookie naming nothing.
export async function switchCityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireActor();
    const city = await getJurisdiction(requiredUuid(formData, "jurisdictionId", "The city"));
    const cookieStore = await cookies();
    cookieStore.set(CITY_COOKIE, city.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
    // The page the person was on may belong to the city they just left, so switching lands on the dashboard.
    redirect("/dashboard");
  });
}
