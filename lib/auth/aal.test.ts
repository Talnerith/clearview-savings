import { describe, expect, it, vi } from "vitest";

import { getAalState } from "./aal";

type Levels = { currentLevel: string | null; nextLevel: string | null };

function clientWith(levels: Levels) {
  return {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: vi
          .fn()
          .mockResolvedValue({ data: levels, error: null }),
      },
    },
  } as unknown as Parameters<typeof getAalState>[0];
}

describe("getAalState", () => {
  it("maps an aal2 session to 'aal2'", async () => {
    const state = await getAalState(
      clientWith({ currentLevel: "aal2", nextLevel: "aal2" }),
    );
    expect(state).toBe("aal2");
  });

  it("maps aal1 with a reachable aal2 to 'aal1-needs-aal2'", async () => {
    const state = await getAalState(
      clientWith({ currentLevel: "aal1", nextLevel: "aal2" }),
    );
    expect(state).toBe("aal1-needs-aal2");
  });

  it("maps aal1 with no higher level to 'no-factor'", async () => {
    const state = await getAalState(
      clientWith({ currentLevel: "aal1", nextLevel: "aal1" }),
    );
    expect(state).toBe("no-factor");
  });
});
