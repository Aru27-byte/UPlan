import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { describeAuthError, RegisterFormSchema, safeNextPath, SignInFormSchema } from "./auth-form";

describe("R1: sign-in fails clearly, and differently, for wrong credentials and an unreachable Supabase", () => {
  it("R1: wrong credentials read as a mismatch", () => {
    const error = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");
    expect(describeAuthError(error)).toMatch(/email and password don't match/);
  });

  it("R1: an unreachable Supabase reads as a service problem, not a mismatch", () => {
    const error = new AuthRetryableFetchError("fetch failed", 0);
    const message = describeAuthError(error);
    expect(message).toMatch(/couldn't reach the sign-in service/);
    expect(message).not.toMatch(/don't match/);
  });

  it("R1: an API error with no message of our own shows Supabase's", () => {
    const error = new AuthApiError("Something specific happened", 400, "some_new_code");
    expect(describeAuthError(error)).toBe("Something specific happened");
  });

  it("R1: the sign-in form requires an email and a password", () => {
    const result = SignInFormSchema.safeParse({ email: "not-an-email", password: "" });
    expect(result.success).toBe(false);
    expect(SignInFormSchema.safeParse({ email: " pat@example.test ", password: "x" })).toMatchObject({
      success: true,
      data: { email: "pat@example.test" },
    });
  });
});

describe("R10: a sign-in only ever returns to a path on this site", () => {
  it("R10: keeps a same-site path and its query", () => {
    expect(safeNextPath("/projects/abc/site?layer=wetlands")).toBe("/projects/abc/site?layer=wetlands");
  });

  it("R10: falls back to the decisions page when there is no next", () => {
    expect(safeNextPath(undefined)).toBe("/dashboard");
  });

  it.each(["//evil.test", "/\\evil.test", "https://evil.test/dashboard", "evil.test", "/\t/evil.test"])(
    "R10: refuses %j",
    (next) => {
      expect(safeNextPath(next)).toBe("/dashboard");
    },
  );
});

describe("R11: registration is checked before anything is sent to Supabase", () => {
  const valid = {
    fullName: "Pat Planner",
    email: "pat@example.test",
    password: "correct horse",
    confirmPassword: "correct horse",
  };

  it("R11: accepts a complete form", () => {
    expect(RegisterFormSchema.safeParse(valid).success).toBe(true);
  });

  it("R11: rejects a password shorter than 8 characters", () => {
    const result = RegisterFormSchema.safeParse({ ...valid, password: "short", confirmPassword: "short" });
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain("password");
  });

  it("R11: rejects a confirmation that doesn't match, on the confirmation field", () => {
    const result = RegisterFormSchema.safeParse({ ...valid, confirmPassword: "something else" });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(["confirmPassword"]);
  });

  it("R11: rejects a blank name", () => {
    const result = RegisterFormSchema.safeParse({ ...valid, fullName: "   " });
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain("fullName");
  });
});
