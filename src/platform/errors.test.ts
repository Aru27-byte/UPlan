import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./errors";

describe("R4: a duplicate grant is recognized as a unique violation", () => {
  it("R4: recognizes the pg error itself", () => {
    expect(isUniqueViolation(Object.assign(new Error("duplicate key"), { code: "23505" }))).toBe(true);
  });

  it("R4: recognizes the pg error when Drizzle wraps it as the cause", () => {
    const wrapped = new Error("Failed query", { cause: Object.assign(new Error("duplicate key"), { code: "23505" }) });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("R4: does not mistake another database error for a unique violation", () => {
    const wrapped = new Error("Failed query", { cause: Object.assign(new Error("fk"), { code: "23503" }) });
    expect(isUniqueViolation(wrapped)).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });
});
