import { describe, expect, it, vi } from "vitest";

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";

import { optionalText, requiredInt, requiredText, runAction } from "./action-state";

// next/cache's refresh() only works inside a Server Function; here it is recorded so the test can assert on it.
const refreshed = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ refresh: refreshed }));

// TechDesign/project-dashboard.md, "Server Function pattern" (R10).
describe("R10: runAction turns the four expected errors into a message and lets everything else through", () => {
  it.each([
    ["ValidationError", new ValidationError("Give the project a title.")],
    ["ConflictError", new ConflictError("This project changed.")],
    ["ForbiddenError", new ForbiddenError("staff access required")],
    ["NotFoundError", new NotFoundError("project")],
  ])("R10: a %s becomes { error } with its message", async (_name, error) => {
    refreshed.mockClear();
    await expect(runAction(() => Promise.reject(error))).resolves.toEqual({ error: error.message });
    expect(refreshed).not.toHaveBeenCalled(); // nothing changed, so nothing to re-render
  });

  it("R10: an unexpected error propagates, and so does redirect()'s own throw", async () => {
    await expect(runAction(() => Promise.reject(new Error("database is down")))).rejects.toThrow("database is down");
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/dashboard;307;" });
    await expect(runAction(() => Promise.reject(redirect))).rejects.toBe(redirect);
  });

  it("R10: success re-renders the page, and returns the notice when there is one", async () => {
    refreshed.mockClear();
    await expect(runAction(() => Promise.resolve("Saved."))).resolves.toEqual({ notice: "Saved." });
    await expect(runAction(() => Promise.resolve())).resolves.toEqual({});
    expect(refreshed).toHaveBeenCalledTimes(2);
  });
});

describe("form field helpers reject rather than guess", () => {
  const form = (entries: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(entries)) data.set(k, v);
    return data;
  };

  it("requiredText names the missing field, and optionalText treats blank as not recorded", () => {
    expect(() => requiredText(form({ title: "  " }), "title", "The title")).toThrow("The title is required.");
    expect(requiredText(form({ title: "Ridge" }), "title", "The title")).toBe("Ridge");
    expect(optionalText(form({ applicant: "   " }), "applicant")).toBeNull();
    expect(optionalText(form({}), "applicant")).toBeNull();
    expect(optionalText(form({ applicant: "A" }), "applicant")).toBe("A");
  });

  it("requiredInt refuses anything that isn't a whole number, saying the page is out of date", () => {
    expect(requiredInt(form({ v: "4" }), "v")).toBe(4);
    expect(() => requiredInt(form({ v: "four" }), "v")).toThrow(/out of date/);
    expect(() => requiredInt(form({}), "v")).toThrow(/out of date/);
    expect(() => requiredInt(form({ v: "1.5" }), "v")).toThrow(/out of date/);
  });
});
