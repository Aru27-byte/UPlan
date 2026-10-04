import type { FeedbackStep } from "@/modules/workflow";

// Which section of the final document each step feeds (research-phases.md R15). The headings are the <h2>s
// in src/modules/reports/document.tsx; this is the one place the step-to-heading mapping lives. Site and
// Footprint share one section because the document draws the study area and the footprint on one map.
export type ReportSectionInfo = { heading: string; description: string };

export const REPORT_SECTIONS: Record<FeedbackStep, ReportSectionInfo[]> = {
  overview: [
    {
      heading: "Cover and project details",
      description: "The title, the application, the parcel, the applicant, and the dates the document opens with.",
    },
    {
      heading: "Rules and boundaries this document uses",
      description: "Each rule set the analysis used, the date it was resolved for, and why, with the city profile version.",
    },
  ],
  site: [
    {
      heading: "Site and footprint",
      description: "The study area drawn to scale on a map, with a drafted description of its boundary.",
    },
  ],
  evidence: [
    {
      heading: "Evidence base",
      description: "The mapped evidence for each resource type, where sources disagree, and the planner's recorded reasoning.",
    },
    {
      heading: "Source register",
      description: "Every dataset and rule the document cites, with its source, date, and confidence.",
    },
  ],
  screening: [
    {
      heading: "Screening register",
      description: "What mapped data shows in and near the study area for each resource type, and where it has no data.",
    },
  ],
  studies: [
    {
      heading: "Studies",
      description: "Each study the city's profile names and whether mapped data flags it.",
    },
  ],
  footprint: [
    {
      heading: "Site and footprint",
      description: "The traced proposal footprint drawn over the study area, with its measured area.",
    },
  ],
  impact: [
    {
      heading: "Impact",
      description: "What the footprint would remove or disturb for each regulated resource and buffer.",
    },
    {
      heading: "What desk analysis can't see",
      description: "The limits that apply to every figure in the document.",
    },
  ],
};
