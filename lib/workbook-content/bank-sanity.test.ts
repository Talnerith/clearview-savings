import { describe, expect, it } from "vitest";

import { getProblemBank } from "./index";
import type { WorkbookCategory, WorkbookGrade } from "./types";

const GRADES: readonly WorkbookGrade[] = [0, 1, 2, 3];

// The largest number of problems a single workbook can draw from one
// category, summed across the pages of whichever kind demands the most (see
// PAGE_SHAPES in sampler.ts): math kind takes 8+8+6 math-facts and 3+3
// word-problems; reading kind takes 1+1+1 passages, 2 sequencing, 4 logic.
// A bank smaller than its number here would starve the sampler / force a
// duplicate, so every grade must meet it.
const MIN_BANK_SIZE: Record<WorkbookCategory, number> = {
  "math-facts": 22,
  "word-problems": 6,
  "reading-passages": 3,
  "sequencing": 2,
  // copy-shape replaced sequencing in PAGE_SHAPES; reading and mixed each draw
  // 2 on a single page, so the bank must hold at least 2 (ADR 0007).
  "copy-shape": 2,
  "simple-logic": 4,
};

describe.each(GRADES)("grade-%i bank sizes fill the page shapes", (grade) => {
  it.each(Object.entries(MIN_BANK_SIZE))(
    "%s holds at least the max single-workbook draw",
    (category, min) => {
      const bank = getProblemBank(grade, category as WorkbookCategory);
      expect(bank.length).toBeGreaterThanOrEqual(min);
    },
  );
});

// Operator alphabet is intentionally typographic — U+2212 MINUS SIGN, U+00D7
// MULTIPLICATION SIGN, U+00F7 DIVISION SIGN. The parser must accept these
// directly; normalizing to ASCII '-' / '*' / '/' would mask a regression
// where the bank stopped using the canonical glyphs (which the PDF then
// substitutes at draw time via pdfSafe()).
const OPERATORS = {
  "+": (a: number, b: number) => a + b,
  "−": (a: number, b: number) => a - b,
  "×": (a: number, b: number) => a * b,
  "÷": (a: number, b: number) => a / b,
} as const;
type Operator = keyof typeof OPERATORS;

function parseMathPrompt(
  prompt: string,
): { a: number; op: Operator; b: number } | null {
  const m = prompt.match(/^(\d+)\s+([+−×÷])\s+(\d+)\s*=/);
  if (!m) return null;
  return { a: Number(m[1]), op: m[2] as Operator, b: Number(m[3]) };
}

