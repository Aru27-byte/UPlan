import { z } from "zod";

import { chat, isModelConfigured } from "@/platform/model-client";

const ExtractedFieldsSchema = z.object({
  title: z.string().max(200).nullable(),
  parcelOrAddress: z.string().max(300).nullable(),
  applicant: z.string().max(300).nullable(),
  projectManager: z.string().max(300).nullable(),
  applicationFiledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  targetDecisionOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  applicationType: z.enum(["subdivision", "short_subdivision", "clearing_grading"]).nullable(),
});

export type ExtractedFields = z.infer<typeof ExtractedFieldsSchema>;

const SYSTEM_PROMPT = `You are UPlan Assist, which extracts structured project details from land use application documents.
Extract the following fields from the document text. Return ONLY valid JSON matching the schema.
If a field is not found, use null. Do not guess or infer missing information.

Fields:
- title: Project name/title (max 200 chars)
- parcelOrAddress: Parcel number or street address
- applicant: Name of the applicant/developer
- projectManager: Name of the project manager or contact person
- applicationFiledOn: Date in YYYY-MM-DD format
- targetDecisionOn: Target decision date in YYYY-MM-DD format
- applicationType: One of "subdivision", "short_subdivision", "clearing_grading"`;

export async function scanDocument(_actor: { userId: string; isStaff: boolean }, documentText: string): Promise<ExtractedFields> {
  if (!isModelConfigured()) throw new Error("UPlan Assist is not set up for this deployment.");

  const truncated = documentText.slice(0, 15000);
  
  try {
    const result = await chat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Extract fields from this document:\n\n${truncated}` },
    ], 1000);
    
    const parsed = ExtractedFieldsSchema.safeParse(JSON.parse(result.content));
    if (!parsed.success) {
      console.warn("Failed to parse extracted fields:", parsed.error);
      return {
        title: null,
        parcelOrAddress: null,
        applicant: null,
        projectManager: null,
        applicationFiledOn: null,
        targetDecisionOn: null,
        applicationType: null,
      };
    }
    return parsed.data;
  } catch (err) {
    console.error("Document scan failed:", err);
    return {
      title: null,
      parcelOrAddress: null,
      applicant: null,
      projectManager: null,
      applicationFiledOn: null,
      targetDecisionOn: null,
      applicationType: null,
    };
  }
}