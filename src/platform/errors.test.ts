import { describe, expect, it } from "vitest";

import { isForeignKeyViolation, isUniqueViolation } from "./errors";

describe("a duplicate is recognized as a unique violation", () => {
  it("recognizes the pg error itself", () => {
    expect(isUniqueViolation(Object.assign(new Error("duplicate key"), { code: "23505" }))).toBe(true);
  });

  it("recognizes the pg error when Drizzle wraps it as the cause", () => {
    const wrapped = new Error("Failed query", { cause: Object.assign(new Error("duplicate key"), { code: "23505" }) });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("does not mistake another database error for a unique violation", () => {
    const wrapped = new Error("Failed query", { cause: Object.assign(new Error("fk"), { code: "23503" }) });
    expect(isUniqueViolation(wrapped)).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });
});

describe("a missing reference is recognized as a foreign key violation", () => {
  it("recognizes the pg error, wrapped or not, and nothing else", () => {
    const fk = Object.assign(new Error("fk"), { code: "23503" });
    expect(isForeignKeyViolation(fk)).toBe(true);
    expect(isForeignKeyViolation(new Error("Failed query", { cause: fk }))).toBe(true);
    expect(isForeignKeyViolation(Object.assign(new Error("dup"), { code: "23505" }))).toBe(false);
    expect(isForeignKeyViolation("not an error")).toBe(false);
  });
});
