import { and, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPatientForCaregiver } from "@/lib/auth/require-patient";
import { db } from "@/lib/db";
import { depositCodes } from "@/lib/db/schema";
import type {
  LogicProblem,
  MathFactProblem,
  ReadingPassage,
  SequencingProblem,
  WordProblem,
  WorkbookPage,
  WorkbookSample,
} from "@/lib/workbook-content/types";

export const metadata = {
  title: "Answer key — Caregiver — Clearview Savings",
};

function isWorkbookSample(value: unknown): value is WorkbookSample {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<WorkbookSample>;
  return (
    typeof v.seed === "string" &&
    typeof v.kind === "string" &&
    typeof v.grade === "number" &&
    Array.isArray(v.pages)
  );
}

function categoryLabel(category: WorkbookPage["category"]): string {
  switch (category) {
    case "math-facts":
      return "Number practice";
    case "word-problems":
      return "Word problems";
    case "reading-passages":
      return "Reading";
    case "sequencing":
      return "Putting things in order";
    case "simple-logic":
      return "Thinking puzzles";
  }
}

export default async function WorkbookAnswersPage({
  params,
}: {
  params: Promise<{ id: string; codeId: string }>;
}) {
  const { id, codeId } = await params;
  const { patient } = await getPatientForCaregiver(id);

  const rows = await db
    .select()
    .from(depositCodes)
    .where(
      and(
        eq(depositCodes.id, codeId),
        eq(depositCodes.patientId, patient.id),
        // Workbook-ness is the presence of workbook content; the reward code
        // is kind = "check" since M8 (ADR 0004).
        isNotNull(depositCodes.workbookKind),
      ),
    )
    .limit(1);
  const code = rows[0];
  if (!code || !isWorkbookSample(code.contentSeed)) {
    redirect(
      `/caregiver/patients/${patient.id}/workbooks?error=Workbook%20not%20found`,
    );
  }

  const sample = code.contentSeed;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href={`/caregiver/patients/${patient.id}/workbooks`}
          className="text-sm text-slate-600 hover:underline"
        >
          ← Workbooks
        </Link>
        <h1 className="text-2xl font-semibold mt-1">
          Answer key — {code.label}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          For {patient.displayName}. Problem order matches the printed copy.
          Sequencing answers are shown in canonical order; the printed copy
          scrambles them per workbook.
        </p>
      </div>

      {sample.pages.map((page, pIdx) => (
        <Card key={pIdx}>
          <CardHeader>
            <CardTitle>
              Page {pIdx + 2}: {categoryLabel(page.category)}
            </CardTitle>
            <CardDescription>{page.problems.length} item(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {page.category === "math-facts" && (
              <ol className="space-y-2 list-decimal list-inside">
                {(page.problems as MathFactProblem[]).map((p) => (
                  <li key={p.id}>
                    <span className="font-mono">{p.prompt}</span>{" "}
                    <span className="font-semibold">→ {p.answer}</span>
                  </li>
                ))}
              </ol>
            )}
            {page.category === "word-problems" && (
              <ol className="space-y-3 list-decimal list-inside">
                {(page.problems as WordProblem[]).map((p) => (
                  <li key={p.id}>
                    {p.prompt}
                    <div className="mt-1 ml-6 text-emerald-800 font-semibold">
                      Answer: {p.answer}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {page.category === "reading-passages" && (
              <div className="space-y-5">
                {(page.problems as ReadingPassage[]).map((p) => (
                  <div key={p.id}>
                    <p className="italic text-slate-700">{p.passage}</p>
                    <ol className="mt-2 space-y-1 list-decimal list-inside">
                      {p.questions.map((q, qIdx) => (
                        <li key={qIdx}>
                          {q.q}
                          <div className="ml-6 text-emerald-800 font-semibold">
                            {q.a}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
            {page.category === "sequencing" && (
              <div className="space-y-4">
                {(page.problems as SequencingProblem[]).map((p) => (
                  <div key={p.id}>
                    <p className="font-medium">{p.prompt}</p>
                    <ol className="mt-1 list-decimal list-inside space-y-1 text-emerald-800">
                      {p.correctSequence.map((step, sIdx) => (
                        <li key={sIdx}>{step}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
            {page.category === "simple-logic" && (
              <ol className="space-y-3 list-decimal list-inside">
                {(page.problems as LogicProblem[]).map((p) => (
                  <li key={p.id}>
                    {p.prompt}
                    <div className="mt-1 ml-6 text-emerald-800 font-semibold">
                      Answer: {p.answer}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-slate-500">
        Deposit code:{" "}
        <span className="font-mono">{code.code}</span> · Reward $
        {(code.amountCents / 100).toFixed(2)}
      </p>
    </div>
  );
}
