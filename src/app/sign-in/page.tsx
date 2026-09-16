import { SignInButtons } from "./sign-in-buttons.client";

// UIDesign/Sign_In_Page.png — a centered white card on the dark background. TechDesign/accounts-
// roles.md — R1/R2: city staff sign in over OIDC; UPlan staff sign in with GitHub. No password
// field exists anywhere in this app (the mockup's email/password inputs don't correspond to a real
// sign-in method here, so they're dropped rather than reproduced non-functionally).
export default function SignInPage() {
  return (
    <main className="bg-ink flex min-h-screen items-center justify-center p-6">
      <div className="card-sticker w-full max-w-sm bg-white p-8">
        <div className="mb-6 flex items-center gap-2">
          <span aria-hidden className="text-2xl">
            🌰
          </span>
          <span className="font-serif text-xl font-bold">UPlan</span>
        </div>
        <h1 className="mb-4 font-semibold">Sign in to UPlan</h1>
        <SignInButtons />
      </div>
    </main>
  );
}
