import type { MultiPolygon } from "geojson";

import type { Actor } from "@/modules/accounts";
import { db } from "@/platform/db";
import { ConflictError, ValidationError } from "@/platform/errors";
import { enqueueAnalysisRun } from "@/platform/jobs";

import { getDecision, insertDecision, updateDecisionDetails, type Decision } from "./decisions";
import { insertGeometryRevision, saveGeometry, type GeometryKind } from "./geometry";

// TechDesign/sample-data.md (F23). Sample inputs are ordinary inputs: the study area and footprint are
// saved through the same paths as a drawn one, so the lock, the revision guard, and the analysis enqueue
// all apply. What marks them as sample is the label in their source note, which `isSampleNote` reads to
// show a "Sample data" label — nothing in the analysis reads it (R4).

export const SAMPLE_NOTE_PREFIX = "Sample data — ";

export function isSampleNote(sourceNote: string): boolean {
  return sourceNote.startsWith(SAMPLE_NOTE_PREFIX);
}

// R7: every free-text value names itself as sample or fictional. Nothing here is a real person, a real
// company, or a real address.
export const SAMPLE_DETAILS = {
  title: "Sammamish Ridge Estates (sample)",
  applicationType: "subdivision" as const,
  parcelOrAddress: "Sample parcel — not a real address",
  applicant: "Sample applicant (fictional)",
  projectManager: "Sample project manager (fictional)",
  targetDecisionOn: "2026-12-15",
  applicationFiledOn: "2026-08-01",
};

// The rectangles the local seed used, inside the pilot city's area. The illustrative evidence datasets
// (evidence/sample-evidence.ts) are placed relative to these.
export const SAMPLE_STUDY_AREA: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-122.03, 47.59],
        [-121.99, 47.59],
        [-121.99, 47.62],
        [-122.03, 47.62],
        [-122.03, 47.59],
      ],
    ],
  ],
};

export const SAMPLE_FOOTPRINT: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-122.02, 47.595],
        [-122.0, 47.595],
        [-122.0, 47.61],
        [-122.02, 47.61],
        [-122.02, 47.595],
      ],
    ],
  ],
};

const SAMPLE_GEOMETRY: Record<GeometryKind, { geom: MultiPolygon; note: string }> = {
  study_area: {
    geom: SAMPLE_STUDY_AREA,
    note: `${SAMPLE_NOTE_PREFIX}illustrative study area, not a real parcel.`,
  },
  footprint: {
    geom: SAMPLE_FOOTPRINT,
    note: `${SAMPLE_NOTE_PREFIX}illustrative proposed footprint, not a real site plan.`,
  },
};

/**
 * R1: a project with its details, study area, and footprint all filled in from the sample, and its
 * analysis queued. One transaction: it completes fully or leaves nothing behind.
 */
export async function createSampleProject(actor: Actor, jurisdictionId: string): Promise<Decision> {
  return db.transaction(async (tx) => {
    const created = await insertDecision(tx, actor, { ...SAMPLE_DETAILS, jurisdictionId });
    for (const kind of ["study_area", "footprint"] as const) {
      const sample = SAMPLE_GEOMETRY[kind];
      await insertGeometryRevision(tx, {
        decisionId: created.id,
        kind,
        revision: 1,
        geom: sample.geom,
        sourceNote: sample.note,
        createdBy: actor.userId,
      });
    }
    await enqueueAnalysisRun(created.id, { purpose: "current" }, tx);
    return created;
  });
}

/** R2: the Site or Footprint phase's sample boundary, saved as the next numbered revision (R8). */
export function loadSampleGeometry(actor: Actor, decisionId: string, kind: GeometryKind, expectedRevision: number) {
  const sample = SAMPLE_GEOMETRY[kind];
  return saveGeometry(actor, decisionId, kind, sample.geom, sample.note, expectedRevision);
}

/**
 * R2: the sample details — everything except the title and the application type, which a project always has.
 * They fill a project whose optional details are all still blank, and never overwrite a real applicant, address,
 * or filing date: the filing date is an analysis input for a vesting rule set, so replacing a real one would
 * quietly change which rules apply. The compare-and-set on the row version makes the blank check and the write
 * one decision.
 */
export async function loadSampleDetails(actor: Actor, decisionId: string, expectedRowVersion: number) {
  const current = await getDecision(actor, decisionId);
  if (current.rowVersion !== expectedRowVersion) {
    throw new ConflictError("This project changed since you loaded it. Reload and try again.");
  }
  const alreadyRecorded = [
    current.parcelOrAddress,
    current.applicant,
    current.projectManager,
    current.targetDecisionOn,
    current.applicationFiledOn,
  ].some((value) => value !== null);
  if (alreadyRecorded) {
    throw new ValidationError("Sample details fill a project whose details are still blank. Clear them first, or edit them by hand.");
  }
  return updateDecisionDetails(
    actor,
    decisionId,
    {
      parcelOrAddress: SAMPLE_DETAILS.parcelOrAddress,
      applicant: SAMPLE_DETAILS.applicant,
      projectManager: SAMPLE_DETAILS.projectManager,
      targetDecisionOn: SAMPLE_DETAILS.targetDecisionOn,
      applicationFiledOn: SAMPLE_DETAILS.applicationFiledOn,
    },
    expectedRowVersion,
  );
}
