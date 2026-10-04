import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/platform/db";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";

import { createPerson, createReadyCity, type City } from "../../../tests/support/factories";

import { editSettings, applyProfileDocument } from "./changes";
import { buildSampleProfileDocument } from "./sample-profile";
import type { SettingsEdit } from "./settings";
import { addUrlSource, listSources, removeSource, updateSource } from "./sources";
import { getCurrentProfile } from "./versions";
import { profileChange, profileVersion } from "./tables";

// TechDesign/profile-upload-edit.md — integration tests against the real PostgreSQL with PostGIS.

let city: City;
beforeEach(async () => {
  city = await createReadyCity({ sampleEvidence: false });
});

async function currentVersionId(): Promise<string> {
  const version = await getCurrentProfile(city.id);
  if (!version) throw new Error("the test city has no profile");
  return version.id;
}

function edit(retainYears: number): SettingsEdit {
  const document = buildSampleProfileDocument();
  return {
    ...document.settings,
    retention: document.settings.retention.map((r) => ({ ...r, retainYears })),
    mapStatus: Object.fromEntries(document.resourceTypes.map((r) => [r.key, r.mapStatus])),
  };
}

describe("editSettings", () => {
  it("R5: applies at once as a new version, recorded as an approved change by the person who made it", async () => {
    const baseId = await currentVersionId();
    const { versionNumber, versionId } = await editSettings(city.staff.actor, city.id, baseId, edit(4));

    expect(versionNumber).toBe(2);
    expect(await currentVersionId()).toBe(versionId);
    const [row] = await db.select().from(profileVersion).where(eq(profileVersion.id, versionId));
    const [change] = await db.select().from(profileChange).where(eq(profileChange.id, row?.changeId ?? ""));
    expect(change?.status).toBe("approved");
    expect(change?.decidedBy).toBe(city.staff.userId);
    expect(change?.proposedBy).toBe(city.staff.userId);
  });

  it("R5: refuses a save built on a profile that is no longer current, and writes nothing", async () => {
    const staleBase = await currentVersionId();
    await editSettings(city.staff.actor, city.id, staleBase, edit(4));

    await expect(editSettings(city.staff.actor, city.id, staleBase, edit(5))).rejects.toThrow(ConflictError);
    const current = await getCurrentProfile(city.id);
    expect(current?.versionNumber).toBe(2);
  });

  it("R5: of two saves made from the same revision at once, exactly one succeeds and the other is a ConflictError", async () => {
    const baseId = await currentVersionId();
    const other = await createPerson();

    const results = await Promise.allSettled([
      editSettings(city.staff.actor, city.id, baseId, edit(4)),
      editSettings(other.actor, city.id, baseId, edit(6)),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason).toBeInstanceOf(ConflictError);
    expect((await getCurrentProfile(city.id))?.versionNumber).toBe(2);
  });

  it("R4: refuses settings for a city with no profile yet", async () => {
    const empty = await createReadyCity({ profile: null, sampleEvidence: false });
    await expect(editSettings(empty.staff.actor, empty.id, null, edit(4))).rejects.toThrow(ValidationError);
  });

  it("R4: refuses an edit that does not pass the profile schema, and writes nothing", async () => {
    const baseId = await currentVersionId();
    await expect(editSettings(city.staff.actor, city.id, baseId, { ...edit(4), exportFormats: [] })).rejects.toThrow(ValidationError);
    expect((await getCurrentProfile(city.id))?.versionNumber).toBe(1);
  });
});

describe("applyProfileDocument", () => {
  it("R5: the first profile is applied from no base, and a second from no base is a ConflictError", async () => {
    const empty = await createReadyCity({ profile: null, sampleEvidence: false });
    await applyProfileDocument(empty.staff.actor, empty.id, null, buildSampleProfileDocument(), "First profile");
    await expect(applyProfileDocument(empty.staff.actor, empty.id, null, buildSampleProfileDocument(), "Again")).rejects.toThrow(ConflictError);
  });
});

describe("sources", () => {
  it("R12: adds, renames, re-addresses, and removes a web source", async () => {
    await addUrlSource(city.staff.actor, city.id, { label: "  Sammamish code  ", url: "https://example.test/code" });
    const [added] = await listSources(city.id);
    expect(added).toMatchObject({ kind: "url", label: "Sammamish code", url: "https://example.test/code" });

    await updateSource(city.id, added?.id ?? "", { label: "Municipal code", url: "https://example.test/new" });
    const [updated] = await listSources(city.id);
    expect(updated).toMatchObject({ label: "Municipal code", url: "https://example.test/new" });

    await removeSource(city.id, added?.id ?? "");
    expect(await listSources(city.id)).toEqual([]);
  });

  it("R12: refuses an address that is not http or https, and a blank name", async () => {
    await expect(addUrlSource(city.staff.actor, city.id, { label: "x", url: "javascript:alert(1)" })).rejects.toThrow(ValidationError);
    await expect(addUrlSource(city.staff.actor, city.id, { label: "   ", url: "https://example.test" })).rejects.toThrow(ValidationError);
    expect(await listSources(city.id)).toEqual([]);
  });

  it("R12: refuses to change or remove a source that does not exist in this city", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    await expect(updateSource(city.id, missing, { label: "x", url: "https://example.test" })).rejects.toThrow(NotFoundError);
    await expect(removeSource(city.id, missing)).rejects.toThrow(NotFoundError);
  });

  it("R12: a source in one city cannot be changed through another", async () => {
    const otherCity = await createReadyCity({ sampleEvidence: false });
    await addUrlSource(city.staff.actor, city.id, { label: "Mine", url: "https://example.test" });
    const [mine] = await listSources(city.id);
    await expect(updateSource(otherCity.id, mine?.id ?? "", { label: "Stolen", url: "https://example.test" })).rejects.toThrow(NotFoundError);
    await expect(removeSource(otherCity.id, mine?.id ?? "")).rejects.toThrow(NotFoundError);
  });
});
