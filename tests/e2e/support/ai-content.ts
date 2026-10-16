import type { SuggestionContent } from "../../../src/modules/assist/kinds";

// Readers over a checked answer, shared by the golden cases and the edge cases. They read only: a case decides
// what is right, these just say what the model wrote.

type Json = null | boolean | number | string | Json[] | { [K in string]: Json };
const isObject = (x: Json): x is Record<string, Json> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** The model's own words: text, gloss, and value outside any quote, and each notStated entry. */
export function proseOf(content: SuggestionContent): string[] {
  const out: string[] = [];
  const visit = (node: Json, inQuote: boolean): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item, inQuote);
    } else if (isObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        const quoteKey = key === "quote" || key === "quotes";
        if (
          !inQuote &&
          !quoteKey &&
          (key === "text" || key === "gloss" || key === "value") &&
          typeof value === "string"
        )
          out.push(value);
        else if (!inQuote && key === "notStated" && Array.isArray(value))
          for (const s of value)
            if (typeof s === "string") out.push(s);
            else visit(value, inQuote || quoteKey);
      }
    }
  };
  visit(JSON.parse(JSON.stringify(content)) as Json, false);
  return out;
}

/** Every quote, with the passage it names. */
export function quotesOf(content: SuggestionContent): { sourceId: string; text: string }[] {
  const out: { sourceId: string; text: string }[] = [];
  const visit = (node: Json, inQuote: boolean): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item, inQuote);
    } else if (isObject(node)) {
      if (inQuote && typeof node.text === "string" && typeof node.sourceId === "string")
        out.push({ sourceId: node.sourceId, text: node.text });
      for (const [key, value] of Object.entries(node))
        visit(value, inQuote || key === "quote" || key === "quotes");
    }
  };
  visit(JSON.parse(JSON.stringify(content)) as Json, false);
  return out;
}

/** Everything the model wrote, prose and quotes, as one string for a "does it mention" test. */
export const everythingIn = (content: SuggestionContent): string => JSON.stringify(content);

export const isFoundTrue = (c: SuggestionContent): c is Extract<SuggestionContent, { found: true }> =>
  "found" in c && c.found === true;
export const isFoundFalse = (c: SuggestionContent): boolean => "found" in c && c.found === false;
