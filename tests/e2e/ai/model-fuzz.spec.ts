import "../support/placeholder-env";

import { expect, test } from "@playwright/test";

import { checkOutput, normalizeForQuote } from "../../../src/modules/assist/checks";
import { ASSISTS } from "../../../src/modules/assist/kinds";
import { digitRuns, numbersInRequest } from "../../../src/modules/assist/request";
import { HONEST, type Case } from "../support/ai-corpus";
import { sample } from "../support/ai-cases";

// Mutation testing of the checks. Take an answer that is true and shown, change one thing about it the way a model
// might get it wrong, and the checks must notice. The mutations are seeded, so a failure is reproducible:
//   digit        change one digit in the model's own words        -> rejected unless the new number was also sent
//   quote        change one character inside a quote              -> rejected unless it is still in the passage
//   verdict      insert a verdict word into the model's words     -> always rejected
//   truncate     cut the answer short, as a token limit would     -> always rejected
//   key          misspell one key of the shape                    -> always rejected
//   reference    point at a record that was not sent              -> always rejected
//   case         upper-case a quote                               -> rejected unless it has no letters
// and the reverse: the things that must NOT change a verdict.
//   format       pretty-print, fence, pad with whitespace or a BOM -> still accepted
//   order        reverse every list whose order carries no meaning -> still accepted
// The oracle for the first two is written here from the rules, not read from the checks, so the two can disagree.

type Json = null | boolean | number | string | Json[] | { [K in string]: Json };
const isObject = (x: Json): x is Record<string, Json> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

function rng(seed: number): () => number {
  // mulberry32: small, fast, and the same sequence on every machine.
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A JSON value as text: strings as they are, anything else as JSON, never "[object Object]". */
const str = (x: Json | undefined): string => (typeof x === "string" ? x : JSON.stringify(x ?? null));
const pick = <T>(random: () => number, items: T[]): T | undefined =>
  items[Math.floor(random() * items.length)];

type Slot<T> = { get: () => T; set: (value: T) => void };

/** The strings the model wrote in its own words: text, gloss, and value outside any quote, and notStated entries. */
function proseSlots(root: Json): Slot<string>[] {
  const slots: Slot<string>[] = [];
  const visit = (node: Json, inQuote: boolean): void => {
    if (Array.isArray(node)) node.forEach((item) => visit(item, inQuote));
    else if (isObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        const quoteKey = key === "quote" || key === "quotes";
        if (
          !inQuote &&
          !quoteKey &&
          (key === "text" || key === "gloss" || key === "value") &&
          typeof value === "string"
        ) {
          slots.push({ get: () => str(node[key]), set: (v) => void (node[key] = v) });
        } else if (!inQuote && key === "notStated" && Array.isArray(value)) {
          value.forEach((_, i) => slots.push({ get: () => str(value[i]), set: (v) => void (value[i] = v) }));
        } else visit(value, inQuote || quoteKey);
      }
    }
  };
  visit(root, false);
  return slots;
}

/** The quote objects: { sourceId, text }. */
function quoteSlots(root: Json): { quote: Record<string, Json> }[] {
  const found: { quote: Record<string, Json> }[] = [];
  const visit = (node: Json, inQuote: boolean): void => {
    if (Array.isArray(node)) node.forEach((item) => visit(item, inQuote));
    else if (isObject(node)) {
      if (inQuote && typeof node.text === "string") found.push({ quote: node });
      for (const [key, value] of Object.entries(node))
        visit(value, inQuote || key === "quote" || key === "quotes");
    }
  };
  visit(root, false);
  return found;
}

/** Every place the answer names a record: restated ids and a question's basis. */
function refSlots(root: Json): Slot<string>[] {
  const slots: Slot<string>[] = [];
  const visit = (node: Json): void => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (isObject(node)) {
      if (Array.isArray(node.restates)) {
        const list = node.restates;
        list.forEach((_, i) => slots.push({ get: () => str(list[i]), set: (v) => void (list[i] = v) }));
      }
      const basis = node.basis ?? null;
      if (isObject(basis) && typeof basis.ref === "string")
        slots.push({ get: () => str(basis.ref), set: (v) => void (basis.ref = v) });
      for (const value of Object.values(node)) if (value !== undefined) visit(value);
    }
  };
  visit(root);
  return slots;
}

function keyNames(root: Json): { holder: Record<string, Json>; key: string }[] {
  const out: { holder: Record<string, Json>; key: string }[] = [];
  const visit = (node: Json): void => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (isObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        out.push({ holder: node, key });
        visit(value);
      }
    }
  };
  visit(root);
  return out;
}

