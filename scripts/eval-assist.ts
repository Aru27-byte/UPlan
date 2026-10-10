// The AI assist evaluation set (TechDesign/ai-assist.md, F24 R16). A change to a model id, a prompt, a shape, or a
// retrieval setting ships only if no number below gets worse.
//
//   npm run eval:assist
//
// Two parts. The first needs no key and no network: planted failures (an invented number, a verdict, a quote
// that is not there, a rule draft that edits a setting) must each be REJECTED by the checks. The second runs only
// when NVIDIA_API_KEY is set: golden questions go to the real model service with fixed passages, and the answer
// must pass every check and contain the expected quote. It sends public text only, never a real project's data.
import { checkOutput } from "../src/modules/assist/checks";
import { ASSISTS, type AssistId } from "../src/modules/assist/kinds";
import { buildMessages } from "../src/modules/assist/prompts";
import { AssistRequestSchema, type AssistRequest } from "../src/modules/assist/request";
import { chat, isModelConfigured } from "../src/platform/model-client";

function request(assistId: AssistId, parts: Partial<AssistRequest>): AssistRequest {
  const def = ASSISTS[assistId];
  return AssistRequestSchema.parse({
    assistId,
    kind: def.kind,
    promptVersion: def.promptVersion,
    task: def.task,
    question: null,
    passages: [],
    refs: [],
    ruleValues: [],
    ...parts,
  });
}

const CODE = [
  { id: "chunk:1", label: "21A.50.290", text: "The standard buffer for a Category II wetland is 100 feet measured from the wetland edge." },
  { id: "chunk:2", label: "21A.50.300", text: "A buffer of 150 feet shall be maintained from a Type F stream." },
];

const planted: { name: string; assistId: AssistId; req: AssistRequest; answer: unknown; expectCheck: string }[] = [
  {
    name: "invented number",
    assistId: "EV1",
    req: request("EV1", { passages: [{ id: "line:0", label: "Drafted line 0", text: "Wetlands: 2 features, 1.84 acres." }], refs: [{ id: "line:0", kind: "line" }] }),
    answer: { paragraphs: [{ text: "About 2 acres, 80,000 square feet.", restates: ["line:0"], quotes: [] }] },
    expectCheck: "K3",
  },
  {
    name: "verdict",
    assistId: "EV1",
    req: request("EV1", { passages: [{ id: "line:0", label: "Drafted line 0", text: "Wetlands: 2 features." }], refs: [{ id: "line:0", kind: "line" }] }),
    answer: { paragraphs: [{ text: "This site should be approved.", restates: ["line:0"], quotes: [] }] },
    expectCheck: "K4",
  },
  {
    name: "quote not in the passage",
    assistId: "SC3",
    req: request("SC3", { question: "What buffer applies to wetlands?", passages: CODE }),
    answer: { found: true, passages: [{ sectionPath: "21A.50.290", quote: { sourceId: "chunk:1", text: "a buffer of two hundred feet" } }] },
    expectCheck: "K2",
  },
  {
    name: "question phrased as a requirement",
    assistId: "SC2",
    req: request("SC2", { passages: [{ id: "gap:1", label: "Gap", text: "No dataset is mapped for streams." }], refs: [{ id: "gap:1", kind: "gap" }] }),
    answer: { questions: [{ text: "Ensure a stream survey is done?", basis: { kind: "gap", ref: "gap:1" } }] },
    expectCheck: "K6",
  },
  {
    name: "reference to a record that was not sent",
    assistId: "SC2",
    req: request("SC2", { passages: [{ id: "gap:1", label: "Gap", text: "No dataset is mapped for streams." }], refs: [{ id: "gap:1", kind: "gap" }] }),
    answer: { questions: [{ text: "What is mapped nearby?", basis: { kind: "gap", ref: "gap:9" } }] },
    expectCheck: "K5",
  },
];

const golden: { name: string; assistId: AssistId; req: AssistRequest; expectIn: string }[] = [
  {
    name: "find the wetland buffer",
    assistId: "SC3",
    req: request("SC3", { question: "Which passage of the code sets the buffer for wetlands?", passages: CODE }),
    expectIn: "100 feet",
  },
  {
    name: "find the stream buffer",
    assistId: "SC3",
    req: request("SC3", { question: "Which passage of the code sets the buffer for streams?", passages: CODE }),
    expectIn: "150 feet",
  },
  {
    name: "say none answers",
    assistId: "PR2",
    req: request("PR2", { question: "What is the speed limit on Main Street?", passages: CODE }),
    expectIn: '"found":false',
  },
  {
    name: "explain a line without changing its figures",
    assistId: "EV1",
    req: request("EV1", {
      passages: [{ id: "line:0", label: "Drafted line 0", text: "Wetlands: mapped in the study area: 2 features, 1.84 acres." }],
      refs: [{ id: "line:0", kind: "line" }],
    }),
    expectIn: "1.84",
  },
];

let failures = 0;
console.log("Planted failures (each must be rejected):");
for (const p of planted) {
  const result = checkOutput({ assist: ASSISTS[p.assistId], request: p.req, rawText: JSON.stringify(p.answer), baseDocument: null });
  const rejectedBy = result.ok ? null : result.failures[0]?.check;
  const pass = rejectedBy === p.expectCheck;
  if (!pass) failures += 1;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${p.name}  (expected ${p.expectCheck}, got ${rejectedBy ?? "accepted"})`);
}

if (!isModelConfigured()) {
  console.log("\nGolden questions: skipped (NVIDIA_API_KEY is not set).");
} else {
  console.log("\nGolden questions (real model service):");
  for (const g of golden) {
    try {
      const answer = await chat(buildMessages(g.req), 800);
      const checked = checkOutput({ assist: ASSISTS[g.assistId], request: g.req, rawText: answer.content, baseDocument: null });
      const pass = checked.ok && JSON.stringify(checked.content).includes(g.expectIn);
      if (!pass) failures += 1;
      console.log(`  ${pass ? "PASS" : "FAIL"}  ${g.name}${checked.ok ? "" : `  (rejected by ${checked.failures[0]?.check}: ${checked.failures[0]?.message})`}`);
    } catch (err) {
      failures += 1;
      console.log(`  FAIL  ${g.name}  (${err instanceof Error ? err.message : String(err)})`);
    }
  }
}

console.log(failures === 0 ? "\nNo metric got worse." : `\n${failures} check(s) failed.`);
// Not process.exit(): on Windows it can fire while a network socket is still closing and crash Node with a
// libuv assertion after the results have printed. Setting the code lets the process end on its own.
process.exitCode = failures === 0 ? 0 : 1;
