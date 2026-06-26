import type {
  CopyShapeProblem,
  LogicProblem,
  MathFactProblem,
  ProblemByCategory,
  ReadingPassage,
  SequencingProblem,
  WordProblem,
  WorkbookCategory,
  WorkbookGrade,
  WorkbookKind,
  WorkbookSample,
} from "./types";
import { sampleWorkbook } from "./sampler";

import g0MathFacts from "./grade-0/math-facts.json";
import g0WordProblems from "./grade-0/word-problems.json";
import g0ReadingPassages from "./grade-0/reading-passages.json";
import g0Sequencing from "./grade-0/sequencing.json";
import g0CopyShape from "./grade-0/copy-shape.json";
import g0SimpleLogic from "./grade-0/simple-logic.json";
import g1MathFacts from "./grade-1/math-facts.json";
import g1WordProblems from "./grade-1/word-problems.json";
import g1ReadingPassages from "./grade-1/reading-passages.json";
import g1Sequencing from "./grade-1/sequencing.json";
import g1CopyShape from "./grade-1/copy-shape.json";
import g1SimpleLogic from "./grade-1/simple-logic.json";
import g2MathFacts from "./grade-2/math-facts.json";
import g2WordProblems from "./grade-2/word-problems.json";
import g2ReadingPassages from "./grade-2/reading-passages.json";
import g2Sequencing from "./grade-2/sequencing.json";
import g2CopyShape from "./grade-2/copy-shape.json";
import g2SimpleLogic from "./grade-2/simple-logic.json";
import g3MathFacts from "./grade-3/math-facts.json";
import g3WordProblems from "./grade-3/word-problems.json";
import g3ReadingPassages from "./grade-3/reading-passages.json";
import g3Sequencing from "./grade-3/sequencing.json";
import g3CopyShape from "./grade-3/copy-shape.json";
import g3SimpleLogic from "./grade-3/simple-logic.json";

// The bank is a static JSON snapshot today. The seam for future Anthropic-API
// generation is this resolver — swap it for an async fetch+cache layer and
// the rest of the workbook pipeline (sampler, PDF, content_seed snapshot)
// keeps working unchanged. Don't add the AI path here speculatively;
// document the seam and move on.
type Bank = {
  "math-facts": readonly MathFactProblem[];
  "word-problems": readonly WordProblem[];
  "reading-passages": readonly ReadingPassage[];
  "sequencing": readonly SequencingProblem[];
  "copy-shape": readonly CopyShapeProblem[];
  "simple-logic": readonly LogicProblem[];
};

// copy-shape JSON carries a discriminated `type` field on each element;
// resolveJsonModule widens those to `string`, so the cast goes through
// `unknown` to reach the ShapeElement literal union. The bank-sanity test
// validates the actual shape data at runtime.
const BANKS: Record<WorkbookGrade, Bank> = {
  0: {
    "math-facts": g0MathFacts as MathFactProblem[],
    "word-problems": g0WordProblems as WordProblem[],
    "reading-passages": g0ReadingPassages as ReadingPassage[],
    "sequencing": g0Sequencing as SequencingProblem[],
    "copy-shape": g0CopyShape as unknown as CopyShapeProblem[],
    "simple-logic": g0SimpleLogic as LogicProblem[],
  },
  1: {
    "math-facts": g1MathFacts as MathFactProblem[],
    "word-problems": g1WordProblems as WordProblem[],
    "reading-passages": g1ReadingPassages as ReadingPassage[],
    "sequencing": g1Sequencing as SequencingProblem[],
    "copy-shape": g1CopyShape as unknown as CopyShapeProblem[],
    "simple-logic": g1SimpleLogic as LogicProblem[],
  },
  2: {
    "math-facts": g2MathFacts as MathFactProblem[],
    "word-problems": g2WordProblems as WordProblem[],
    "reading-passages": g2ReadingPassages as ReadingPassage[],
    "sequencing": g2Sequencing as SequencingProblem[],
    "copy-shape": g2CopyShape as unknown as CopyShapeProblem[],
    "simple-logic": g2SimpleLogic as LogicProblem[],
  },
  3: {
    "math-facts": g3MathFacts as MathFactProblem[],
    "word-problems": g3WordProblems as WordProblem[],
    "reading-passages": g3ReadingPassages as ReadingPassage[],
    "sequencing": g3Sequencing as SequencingProblem[],
    "copy-shape": g3CopyShape as unknown as CopyShapeProblem[],
    "simple-logic": g3SimpleLogic as LogicProblem[],
  },
};

export function getProblemBank<C extends WorkbookCategory>(
  grade: WorkbookGrade,
  category: C,
): readonly ProblemByCategory[C][] {
  return BANKS[grade][category] as readonly ProblemByCategory[C][];
}

export function sampleWorkbookContent(args: {
  kind: WorkbookKind;
  grade: WorkbookGrade;
  seed: string;
}): WorkbookSample {
  return sampleWorkbook({ ...args, getBank: getProblemBank });
}

export type {
  CopyShapeProblem,
  LogicProblem,
  MathFactProblem,
  ProblemByCategory,
  ReadingPassage,
  SequencingProblem,
  ShapeElement,
  WordProblem,
  WorkbookCategory,
  WorkbookGrade,
  WorkbookKind,
  WorkbookSample,
} from "./types";

export { gradeLabel } from "./types";

export { newWorkbookSeed, makeRng, shuffle } from "./sampler";
