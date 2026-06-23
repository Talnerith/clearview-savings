import { describe, expect, it } from "vitest";

import { currencyForLocale } from "./locale-currency";

describe("currencyForLocale", () => {
  it("maps common regions", () => {
    expect(currencyForLocale("en-US")).toBe("USD");
    expect(currencyForLocale("en-CA")).toBe("CAD");
    expect(currencyForLocale("fr-CA")).toBe("CAD");
    expect(currencyForLocale("fr-FR")).toBe("EUR");
    expect(currencyForLocale("en-GB")).toBe("GBP");
  });

  it("falls back to USD for unknown regions or malformed locales", () => {
    expect(currencyForLocale("en-ZZ")).toBe("USD");
    expect(currencyForLocale("en")).toBe("USD");
    expect(currencyForLocale("")).toBe("USD");
  });
});
