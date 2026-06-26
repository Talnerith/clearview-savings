import {
  Circle,
  Document,
  Ellipse,
  Line,
  Page,
  Path,
  Polygon,
  Polyline,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToStream,
} from "@react-pdf/renderer";

import { getPatientBrand } from "@/lib/branding";
import { BrandIconPdf } from "@/lib/branding-pdf";
import { CheckPage } from "@/lib/check-pdf";
import type { Patient } from "@/lib/db/schema";
import { makeRng, shuffle } from "@/lib/workbook-content/sampler";
import type {
  CopyShapeProblem,
  LogicProblem,
  MathFactProblem,
  ReadingPassage,
  SequencingProblem,
  ShapeElement,
  WordProblem,
  WorkbookPage as WorkbookPageData,
  WorkbookSample,
} from "@/lib/workbook-content/types";

export type WorkbookPdfData = {
  patient: Patient;
  title: string;
  code: string;
  createdAt: Date;
  sample: WorkbookSample;
  locale: string;
  // The finished-work reward. The workbook's final page is a real check for
  // this amount (ADR 0004), deposited through "Deposit a Check".
  amountCents: number;
  currency: string;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontFamily: "Times-Roman",
    fontSize: 16,
    color: "#0f172a",
    backgroundColor: "white",
    lineHeight: 1.4,
  },
  // Cover page
  coverBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 40,
  },
  coverBrand: {
    fontSize: 28,
    fontFamily: "Times-Bold",
    letterSpacing: 1.5,
  },
  coverDivider: {
    marginTop: 24,
    marginBottom: 24,
    borderTopWidth: 0.75,
    borderTopColor: "#94a3b8",
  },
  coverTitle: {
    fontSize: 32,
    fontFamily: "Times-Bold",
    textAlign: "center",
    marginBottom: 16,
  },
  coverFor: {
    fontSize: 18,
    textAlign: "center",
    color: "#475569",
  },
  coverName: {
    marginTop: 6,
    fontSize: 22,
    fontFamily: "Times-Bold",
    textAlign: "center",
  },
  coverDate: {
    marginTop: 56,
    fontSize: 14,
    textAlign: "center",
    color: "#475569",
  },
  coverInstructions: {
    marginTop: 56,
    fontSize: 16,
    color: "#334155",
    lineHeight: 1.6,
  },
  // Content pages
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderBottomWidth: 0.5,
    borderBottomColor: "#94a3b8",
    paddingBottom: 6,
    marginBottom: 18,
  },
  pageHeaderBrand: {
    fontSize: 12,
    fontFamily: "Times-Bold",
    letterSpacing: 1,
    color: "#475569",
  },
  pageHeaderTitle: {
    fontSize: 12,
    color: "#475569",
  },
  pageFooter: {
    position: "absolute",
    bottom: 24,
    left: 56,
    right: 56,
    fontSize: 10,
    color: "#94a3b8",
    textAlign: "center",
  },
  problem: {
    marginBottom: 14,
  },
  problemNumberRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  problemNumber: {
    width: 28,
    fontFamily: "Times-Bold",
  },
  problemBody: {
    flex: 1,
  },
  mathPrompt: {
    fontSize: 18,
    fontFamily: "Courier",
  },
  answerLine: {
    marginTop: 10,
    height: 16,
    borderBottomWidth: 0.75,
    borderBottomColor: "#94a3b8",
  },
  shortAnswerLine: {
    marginTop: 6,
    height: 14,
    borderBottomWidth: 0.75,
    borderBottomColor: "#94a3b8",
  },
  passageBlock: {
    marginBottom: 12,
    padding: 12,
    borderLeftWidth: 2,
    borderLeftColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  passageText: {
    fontSize: 16,
    lineHeight: 1.6,
  },
  questionRow: {
    marginTop: 10,
  },
  questionText: {
    fontSize: 16,
  },
  sequencingPrompt: {
    marginBottom: 10,
  },
  sequencingItemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sequencingNumberBox: {
    width: 32,
    height: 24,
    borderWidth: 0.75,
    borderColor: "#94a3b8",
    marginRight: 12,
  },
  sequencingItemText: {
    flex: 1,
    fontSize: 16,
  },
  copyShapePrompt: {
    marginBottom: 10,
  },
  copyShapeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  copyShapeBox: {
    width: 150,
    height: 130,
    borderWidth: 0.75,
    borderColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
  },
  copyShapeArrow: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  copyShapeBoxLabel: {
    marginTop: 4,
    fontSize: 11,
    color: "#94a3b8",
    textAlign: "center",
  },
  pageNumber: {
    marginTop: 12,
    fontSize: 11,
    color: "#94a3b8",
    textAlign: "right",
  },
});

function formatLongDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

// @react-pdf/renderer's bundled Times-Roman covers ASCII + Latin-1 only.
// Glyphs outside that range render as blank (silently). Substitute known
// offenders down to safe equivalents. Keep the bank source typographically
// canonical (HTML renders the prettier glyph in the answer-key page).
function pdfSafe(s: string): string {
  return s.replace(/−/g, "-").replace(/—/g, " - ");
}

