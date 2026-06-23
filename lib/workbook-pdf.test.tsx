import { describe, expect, it } from "vitest";

import type { Patient } from "@/lib/db/schema";
import type { WorkbookSample } from "@/lib/workbook-content/types";

import { renderWorkbookPdfStream } from "./workbook-pdf";

// Minimal patient — getPatientBrand ignores it (returns the constant brand),
// and the PDF only reads displayName off it.
const patient = {
  id: "00000000-0000-0000-0000-000000000001",
  displayName: "Pat Doe",
  settings: { locale: "en-US", currency: "USD" },
} as unknown as Patient;

const sample: WorkbookSample = {
  seed: "render-test",
  kind: "math",
  grade: 0,
  pages: [
    {
      category: "math-facts",
      problems: [
        { id: "g0-mf-001", prompt: "1 + 1 = ____", answer: "2" },
        { id: "g0-mf-002", prompt: "1 + 2 = ____", answer: "3" },
      ],
    },
  ],
};

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

describe("renderWorkbookPdfStream", () => {
  it("renders a valid PDF whose final page is the reward check", async () => {
    // A malformed tree (e.g. the shared CheckPage breaking the Document/Page
    // nesting) would throw during render, so a clean %PDF buffer is the
    // signal that the cover + content + reward-check pages all composed.
    const stream = await renderWorkbookPdfStream({
      patient,
      title: "Activity Set #1",
      code: "WBREWARD",
      createdAt: new Date("2026-06-06T00:00:00Z"),
      sample,
      locale: "en-US",
      amountCents: 500,
      currency: "USD",
    });
    const buf = await collect(stream);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  });
});
