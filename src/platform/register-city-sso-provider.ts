import { auth } from "./auth";
import { env } from "./env";

// One-time setup, not run at process start: @better-auth/sso providers are persisted `ssoProvider`
// rows (BaseSSOProvider: issuer, oidcConfig, userId, providerId, domain — see
// node_modules/@better-auth/sso's type declarations), registered through
// auth.api.registerSSOProvider, not static plugin config (auth.ts has none). Run once per city
// onboarding, after a staff member has signed in with GitHub at least once (accounts-roles.md R2):
//
//   node --experimental-strip-types src/platform/register-city-sso-provider.ts <registeringStaffUserId>
//
async function main(): Promise<void> {
  const registeringUserId = process.argv[2];
  if (!registeringUserId) {
    throw new Error("usage: register-city-sso-provider.ts <registeringStaffUserId>");
  }

  await auth.api.registerSSOProvider({
    body: {
      providerId: "city-oidc",
      issuer: env.CITY_OIDC_ISSUER,
      domain: env.CITY_OIDC_DOMAIN,
      userId: registeringUserId,
      oidcConfig: {
        issuer: env.CITY_OIDC_ISSUER,
        clientId: env.CITY_OIDC_CLIENT_ID,
        clientSecret: env.CITY_OIDC_CLIENT_SECRET,
        pkce: true,
        discoveryEndpoint: `${env.CITY_OIDC_ISSUER}/.well-known/openid-configuration`,
      },
    },
  });
  console.error(`Registered OIDC provider "city-oidc" for domain ${env.CITY_OIDC_DOMAIN}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
