import { z } from "zod";

import { chat, isModelConfigured } from "@/platform/model-client";

const DashboardAnswerSchema = z.object({
  answer: z.string().min(1).max(2000),
});

export type DashboardAnswer = z.infer<typeof DashboardAnswerSchema>;

const SYSTEM_PROMPT = `You are UPlan Assist, a research assistant for urban planners using UPlan. 
You have access to a planner's project summaries. Answer their questions based on the project data provided.
Be concise, actionable, and reference specific projects by name when relevant.
If asked about priorities, suggest specific projects and next steps.
If asked about blockers, identify which projects are stuck and why.
Never make up information not in the provided data.`;

export async function answerDashboardQuestion(
  _actor: { userId: string; isStaff: boolean },
  _cityId: string,
  question: string,
): Promise<string> {
  if (!isModelConfigured()) throw new Error("UPlan Assist is not set up for this deployment.");

  // We need to fetch the actual project data for the actor in this city
  // For now, we'll pass the question to the model with a note that it needs context
  // In a full implementation, we'd fetch the project summaries here
  
  try {
    const result = await chat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `The user is asking: "${question}". 

Note: I don't have access to the full project database in this context. Please provide a helpful general response about how UPlan dashboards work, or ask the user to specify which project they're referring to. If they ask about specific projects, suggest they open the project overview for detailed help from UPlan Assist.` },
    ], 800);
    
    const parsed = DashboardAnswerSchema.safeParse(JSON.parse(result.content));
    if (!parsed.success) {
      console.warn("Failed to parse dashboard answer:", parsed.error);
      return "I can help you with questions about your projects. Could you be more specific about what you'd like to know? For detailed project-specific questions, try UPlan Assist on the project's overview page.";
    }
    return parsed.data.answer;
  } catch (err) {
    console.error("Dashboard question failed:", err);
    return "I encountered an error processing your question. Please try again or ask a more specific question about your projects.";
  }
}