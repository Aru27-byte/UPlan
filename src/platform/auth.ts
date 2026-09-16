import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sso } from "@better-auth/sso";

import { db } from "./db";
import { env } from "./env";
import * as authTables from "./auth-tables";

// City staff sign in over OIDC through the city's own identity provider; UPlan staff sign in with
// GitHub (TechDesign/accounts-roles.md, D14). There is no password sign-in and no invite-by-email —
// the stack has no email service (tech-stack.md's "Deliberately left out"). Session cookies are
// HttpOnly/Secure/SameSite=Lax by Better Auth's own defaults; this file does not override them.
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", schema: authTables, usePlural: false }),
  user: { modelName: "app_user" },
  plugins: [
    // @better-auth/sso has no static `providers` option — a provider is a persisted `ssoProvider`
    // row, registered at runtime through `auth.api.registerSSOProvider` (see
    // register-city-sso-provider.ts). Round 10 (cities beyond Sammamish) would register one more
    // provider row, not change this plugin wiring (system-architecture.md's containment note).
    sso(),
  ],
  socialProviders: {
    github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
  },
});

export type Session = typeof auth.$Infer.Session;
