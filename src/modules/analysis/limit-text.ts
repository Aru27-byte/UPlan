import type { Limit } from "./results";

// The one place a `Limit` becomes a sentence (research-phases.md R13). The Impact page, the phase
// summaries, and the document all call this, so there is one wording of each limit, and none of it is
// generated: a fixed template over a keyed fact. What desk analysis can't see is stated plainly (P1, P2).

export type LimitContext = {
  /** The profile's label for the limit's resource type, when it has one. */
  resourceLabel: string | null;
  /** The dataset's own recorded limitation (F3 R10), for a `dataset-limitation`. */
  datasetLimitation: string | null;
};

export function describeLimit(limit: Limit, context: LimitContext): string {
  switch (limit.key) {
    case "significant-trees-not-countable":
      return "How many significant trees the proposal would remove can't be determined from remote data: canopy data shows extent, not trunk diameters.";
    case "boundary-set-by-site-study": {
      const subject = context.resourceLabel ?? limit.resourceType ?? "This resource type";
      return `${subject}: the mapped boundary is approximate, and a site-specific study sets the regulated boundary.`;
    }
    case "dataset-limitation": {
      const subject = context.resourceLabel ?? limit.resourceType ?? "This dataset";
      if (context.datasetLimitation === null) {
        throw new Error(`a dataset-limitation for ${subject} has no recorded limitation to state`);
      }
      return `${subject}: ${context.datasetLimitation}`;
    }
  }
}
