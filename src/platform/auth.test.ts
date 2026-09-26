import { describe, expect, it } from "vitest";

import { hardenCookie } from "./auth";

describe("R8: session cookies are HttpOnly, SameSite=Lax, and Secure in production", () => {
  it("R8: forces HttpOnly and SameSite=Lax over whatever the library asked for", () => {
    const cookie = hardenCookie({ httpOnly: false, sameSite: "none", path: "/", maxAge: 400 }, false);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 400 });
  });

  it("R8: is Secure in production and not in development", () => {
    expect(hardenCookie({}, true).secure).toBe(true);
    expect(hardenCookie({}, false).secure).toBe(false);
  });
});
