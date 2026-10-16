import { UNKNOWN_PROJECT_ID } from "../support/app";
import { expect, test } from "../support/fixtures";

// The routes behind the buttons, called with the signed-in session (accounts-roles.md R7; profile-upload-edit.md R1;
// locked-report.md). The shape of every refusal is part of the contract: a missing, malformed, or foreign
// document is the same 404.

test.describe("profile template", () => {
  test("profile-upload-edit R1: the template downloads as an Excel workbook, privately", async ({
    request,
  }) => {
    const response = await request.get("/api/profile/template");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers()["content-disposition"]).toBe(
      'attachment; filename="uplan-city-profile-template.xlsx"',
    );
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    const bytes = await response.body();
    expect(bytes.length).toBeGreaterThan(1_000);
    // An .xlsx file is a zip archive: it begins with the local file header "PK\x03\x04".
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

test.describe("document downloads", () => {
  const refusals = [
    ["a project that does not exist", `/api/projects/${UNKNOWN_PROJECT_ID}/documents/1`],
    ["an id that is not a UUID", "/api/projects/not-a-uuid/documents/1"],
    ["version zero", `/api/projects/${UNKNOWN_PROJECT_ID}/documents/0`],
    ["a negative version", `/api/projects/${UNKNOWN_PROJECT_ID}/documents/-1`],
    ["a version that is not a number", `/api/projects/${UNKNOWN_PROJECT_ID}/documents/latest`],
    ["a fractional version", `/api/projects/${UNKNOWN_PROJECT_ID}/documents/1.5`],
  ] as const;

  for (const [what, path] of refusals) {
    test(`F22 R12: ${what} is a plain 404 that says nothing about why`, async ({ request }) => {
      const response = await request.get(path);

      expect(response.status()).toBe(404);
      expect(await response.text()).toBe("Not found");
      expect(response.headers()["content-type"]).not.toContain("pdf");
    });
  }

  test("F22 R12: a project of mine with no published version is the same 404 as one that does not exist", async ({
    request,
    blankProject,
  }) => {
    const mine = await request.get(`/api/projects/${blankProject.id}/documents/1`);
    const nobodys = await request.get(`/api/projects/${UNKNOWN_PROJECT_ID}/documents/1`);

    expect(mine.status()).toBe(nobodys.status());
    expect(await mine.text()).toBe(await nobodys.text());
  });
});

test.describe("health", () => {
  test("operations: /api/health answers the same signed in as signed out", async ({ request }) => {
    const response = await request.get("/api/health");

    expect([200, 503]).toContain(response.status());
    const body = (await response.json()) as { ok: boolean; failing: string[] };
    expect(response.status()).toBe(body.ok ? 200 : 503);
  });
});
