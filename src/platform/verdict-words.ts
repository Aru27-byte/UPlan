// TechDesign/ai-assist.md K4 and Requirements/research-phases.md R3. The words that carry a verdict or a
// ranking. The same list checks a model's answer and a section version before it is stored, so no code path
// can adopt a section that decides for the planner (F24 R6).
//
// It sits in `platform` because two modules need it and neither may import the other: `assist` imports
// `workflow`, so `workflow` cannot import `assist`, and lint forbids a module reaching past another's
// `index.ts`. This file imports nothing, which keeps it safe for both.

const VERDICT_DENYLIST: RegExp[] = [
  /\bapprov(?:e|es|ed|al|ing)\b/i,
  /\bden(?:y|ies|ied|ial)\b/i,
  /\brecommend\w*/i,
  /\bclear(?:s|ed|ance)?\b/i, // "clearing" (what a proposal does to land) is not a verdict
  /\bsafe(?:ly|ty)?\b/i,
  /\bacceptable\b/i,
  /\bno stud(?:y|ies)\b/i,
  /\bnot needed\b/i,
  /\bshould\b/i,
  /\bmust\b/i,
  /\bshall\b/i,
  /\bconditions?\b/i,
  /\brank(?:s|ed|ing)?\b/i,
  /\bscor(?:e|es|ed|ing)\b/i,
];

export function verdictWordIn(text: string): string | null {
  for (const pattern of VERDICT_DENYLIST) {
    const m = pattern.exec(text);
    if (m) return m[0];
  }
  return null;
}
