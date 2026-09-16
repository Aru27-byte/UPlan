import { headers } from "next/headers";

import { getActor, type Actor } from "@/modules/accounts";
import { auth } from "@/platform/auth";
import { db } from "@/platform/db";
import { ForbiddenError } from "@/platform/errors";

// App-layer glue only: bridges a Next.js request's session cookie to the accounts module's Actor
// type. Routes and Server Components call this, then pass `.actor` into one module function —
// they never inspect the session or check roles themselves (file-structure-and-imports.md: "Routes
// and job tasks stay thin"). Lives outside src/platform/ because platform imports nothing from
// modules (@/modules/accounts), and outside any module because it's specific to the Next.js request.
//
// One session fetch produces both the `Actor` every module function expects and the display
// name/email the sidebar shows — never fetched twice for one request (conventions.md: "Pin exact
// versions in every computation").
export type SessionActor = { actor: Actor; name: string; email: string };

export async function requireActor(): Promise<SessionActor> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new ForbiddenError("sign-in required");
  const actor = await getActor(db, session.user.id);
  return { actor, name: session.user.name, email: session.user.email };
}