describe.each(GRADES)("grade-%i math-facts bank", (grade) => {
  const bank = getProblemBank(grade, "math-facts");

  it("is non-empty", () => {
    expect(bank.length).toBeGreaterThan(0);
  });

  it("every prompt parses to NUM OP NUM = ...", () => {
    for (const p of bank) {
      const parsed = parseMathPrompt(p.prompt);
      expect(parsed, `id=${p.id} prompt=${JSON.stringify(p.prompt)}`).not.toBeNull();
    }
  });

  it("every parsed prompt computes to its stored answer", () => {
    for (const p of bank) {
      const parsed = parseMathPrompt(p.prompt);
      if (!parsed) continue;
      const computed = OPERATORS[parsed.op](parsed.a, parsed.b);
      expect(
        String(computed),
        `id=${p.id} prompt=${JSON.stringify(p.prompt)}`,
      ).toBe(p.answer);
    }
  });

  it("every id is unique within the bank", () => {
    const ids = bank.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(GRADES)("grade-%i word-problems bank", (grade) => {
  const bank = getProblemBank(grade, "word-problems");

  it("is non-empty", () => {
    expect(bank.length).toBeGreaterThan(0);
  });

  it("every problem has non-empty prompt and answer", () => {
    for (const p of bank) {
      expect(p.prompt.trim(), `id=${p.id}`).not.toEqual("");
      expect(p.answer.trim(), `id=${p.id}`).not.toEqual("");
    }
  });

  it("every id is unique within the bank", () => {
    const ids = bank.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(GRADES)("grade-%i reading-passages bank", (grade) => {
  const bank = getProblemBank(grade, "reading-passages");

  it("is non-empty", () => {
    expect(bank.length).toBeGreaterThan(0);
  });

  it("every passage has non-empty body and ≥1 q/a", () => {
    for (const p of bank) {
      expect(p.passage.trim(), `id=${p.id}`).not.toEqual("");
      expect(p.questions.length, `id=${p.id}`).toBeGreaterThanOrEqual(1);
      for (const q of p.questions) {
        expect(q.q.trim(), `id=${p.id}`).not.toEqual("");
        expect(q.a.trim(), `id=${p.id}`).not.toEqual("");
      }
    }
  });

  it("every id is unique within the bank", () => {
    const ids = bank.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(GRADES)("grade-%i sequencing bank", (grade) => {
  const bank = getProblemBank(grade, "sequencing");

  it("is non-empty", () => {
    expect(bank.length).toBeGreaterThan(0);
  });

  it("every problem has a non-empty prompt and ≥4 steps", () => {
    for (const p of bank) {
      expect(p.prompt.trim(), `id=${p.id}`).not.toEqual("");
      expect(p.correctSequence.length, `id=${p.id}`).toBeGreaterThanOrEqual(4);
      for (const step of p.correctSequence) {
        expect(step.trim(), `id=${p.id}`).not.toEqual("");
      }
    }
  });

  it("every id is unique within the bank", () => {
    const ids = bank.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// Coordinates live in a 0 0 100 100 viewBox; flag anything that escapes it so
// a fat-fingered point can't silently clip outside the printed/answer-key box.
const SHAPE_ELEMENT_TYPES = [
  "line",
  "polyline",
  "polygon",
  "circle",
  "ellipse",
  "rect",
  "path",
];

function pointsInRange(points: string): boolean {
  const nums = points.trim().split(/[\s,]+/).map(Number);
  return nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 100);
}

describe.each(GRADES)("grade-%i copy-shape bank", (grade) => {
  const bank = getProblemBank(grade, "copy-shape");

  it("is non-empty", () => {
    expect(bank.length).toBeGreaterThan(0);
  });

  it("every problem has a prompt, a name, and ≥1 element", () => {
    for (const p of bank) {
      expect(p.prompt.trim(), `id=${p.id}`).not.toEqual("");
      expect(p.name.trim(), `id=${p.id}`).not.toEqual("");
      expect(p.elements.length, `id=${p.id}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("every element is a known type with in-range coordinates", () => {
    for (const p of bank) {
      for (const el of p.elements) {
        expect(SHAPE_ELEMENT_TYPES, `id=${p.id}`).toContain(el.type);
        if (el.type === "polyline" || el.type === "polygon") {
          expect(pointsInRange(el.points), `id=${p.id} points`).toBe(true);
        } else if (el.type === "line") {
          for (const n of [el.x1, el.y1, el.x2, el.y2]) {
            expect(n, `id=${p.id} line`).toBeGreaterThanOrEqual(0);
            expect(n, `id=${p.id} line`).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });

  it("every id is unique within the bank", () => {
    const ids = bank.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(GRADES)("grade-%i simple-logic bank", (grade) => {
  const bank = getProblemBank(grade, "simple-logic");

  it("is non-empty", () => {
    expect(bank.length).toBeGreaterThan(0);
  });

  it("every problem has non-empty prompt and answer", () => {
    for (const p of bank) {
      expect(p.prompt.trim(), `id=${p.id}`).not.toEqual("");
      expect(p.answer.trim(), `id=${p.id}`).not.toEqual("");
    }
  });

  it("every id is unique within the bank", () => {
    const ids = bank.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
