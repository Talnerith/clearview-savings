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
  correctSequence: string[];
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