const objects = HONEST.filter(
  (c): c is Case & { output: Json } => typeof c.output === "object" && c.output !== null,
);
const run = (c: Case, output: unknown) =>
  checkOutput({
    assist: ASSISTS[c.assistId],
    request: c.req,
    rawText: typeof output === "string" ? output : JSON.stringify(output),
    baseDocument: c.withProfile ? sample : null,
  });
const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i);
const clone = (x: Json): Json => structuredClone(x);

test.describe("the honest corpus is the baseline", () => {
  test("every honest answer is accepted before it is touched", () => {
    expect(objects.length).toBeGreaterThanOrEqual(10);
    for (const c of HONEST) expect(run(c, c.output).ok, c.name).toBe(true);
  });
});

test.describe("a changed digit is caught whenever the new number was not sent", () => {
  for (const c of objects) {
    const slots = proseSlots(c.output);
    if (!slots.some((s) => /\d/.test(s.get()))) continue;
    test(`${c.name}`, () => {
      const allowed = numbersInRequest(c.req);
      let mutated = 0;
      let notSent = 0;
      for (const seed of SEEDS) {
        const random = rng(seed);
        const copy = clone(c.output);
        const withDigits = proseSlots(copy).filter((s) => /\d/.test(s.get()));
        const slot = pick(random, withDigits);
        if (!slot) continue;
        const text = slot.get();
        const spots = [...text.matchAll(/\d/g)].map((m) => m.index ?? 0);
        const at = pick(random, spots);
        if (at === undefined) continue;
        const replacement = String((Number(text[at]) + 1 + Math.floor(random() * 8)) % 10);
        slot.set(`${text.slice(0, at)}${replacement}${text.slice(at + 1)}`);
        mutated += 1;
        const unsent = proseSlots(copy)
          .flatMap((s) => digitRuns(s.get()))
          .some((r) => !allowed.has(r));
        if (unsent) {
          notSent += 1;
          expect(run(c, copy).ok, `seed ${seed}: ${JSON.stringify(copy)}`).toBe(false);
        }
      }
      expect(mutated).toBeGreaterThan(0);
      expect(notSent, "at least some mutations produced a number that was never sent").toBeGreaterThan(0);
    });
  }
});

test.describe("a changed character in a quote is caught whenever the quote is no longer in its passage", () => {
  for (const c of objects) {
    if (quoteSlots(c.output).length === 0) continue;
    test(`${c.name}`, () => {
      const passage = new Map(c.req.passages.map((p) => [p.id, p.text]));
      let caught = 0;
      for (const seed of SEEDS) {
        const random = rng(seed);
        const copy = clone(c.output);
        const slot = pick(random, quoteSlots(copy));
        if (!slot) continue;
        const text = str(slot.quote.text);
        const at = Math.floor(random() * text.length);
        const how = Math.floor(random() * 3);
        const mutated =
          how === 0
            ? `${text.slice(0, at)}Z${text.slice(at + 1)}`
            : how === 1
              ? `${text.slice(0, at)}${text.slice(at + 1)}`
              : `${text.slice(0, at)}Q${text.slice(at)}`;
        slot.quote.text = mutated;
        const source = passage.get(str(slot.quote.sourceId)) ?? "";
        const stillThere =
          normalizeForQuote(mutated).length >= 4 &&
          normalizeForQuote(source).includes(normalizeForQuote(mutated));
        if (!stillThere && mutated.length > 0) {
          caught += 1;
          expect(run(c, copy).ok, `seed ${seed}: "${mutated}"`).toBe(false);
        }
      }
      expect(caught).toBeGreaterThan(0);
    });
  }

  for (const c of objects) {
    if (quoteSlots(c.output).length === 0) continue;
    test(`upper-casing a quote is caught: ${c.name}`, () => {
      const copy = clone(c.output);
      const slot = quoteSlots(copy)[0];
      if (!slot) throw new Error("no quote");
      const original = str(slot.quote.text);
      slot.quote.text = original.toUpperCase();
      const hasLetters = original !== original.toUpperCase();
      expect(run(c, copy).ok).toBe(!hasLetters);
    });
  }
});

