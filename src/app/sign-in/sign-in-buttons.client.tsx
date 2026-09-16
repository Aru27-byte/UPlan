"use client";

import { authClient } from "@/ui/auth-client";
import { Button } from "@/ui/button.client";

// Better Auth's sign-in endpoints expect a POST from its client SDK (which then follows the
// provider's redirect) — a plain <a href> GET link to /api/auth/sign-in/* doesn't work, so these
// are buttons that call the SDK directly. TechDesign/accounts-roles.md — R1/R2: city staff sign in
// over OIDC; UPlan staff sign in with GitHub. "/" is now the public landing page (Landing.png), so
// a successful sign-in lands on the dashboard instead.
export function SignInButtons() {
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="secondary"
        className="text-ink"
        onPress={() => void authClient.signIn.sso({ providerId: "city-oidc", callbackURL: "/decisions" })}
      >
        Sign in with your city account
      </Button>
      <Button
        variant="outline"
        className="text-ink"
        onPress={() => void authClient.signIn.social({ provider: "github", callbackURL: "/decisions" })}
      >
        UPlan staff: sign in with GitHub
      </Button>
    </div>
  );
}