function pageCategoryLabel(category: WorkbookPageData["category"]): string {
  switch (category) {
    case "math-facts":
      return "Number practice";
    case "word-problems":
      return "Word problems";
    case "reading-passages":
      return "Reading";
    case "sequencing":
      return "Putting things in order";
    case "copy-shape":
      return "Copy the drawing";
    case "simple-logic":
      return "Thinking puzzles";
  }
}

// Render the reference figure as native @react-pdf SVG primitives. Stroke-
// only (no fill) in a 0 0 100 100 viewBox; the patient redraws it freehand.
const SHAPE_STROKE = "#0f172a";
const SHAPE_STROKE_WIDTH = 2;

function ShapeElementPdf({ el, idx }: { el: ShapeElement; idx: number }) {
  const stroke = SHAPE_STROKE;
  const strokeWidth = SHAPE_STROKE_WIDTH;
  switch (el.type) {
    case "line":
      return (
        <Line
          key={idx}
          x1={el.x1}
          y1={el.y1}
          x2={el.x2}
          y2={el.y2}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    case "polyline":
      return (
        <Polyline
          key={idx}
          points={el.points}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
        />
      );
    case "polygon":
      return (
        <Polygon
          key={idx}
          points={el.points}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
        />
      );
    case "circle":
      return (
        <Circle
          key={idx}
          cx={el.cx}
          cy={el.cy}
          r={el.r}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
        />
      );
    case "ellipse":
      return (
        <Ellipse
          key={idx}
          cx={el.cx}
          cy={el.cy}
          rx={el.rx}
          ry={el.ry}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
        />
      );
    case "rect":
      return (
        <Rect
          key={idx}
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
        />
      );
    case "path":
      return (
        <Path
          key={idx}
          d={el.d}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
        />
      );
  }
}

function CopyShapeProblems({ problems }: { problems: CopyShapeProblem[] }) {
  return (
    <View>
      {problems.map((p, idx) => (
        <View key={p.id} style={{ marginBottom: 22 }}>
          <View style={styles.problemNumberRow}>
            <Text style={styles.problemNumber}>{idx + 1}.</Text>
            <View style={styles.problemBody}>
              <Text style={styles.copyShapePrompt}>{pdfSafe(p.prompt)}</Text>
              <View style={styles.copyShapeRow}>
                <View>
                  <View style={styles.copyShapeBox}>
                    <Svg width={110} height={110} viewBox="0 0 100 100">
                      {p.elements.map((el, elIdx) => (
                        <ShapeElementPdf key={elIdx} el={el} idx={elIdx} />
                      ))}
                    </Svg>
                  </View>
                  <Text style={styles.copyShapeBoxLabel}>Look</Text>
                </View>
                <View style={styles.copyShapeArrow}>
                  <Svg width={32} height={16} viewBox="0 0 32 16">
                    <Line
                      x1={2}
                      y1={8}
                      x2={28}
                      y2={8}
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                    />
                    <Polyline
                      points="20,3 28,8 20,13"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      fill="none"
                    />
                  </Svg>
                </View>
                <View>
                  <View style={styles.copyShapeBox} />
                  <Text style={styles.copyShapeBoxLabel}>Your turn</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function MathProblems({ problems }: { problems: MathFactProblem[] }) {
  return (
    <View>
      {problems.map((p, idx) => (
        <View key={p.id} style={styles.problem}>
          <View style={styles.problemNumberRow}>
            <Text style={styles.problemNumber}>{idx + 1}.</Text>
            <View style={styles.problemBody}>
              <Text style={styles.mathPrompt}>{pdfSafe(p.prompt)}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function WordProblems({ problems }: { problems: WordProblem[] }) {
  return (
    <View>
      {problems.map((p, idx) => (
        <View key={p.id} style={styles.problem}>
          <View style={styles.problemNumberRow}>
            <Text style={styles.problemNumber}>{idx + 1}.</Text>
            <View style={styles.problemBody}>
              <Text>{pdfSafe(p.prompt)}</Text>
              <View style={styles.answerLine} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function ReadingPassages({ passages }: { passages: ReadingPassage[] }) {
  return (
    <View>
      {passages.map((p) => (
        <View key={p.id} style={{ marginBottom: 16 }}>
          <View style={styles.passageBlock}>
            <Text style={styles.passageText}>{pdfSafe(p.passage)}</Text>
          </View>
          {p.questions.map((q, qIdx) => (
            <View key={qIdx} style={styles.questionRow}>
              <View style={styles.problemNumberRow}>
                <Text style={styles.problemNumber}>{qIdx + 1}.</Text>
                <View style={styles.problemBody}>
                  <Text style={styles.questionText}>{pdfSafe(q.q)}</Text>
                  <View style={styles.answerLine} />
                </View>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function SequencingProblems({
  problems,
  workbookSeed,
}: {
  problems: SequencingProblem[];
  workbookSeed: string;
}) {
  return (
    <View>
      {problems.map((p, idx) => {
        // Stable per-problem seed so the printed scrambled order is
        // reproducible from (workbookSeed, problem.id) alone.
        const rng = makeRng(`${workbookSeed}:${p.id}`);
        const scrambled = shuffle(p.correctSequence, rng);
        return (
          <View key={p.id} style={{ marginBottom: 18 }}>
            <View style={styles.problemNumberRow}>
              <Text style={styles.problemNumber}>{idx + 1}.</Text>
              <View style={styles.problemBody}>
                <Text style={styles.sequencingPrompt}>{pdfSafe(p.prompt)}</Text>
                {scrambled.map((step, sIdx) => (
                  <View key={sIdx} style={styles.sequencingItemRow}>
                    <View style={styles.sequencingNumberBox} />
                    <Text style={styles.sequencingItemText}>
                      {pdfSafe(step)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function LogicProblems({ problems }: { problems: LogicProblem[] }) {
  return (
    <View>
      {problems.map((p, idx) => (
        <View key={p.id} style={styles.problem}>
          <View style={styles.problemNumberRow}>
            <Text style={styles.problemNumber}>{idx + 1}.</Text>
            <View style={styles.problemBody}>
              <Text>{pdfSafe(p.prompt)}</Text>
              <View style={styles.answerLine} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function ContentPage({
  brandName,
  title,
  pageNumber,
  totalPages,
  page,
  workbookSeed,
}: {
  brandName: string;
  title: string;
  pageNumber: number;
  totalPages: number;
  page: WorkbookPageData;
  workbookSeed: string;
}) {
  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageHeaderBrand}>{brandName}</Text>
        <Text style={styles.pageHeaderTitle}>{title}</Text>
      </View>

      <Text style={{ fontSize: 20, fontFamily: "Times-Bold", marginBottom: 16 }}>
        {pageCategoryLabel(page.category)}
      </Text>

      {page.category === "math-facts" && (
        <MathProblems problems={page.problems as MathFactProblem[]} />
      )}
      {page.category === "word-problems" && (
        <WordProblems problems={page.problems as WordProblem[]} />
      )}
      {page.category === "reading-passages" && (
        <ReadingPassages passages={page.problems as ReadingPassage[]} />
      )}
      {page.category === "sequencing" && (
        <SequencingProblems
          problems={page.problems as SequencingProblem[]}
          workbookSeed={workbookSeed}
        />
      )}
      {page.category === "copy-shape" && (
        <CopyShapeProblems problems={page.problems as CopyShapeProblem[]} />
      )}
      {page.category === "simple-logic" && (
        <LogicProblems problems={page.problems as LogicProblem[]} />
      )}

      <Text style={styles.pageFooter}>
        Page {pageNumber} of {totalPages}
      </Text>
    </Page>
  );
}

export function WorkbookDocument(data: WorkbookPdfData) {
  const brand = getPatientBrand(data.patient);
  const contentPageCount = data.sample.pages.length;
  // Cover + content pages + final code page.
  const totalPages = contentPageCount + 2;

  return (
    <Document title={`${brand.name} ${data.title}`} author={brand.name}>
      {/* Cover */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.coverBrandRow}>
          <BrandIconPdf size={96} />
          <Text style={styles.coverBrand}>{brand.name}</Text>
        </View>
        <View style={styles.coverDivider} />
        <Text style={styles.coverTitle}>{data.title}</Text>
        <Text style={styles.coverFor}>Prepared for</Text>
        <Text style={styles.coverName}>{data.patient.displayName}</Text>
        <Text style={styles.coverDate}>
          {formatLongDate(data.createdAt, data.locale)}
        </Text>
        <Text style={styles.coverInstructions}>
          Take your time. There is no rush. Work on the pages in any order you
          like, and skip anything you would rather not do. When you are
          finished, the last page is a check you can deposit on your bank
          screen.
        </Text>
        <Text style={styles.pageFooter}>Page 1 of {totalPages}</Text>
      </Page>

      {/* Content pages */}
      {data.sample.pages.map((page, idx) => (
        <ContentPage
          key={idx}
          brandName={brand.name}
          title={data.title}
          pageNumber={idx + 2}
          totalPages={totalPages}
          page={page}
          workbookSeed={data.sample.seed}
        />
      ))}

      {/* Final page: the reward check, deposited via "Deposit a Check"
          (ADR 0004). Same layout as a standalone check so the patient can
          tear off the last page and deposit it. */}
      <CheckPage
        patient={data.patient}
        payeeName={data.patient.displayName}
        amountCents={data.amountCents}
        date={data.createdAt}
        memo={data.title}
        code={data.code}
        locale={data.locale}
        currency={data.currency}
      />
    </Document>
  );
}

export async function renderWorkbookPdfStream(
  data: WorkbookPdfData,
): Promise<NodeJS.ReadableStream> {
  return renderToStream(<WorkbookDocument {...data} />);
}
