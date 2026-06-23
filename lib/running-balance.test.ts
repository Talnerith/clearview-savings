import { describe, expect, it } from "vitest";

import { withRunningBalances } from "./running-balance";

function row(id: string, amountCents: number, postedAt: string) {
  return { id, amountCents, postedAt: new Date(postedAt) };
}

describe("withRunningBalances", () => {
  it("returns empty for no rows", () => {
    expect(withRunningBalances([], 10_000)).toEqual([]);
  });

  it("shows the current balance on the newest row and subtracts backwards", () => {
    const rows = [
      row("c", 2_500, "2026-06-10T12:00:00Z"), // newest: deposit $25
      row("b", -1_000, "2026-06-09T12:00:00Z"), // withdrawal $10
      row("a", 5_000, "2026-06-08T12:00:00Z"), // deposit $50
    ];
    const out = withRunningBalances(rows, 12_000);
    expect(out.map((r) => [r.id, r.runningBalanceCents])).toEqual([
      ["c", 12_000], // current balance
      ["b", 9_500], // 12000 - 2500
      ["a", 10_500], // 9500 - (-1000)
    ]);
  });

  it("reconciles even when older rows are cut off by a query limit", () => {
    // Only the 2 newest of many rows are passed in; the newest still shows
    // the authoritative current balance.
    const rows = [
      row("z", 1_000, "2026-06-10T12:00:00Z"),
      row("y", 2_000, "2026-06-09T12:00:00Z"),
    ];
    const out = withRunningBalances(rows, 7_777);
    expect(out[0]).toMatchObject({ id: "z", runningBalanceCents: 7_777 });
    expect(out[1]).toMatchObject({ id: "y", runningBalanceCents: 6_777 });
  });

  it("orders same-timestamp rows deterministically regardless of input order", () => {
    const a = row("aaa", 100, "2026-06-10T12:00:00Z");
    const b = row("bbb", 200, "2026-06-10T12:00:00Z");
    const out1 = withRunningBalances([a, b], 1_000);
    const out2 = withRunningBalances([b, a], 1_000);
    expect(out1).toEqual(out2);
    // id desc tiebreak: "bbb" sorts newest.
    expect(out1.map((r) => r.id)).toEqual(["bbb", "aaa"]);
    expect(out1.map((r) => r.runningBalanceCents)).toEqual([1_000, 800]);
  });

  it("re-sorts rows handed in out of order", () => {
    const rows = [
      row("old", 500, "2026-06-01T12:00:00Z"),
      row("new", 300, "2026-06-10T12:00:00Z"),
    ];
    const out = withRunningBalances(rows, 2_000);
    expect(out.map((r) => r.id)).toEqual(["new", "old"]);
    expect(out.map((r) => r.runningBalanceCents)).toEqual([2_000, 1_700]);
  });

  it("accepts date-only strings (UTC midnight, matching display parsing)", () => {
    const rows = [
      { id: "s", amountCents: 100, postedAt: "2026-06-10" },
      { id: "d", amountCents: 200, postedAt: new Date("2026-06-09T00:00:00Z") },
    ];
    const out = withRunningBalances(rows, 1_000);
    expect(out.map((r) => r.id)).toEqual(["s", "d"]);
  });
});