test.describe("a verdict word written into the model's own words is always caught", () => {
  const WORDS = [
    "approved",
    "denied",
    "recommend",
    "safe",
    "acceptable",
    "should",
    "must",
    "ranked",
    "cleared",
    "no study needed",
    "condition",
  ];
  for (const c of objects) {
    if (proseSlots(c.output).length === 0) continue;
    test(`${c.name}`, () => {
      for (const seed of SEEDS) {
        const random = rng(seed);
        const copy = clone(c.output);
        const slot = pick(random, proseSlots(copy));
        if (!slot) continue;
        const word = pick(random, WORDS) ?? "approved";
        const text = slot.get();
        const at = Math.floor(random() * (text.length + 1));
        slot.set(`${text.slice(0, at)} ${word} ${text.slice(at)}`);
        expect(run(c, copy).ok, `seed ${seed}: inserted "${word}"`).toBe(false);
      }
    });
  }
});

test.describe("a cut-off answer is never accepted", () => {
  for (const c of objects) {
    test(`${c.name}`, () => {
      const raw = JSON.stringify(c.output);
      for (const seed of SEEDS) {
        const cut = Math.floor(rng(seed)() * (raw.length - 1));
        expect(run(c, raw.slice(0, cut)).ok, `seed ${seed}: cut at ${cut} of ${raw.length}`).toBe(false);
      }
      expect(run(c, raw.slice(0, raw.length - 1)).ok, "everything but the last brace").toBe(false);
    });
  }
});

test.describe("a misspelled key is always caught", () => {
  for (const c of objects) {
    test(`${c.name}`, () => {
      const total = keyNames(c.output).length;
      expect(total).toBeGreaterThan(0);
      for (let i = 0; i < total; i += 1) {
        const copy = clone(c.output);
        const target = keyNames(copy)[i];
        if (!target) continue;
        const value = target.holder[target.key] ?? null;
        delete target.holder[target.key];
        target.holder[`${target.key}X`] = value;
        const result = run(c, copy);
        // Renaming a key that is optional on a question's quote leaves a stray key: also caught, as an unknown key.
        expect(result.ok, `renamed "${target.key}" in ${JSON.stringify(copy)}`).toBe(false);
        if (!result.ok) expect(result.failures[0]?.check, `renamed "${target.key}"`).toBe("K1");
      }
    });
  }
});

test.describe("a reference to a record that was not sent is always caught", () => {
  for (const c of objects) {
    if (refSlots(c.output).length === 0) continue;
    test(`${c.name}`, () => {
      const n = refSlots(c.output).length;
      for (let i = 0; i < n; i += 1) {
        const copy = clone(c.output);
        refSlots(copy)[i]?.set("nothing:99");
        const result = run(c, copy);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failures[0]?.check).toBe("K5");
      }
    });
  }
});

test.describe("changes of form that must not change the verdict", () => {
  for (const c of objects) {
    test(`${c.name}: the same answer pretty-printed, fenced, padded, or behind a byte-order mark is still accepted`, () => {
      const compact = JSON.stringify(c.output);
      const forms = [
        JSON.stringify(c.output, null, 2),
        JSON.stringify(c.output, null, "\t"),
        `\n\n${compact}\n\n`,
        `\uFEFF${compact}`,
        `\`\`\`json\n${compact}\n\`\`\``,
        `\`\`\`\n${JSON.stringify(c.output, null, 2)}\n\`\`\``,
      ];
      for (const form of forms) expect(run(c, form).ok, form.slice(0, 40)).toBe(true);
    });

    test(`${c.name}: reversing every list whose order carries no meaning is still accepted`, () => {
      const copy = clone(c.output);
      const reverse = (node: Json): void => {
        if (Array.isArray(node)) {
          node.reverse();
          node.forEach(reverse);
        } else if (isObject(node)) Object.values(node).forEach(reverse);
      };
      reverse(copy);
      expect(run(c, copy).ok).toBe(true);
    });

    test(`${c.name}: the order of keys does not matter`, () => {
      const reorder = (node: Json): Json => {
        if (Array.isArray(node)) return node.map(reorder);
        if (isObject(node))
          return Object.fromEntries(
            Object.entries(node)
              .reverse()
              .map(([k, v]) => [k, reorder(v)]),
          );
        return node;
      };
      expect(run(c, reorder(c.output)).ok).toBe(true);
    });
  }
});

test.describe("the checks are deterministic", () => {
  test("the same answer, checked 200 times, gives the same verdict every time", () => {
    for (const c of HONEST) {
      const first = JSON.stringify(run(c, c.output));
      for (let i = 0; i < 200; i += 1) expect(JSON.stringify(run(c, c.output))).toBe(first);
    }
  });
});
