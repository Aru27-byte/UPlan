import { createAuthClient } from "better-auth/react";
import { ssoClient } from "@better-auth/sso/client";

// The browser-side counterpart to src/platform/auth.ts's server config — not itself a React
// component, but it lives here (not src/platform) because *.client.tsx files and src/ui/ are the
// only places allowed to hold code a client component imports (file-structure-and-imports.md).
// It carries no secret and no baseURL override: same-origin requests to /api/auth/* are enough.
export const authClient = createAuthClient({
  plugins: [ssoClient()],
});
