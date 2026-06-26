// Workbook problem types. Each category has its own shape; a discriminated
// union lets call sites be type-safe without nullable fields.
//
// IMPORTANT: these names are caregiver-facing only. Patient-facing UI never
// uses "math-facts," "word-problems," "grade," "workbook," or similar — see
// the framing rule in CLAUDE.md and docs/milestones/M3.md.

export type WorkbookCategory =
  | "math-facts"
  | "word-problems"
  | "reading-passages"
  | "sequencing"
  | "copy-shape"
  | "simple-logic";

export type WorkbookKind = "math" | "reading" | "mixed";
// Numeric encoding with K = 0 (M8 spec Resolved #1): the workbook_grade
// smallint and every numeric comparison keep working unchanged. The "K" /
// "Grade 1" wording lives only at the caregiver UI edge via gradeLabel().
export type WorkbookGrade = 0 | 1 | 2 | 3;

// Caregiver-facing label for a grade. Patient UI never shows this — the
// framing rule (CLAUDE.md / M3) keeps "grade"/"kindergarten" out of anything
// a patient can see; the transaction label stays a bank-like "Activity Set".
export function gradeLabel(grade: WorkbookGrade): string {
  switch (grade) {
    case 0:
      return "Kindergarten";
    case 1:
      return "Grade 1";
    case 2:
      return "Grade 2";
    case 3:
      return "Grade 3";
  }
}

export type MathFactProblem = {
  id: string;
  prompt: string;
  answer: string;
};

export type WordProblem = {
  id: string;
  prompt: string;
  answer: string;
};

export type ReadingPassage = {
  id: string;
  passage: string;
  questions: { q: string; a: string }[];
};

export type SequencingProblem = {
  id: string;
  prompt: string;
  // The steps in their correct chronological order. The PDF renderer
  // shuffles them for display using the workbook seed; the answer-key
  // renderer prints them in this canonical order.
  //
  // NOTE: no new sequencing rows are minted into workbooks — copy-shape
  // replaced it in PAGE_SHAPES (ADR 0007). This type, its bank, and its
  // renderers are retained only so historical workbooks (whose problems are
  // snapshotted in deposit_codes.content_seed) still print and show answers.
  correctSequence: string[];
};

// A single stroke-only primitive in a reference figure, expressed in a fixed
// 0..100 coordinate space (drawn into a "0 0 100 100" viewBox on both the PDF
// and the HTML answer key). No fills, no colors — the patient copies the
// outline freehand into the blank box beside it. Keeping shapes as plain data
// (not pre-rendered SVG strings) lets both renderers draw them natively and
// keeps the content_seed snapshot human-readable.
export type ShapeElement =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "polyline"; points: string }
  | { type: "polygon"; points: string }
  | { type: "circle"; cx: number; cy: number; r: number }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { type: "rect"; x: number; y: number; width: number; height: number }
  | { type: "path"; d: string };

// "Copy the drawing" exercise. The patient is shown a reference figure and
// redraws it in an empty box. Difficulty scales by grade via figure
// complexity (single primitives → combined → intersecting → multi-line
// figures), which sequencing could not do — see ADR 0007. A figure-copying
// task also exercises visuospatial planning and hand control, complementing
// the math/reading/logic pages.
export type CopyShapeProblem = {
  id: string;
  // Patient-facing instruction (e.g. "Copy this drawing in the empty box.").
  prompt: string;
  // Caregiver-facing name of the figure; shown only on the answer key for
  // context. Never patient-visible.
  name: string;
  // The reference figure, drawn in a 0 0 100 100 viewBox, stroke-only.
  elements: ShapeElement[];
};

export type LogicProblem = {
  id: string;
  prompt: string;
  answer: string;
};

export type ProblemByCategory = {
  "math-facts": MathFactProblem;
  "word-problems": WordProblem;
  "reading-passages": ReadingPassage;
  "sequencing": SequencingProblem;
  "copy-shape": CopyShapeProblem;
  "simple-logic": LogicProblem;
};

export type Problem = ProblemByCategory[WorkbookCategory];

// What the seeded sampler produces, and what gets stored in
// deposit_codes.content_seed as a snapshot of the printed workbook.
export type WorkbookPage<C extends WorkbookCategory = WorkbookCategory> = {
  category: C;
  problems: ProblemByCategory[C][];
};

export type WorkbookSample = {
  seed: string;
  kind: WorkbookKind;
  grade: WorkbookGrade;
  pages: WorkbookPage[];
};
