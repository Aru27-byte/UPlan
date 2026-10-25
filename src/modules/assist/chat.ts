import { and, eq } from "drizzle-orm";

import type { Actor } from "@/modules/accounts";
import { db } from "@/platform/db";
import { chatMessage } from "./tables";

// F21: persist chat messages for section chat. Both user messages and AI responses are stored.
// User messages link to the suggestion they prompted (or null if AI hasn't responded yet).

export type ChatMessage = {
  id: string;
  decisionId: string;
  phase: string;
  suggestionId: string | null;
  role: "user" | "assistant";
  content: string;
  instruction: string | null;
  createdBy: string;
  createdAt: Date;
};

export async function saveChatMessage(
  actor: Actor,
  decisionId: string,
  phase: string,
  role: "user" | "assistant",
  content: string,
  instruction: string | null,
  suggestionId: string | null,
): Promise<ChatMessage> {
  // Writing history is a write on the project: the same ownership check every read and every other write makes.
  await getDecision(actor, decisionId);
  const [row] = await db
    .insert(chatMessage)
    .values({
      decisionId,
      phase,
      role,
      content,
      instruction,
      suggestionId,
      createdBy: actor.userId,
    })
    .returning();
  if (!row) throw new Error("Failed to insert chat message");
  return toChatMessage(row);
}

export async function listChatMessages(
  actor: Actor,
  decisionId: string,
  phase: string,
): Promise<ChatMessage[]> {
  await getDecision(actor, decisionId);
  const rows = await db
    .select()
    .from(chatMessage)
    .where(and(eq(chatMessage.decisionId, decisionId), eq(chatMessage.phase, phase)))
    .orderBy(chatMessage.createdAt, chatMessage.id);
  return rows.map(toChatMessage);
}

function toChatMessage(row: typeof chatMessage.$inferSelect): ChatMessage {
  return {
    id: row.id,
    decisionId: row.decisionId,
    phase: row.phase,
    suggestionId: row.suggestionId,
    role: row.role as "user" | "assistant",
    content: row.content,
    instruction: row.instruction,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

// Import getDecision to avoid circular dependency
import { getDecision } from "@/modules/decisions";