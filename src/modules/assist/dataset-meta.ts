import { getDatasetVersionAttributes, getDatasetVersionProvenance, getDatasetVersionQuality } from "@/modules/evidence";

import type { DatasetMeta } from "./inputs";

/**
 * C2 (ai-assist.md, "What may be sent"): the plain text fields of each dataset version, read from the evidence
 * module's own functions so no query of its tables lives here. Nothing about a project is read.
 */
export async function loadDatasetMeta(versionIds: string[]): Promise<DatasetMeta[]> {
  return Promise.all(
    versionIds.map(async (versionId) => {
      const [provenance, attributes, quality] = await Promise.all([
        getDatasetVersionProvenance(versionId),
        getDatasetVersionAttributes(versionId),
        getDatasetVersionQuality(versionId),
      ]);
      return {
        versionId,
        title: quality.datasetTitle,
        publisher: provenance.publisher,
        license: provenance.license,
        authority: attributes.authority,
        spatialPrecision: attributes.spatialPrecision,
        sourceAsOfOn: quality.sourceAsOfOn,
        sourceAsOfNote: quality.sourceAsOfNote,
        limitation: quality.knownLimitation,
      };
    }),
  );
}
