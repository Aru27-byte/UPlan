import { cache } from "react";

import { getActor, provisionUser, type Actor } from "@/modules/accounts";
import { getSessionUser } from "@/platform/auth";
import { db } from "@/platform/db";
import { ForbiddenError } from "@/platform/errors";

// App-layer glue only: bridges a Next.js request's session cookie to the accounts module's Actor
// type. Routes and Server Components call this, then pass `.actor` into one module function —
// they never inspect the session or check roles themselves (file-structure-and-imports.md: "Routes
// and job tasks stay thin"). Lives outside src/platform/ because platform imports nothing from
// modules (@/modules/accounts), and outside any module because it's specific to the Next.js request.
//
// One session read produces both the `Actor` every module function expects and the display
// name/email the sidebar shows — never read twice for one request (conventions.md: "Pin exact
// versions in every computation"). provisionUser first, so a person who has just registered has an
// app_user row before anything references it (accounts-roles.md, R2).
export type SessionActor = { actor: Actor; name: string; email: string };

export const requireActor = cache(async (): Promise<SessionActor> => {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError("sign-in required");
  const userId = await provisionUser(db, user);
  const actor = await getActor(db, userId);
  return { actor, name: user.name, email: user.email };
});
