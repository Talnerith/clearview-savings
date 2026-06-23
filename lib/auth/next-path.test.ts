import { describe, expect, it } from "vitest";

import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("returns the fallback for empty / missing input", () => {
    expect(safeNextPath(undefined)).toBe("/caregiver");
    expect(safeNextPath(null)).toBe("/caregiver");
    expect(safeNextPath("")).toBe("/caregiver");
  });

  it("allows an internal absolute path", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
    expect(safeNextPath("/caregiver/settings")).toBe("/caregiver/settings");
  });

  it("rejects open-redirect vectors and falls back", () => {
    expect(safeNextPath("https://evil.example")).toBe("/caregiver");
    expect(safeNextPath("//evil.example")).toBe("/caregiver");
    expect(safeNextPath("/\\evil.example")).toBe("/caregiver");
    expect(safeNextPath("/path\\with\\backslash")).toBe("/caregiver");
    expect(safeNextPath("mailto:a@b.c")).toBe("/caregiver");
  });

  it("honors a custom fallback", () => {
    expect(safeNextPath(undefined, "/sign-in")).toBe("/sign-in");
    expect(safeNextPath("//evil", "/sign-in")).toBe("/sign-in");
  });
});
