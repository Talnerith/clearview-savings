import type {
  Problem,
  ProblemByCategory,
  WorkbookCategory,
  WorkbookGrade,
  WorkbookKind,
  WorkbookPage,
  WorkbookSample,
} from "./types";

// Deterministic seeded RNG: xmur3 (string → 32-bit hash) feeds mulberry32.
// Same seed string → same shuffle → same picked problems. This is what
// guarantees the printed PDF and the answer-key view always match.
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed: string): () => number {
  const seedFn = xmur3(seed);
  return mulberry32(seedFn());
}

export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

// Generate a random workbook seed string. Used at workbook creation time;
// stored in content_seed alongside the resolved problems for traceability.
export function newWorkbookSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Per-kind page shape. 5 content pages per workbook; tuned per kind so the
// patient sees a sensible mix that fills 4-6 pages with generous whitespace.
type PageSpec = { category: WorkbookCategory; count: number };

const PAGE_SHAPES: Record<WorkbookKind, PageSpec[]> = {
  math: [
    { category: "math-facts", count: 8 },
    { category: "word-problems", count: 3 },
    { category: "math-facts", count: 8 },
    { category: "word-problems", count: 3 },
    { category: "math-facts", count: 6 },
  ],
  reading: [
    { category: "reading-passages", count: 1 },
    { category: "sequencing", count: 2 },
    { category: "reading-passages", count: 1 },
    { category: "simple-logic", count: 4 },
    { category: "reading-passages", count: 1 },
  ],
  mixed: [
    { category: "math-facts", count: 6 },
    { category: "reading-passages", count: 1 },
    { category: "word-problems", count: 2 },
    { category: "simple-logic", count: 3 },
    { category: "sequencing", count: 2 },
  ],
};

type ProblemBankResolver = <C extends WorkbookCategory>(
  grade: WorkbookGrade,
  category: C,
) => readonly ProblemByCategory[C][];

export function sampleWorkbook({
  kind,
  grade,
  seed,
  getBank,
}: {
  kind: WorkbookKind;
  grade: WorkbookGrade;
  seed: string;
  getBank: ProblemBankResolver;
}): WorkbookSample {
  const rng = makeRng(seed);
  const shape = PAGE_SHAPES[kind];

  // Shuffle each needed category exactly once, then walk the page list and
  // take the next N from each category's shuffled bank. This guarantees no
  // duplicates within a single workbook even when a category appears across
  // multiple pages.
  const shuffledByCategory = new Map<WorkbookCategory, Problem[]>();
  const cursorByCategory = new Map<WorkbookCategory, number>();

  for (const { category } of shape) {
    if (shuffledByCategory.has(category)) continue;
    const bank = getBank(grade, category);
    shuffledByCategory.set(category, shuffle(bank, rng) as Problem[]);
    cursorByCategory.set(category, 0);
  }

  const pages: WorkbookPage[] = shape.map(({ category, count }) => {
    const cursor = cursorByCategory.get(category) ?? 0;
    const pool = shuffledByCategory.get(category) ?? [];
    const slice = pool.slice(cursor, cursor + count);
    cursorByCategory.set(category, cursor + count);
    return { category, problems: slice } as WorkbookPage;
  });

  return { seed, kind, grade, pages };
}
