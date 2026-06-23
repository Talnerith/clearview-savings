import { describe, expect, it } from "vitest";

import { chunkCode, normalizeCode } from "./code-entry";

describe("normalizeCode", () => {
  it("passes a clean 8-char code through", () => {
    expect(normalizeCode("ABCD2345")).toBe("ABCD2345");
  });

  it("strips the printed group space", () => {
    expect(normalizeCode("ABCD 2345")).toBe("ABCD2345");
  });

  it("uppercases lowercase input", () => {
    expect(normalizeCode("abcd 2345")).toBe("ABCD2345");
  });

  it("drops characters outside the code alphabet", () => {
    // I, L, O, 0, 1 are excluded from the alphabet; punctuation too.
    expect(normalizeCode("A-B_C.D 2345IL01")).toBe("ABCD2345");
  });

  it("caps pasted input at 8 chars", () => {
    expect(normalizeCode("ABCD2345EXTRA")).toBe("ABCD2345");
  });

  it("handles empty input", () => {
    expect(normalizeCode("")).toBe("");
  });
});

describe("chunkCode", () => {
  it("shows partial entry under 5 chars ungrouped", () => {
    expect(chunkCode("")).toBe("");
    expect(chunkCode("AB")).toBe("AB");
    expect(chunkCode("ABCD")).toBe("ABCD");
  });

  it("inserts the group space from the 5th char on", () => {
    expect(chunkCode("ABCD2")).toBe("ABCD 2");
    expect(chunkCode("ABCD2345")).toBe("ABCD 2345");
  });

  it("round-trips with normalizeCode", () => {
    expect(normalizeCode(chunkCode("ABCD2345"))).toBe("ABCD2345");
  });
});
