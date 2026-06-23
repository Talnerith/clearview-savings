import { describe, expect, it } from "vitest";

import type { Patient } from "@/lib/db/schema";

import { renderCheckPdfStream, type CheckPdfData } from "./check-pdf";

// Minimal patient — getPatientBrand ignores it (returns the constant brand),
// and the check only reads displayName off it via payeeName.
const patient = {
  id: "00000000-0000-0000-0000-000000000001",
  displayName: "Pat Doe",
  settings: { locale: "en-US", currency: "USD" },
} as unknown as Patient;

const data: CheckPdfData = {
  patient,
  payeeName: "Pat Doe",
  amountCents: 2500,
  date: new Date("2026-06-11T00:00:00Z"),
  memo: "Birthday",
  code: "ABCD2345",
  locale: "en-US",
  currency: "USD",
};

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

describe("renderCheckPdfStream", () => {
  it("renders the standalone check as a valid PDF", async () => {
    const buf = await collect(await renderCheckPdfStream(data));
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  });
});
