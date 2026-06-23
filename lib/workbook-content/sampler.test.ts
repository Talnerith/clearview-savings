import { describe, expect, it } from "vitest";

import { sampleWorkbookContent } from "./index";
import { newWorkbookSeed, sampleWorkbook } from "./sampler";
import type {
  ProblemByCategory,
  WorkbookCategory,
  WorkbookGrade,
  WorkbookKind,
} from "./types";

// Minimal fake bank. The sampler only reads `id` per problem (to assemble
// pages); the rest of the shape doesn't matter for sampler behavior. A 50-
// problem pool per category mirrors the production bank size and is enough
// to cover the largest page-shape demand (math kind: 8+8+6 = 22 math-facts).
function fakeBank<C extends WorkbookCategory>(
  _grade: WorkbookGrade,
  category: C,
): readonly ProblemByCategory[C][] {
  const stubs = Array.from({ length: 50 }, (_, i) => ({
    id: `${category}-${i.toString().padStart(2, "0")}`,
  }));
  return stubs as unknown as readonly ProblemByCategory[C][];
}

const ALL_KINDS: readonly WorkbookKind[] = ["math", "reading", "mixed"];

describe("sampleWorkbook", () => {
  it("is deterministic for a fixed seed", () => {
    const a = sampleWorkbook({
      kind: "mixed",
      grade: 2,
      seed: "fixed-seed",
      getBank: fakeBank,
    });
    const b = sampleWorkbook({
      kind: "mixed",
      grade: 2,
      seed: "fixed-seed",
      getBank: fakeBank,
    });
    expect(a).toEqual(b);
  });

  it("produces different picks for different seeds", () => {
    const a = sampleWorkbook({
      kind: "mixed",
      grade: 2,
      seed: "seed-1",
      getBank: fakeBank,
    });
    const b = sampleWorkbook({
      kind: "mixed",
      grade: 2,
      seed: "seed-2",
      getBank: fakeBank,
    });
    expect(a).not.toEqual(b);
  });

  it.each(ALL_KINDS)(
    "%s workbook contains no duplicate problem ids across its pages",
    (kind) => {
      const sample = sampleWorkbook({
        kind,
        grade: 2,
        seed: "dedup-test",
        getBank: fakeBank,
      });
      const ids = sample.pages.flatMap((page) =>
        page.problems.map((p) => p.id),
      );
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it("respects the page count and per-page sizes for each kind", () => {
    // Loose contract: every kind produces 5 pages, every page non-empty.
    // This guards against accidental PAGE_SHAPES edits that quietly drop a
    // page or zero a count.
    for (const kind of ALL_KINDS) {
      const sample = sampleWorkbook({
        kind,
        grade: 2,
        seed: "shape-test",
        getBank: fakeBank,
      });
      expect(sample.pages.length, `kind=${kind}`).toBe(5);
      for (const page of sample.pages) {
        expect(page.problems.length, `kind=${kind}`).toBeGreaterThan(0);
      }
    }
  });
});

// The gentler floor (M8 Part A) runs the real K + grade-1 banks through the
// sampler. Total problems a full workbook draws per kind (sum of PAGE_SHAPES
// counts): math 8+3+8+3+6, reading 1+2+1+4+1, mixed 6+1+2+3+2. Hitting these
// totals with no duplicate ids proves the new banks are large enough to fill
// every page shape without starving or repeating.
const EXPECTED_TOTAL: Record<WorkbookKind, number> = {
  math: 28,
  reading: 9,
  mixed: 14,
};

describe.each<WorkbookGrade>([0, 1])(
  "grade-%i real banks fill every page shape",
  (grade) => {
    it.each<WorkbookKind>(["math", "reading", "mixed"])(
      "%s workbook is deterministic, complete, and duplicate-free",
      (kind) => {
        const a = sampleWorkbookContent({ kind, grade, seed: "m8-floor" });
        const b = sampleWorkbookContent({ kind, grade, seed: "m8-floor" });
        expect(a).toEqual(b); // deterministic for a fixed seed

        const ids = a.pages.flatMap((p) => p.problems.map((q) => q.id));
        expect(new Set(ids).size).toBe(ids.length); // no in-workbook dupes
        expect(ids.length).toBe(EXPECTED_TOTAL[kind]); // no starved page
      },
    );
  },
);

describe("newWorkbookSeed", () => {
  it("returns a 32-char lowercase hex string", () => {
    const s = newWorkbookSeed();
    expect(s).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns different values across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(newWorkbookSeed());
    expect(seen.size).toBe(100);
  });
});
