import { describe, expect, it } from "vitest";

import { formatArrival } from "./format-arrival";

const NOW = new Date("2026-05-11T12:00:00Z"); // Monday

function offsetDate(daysFromNow: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

describe("formatArrival", () => {
  it("returns 'today' for daysAway === 0", () => {
    expect(formatArrival(offsetDate(0), NOW, "en-US")).toBe("today");
  });

  it("returns 'tomorrow' for daysAway === 1", () => {
    expect(formatArrival(offsetDate(1), NOW, "en-US")).toBe("tomorrow");
  });

  it("returns 'in N days' for 2..6 days out", () => {
    expect(formatArrival(offsetDate(2), NOW, "en-US")).toBe("in 2 days");
    expect(formatArrival(offsetDate(3), NOW, "en-US")).toBe("in 3 days");
    expect(formatArrival(offsetDate(6), NOW, "en-US")).toBe("in 6 days");
  });

  it("returns 'on <weekday>' for 7..13 days out", () => {
    // NOW is Monday 2026-05-11. +7 = Monday again, +10 = Thursday.
    expect(formatArrival(offsetDate(7), NOW, "en-US")).toBe("on Monday");
    expect(formatArrival(offsetDate(10), NOW, "en-US")).toBe("on Thursday");
    expect(formatArrival(offsetDate(13), NOW, "en-US")).toBe("on Sunday");
  });

  it("returns 'on <long format>' for >= 14 days out", () => {
    // Won't trigger under the default 5-day window but a caregiver-set
    // 14-day window can hit this branch.
    const phrase = formatArrival(offsetDate(14), NOW, "en-US");
    expect(phrase.startsWith("on ")).toBe(true);
    expect(phrase).toContain("May 25");
  });

  it("clamps a past date to 'today' rather than producing 'in -N days'", () => {
    expect(formatArrival(offsetDate(-3), NOW, "en-US")).toBe("today");
  });

  it("respects the locale parameter for weekday/long formats", () => {
    // Just verify the locale gets threaded through; don't pin specific
    // translations since ICU data varies by Node version.
    const en = formatArrival(offsetDate(10), NOW, "en-US");
    const fr = formatArrival(offsetDate(10), NOW, "fr-FR");
    expect(en.startsWith("on ")).toBe(true);
    expect(fr.startsWith("on ")).toBe(true); // wrapper preposition is English
    // The weekday name itself differs between locales.
    expect(en).not.toBe(fr);
  });
});
