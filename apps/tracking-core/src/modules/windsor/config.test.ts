import { describe, expect, it } from "vitest";
import { getWindsorConfig } from "./config.js";

describe("getWindsorConfig secret handling", () => {
  it("does not use a hard-coded API key when WINDSOR_API_KEY is absent", () => {
    const original = process.env.WINDSOR_API_KEY;
    delete process.env.WINDSOR_API_KEY;
    try {
      expect(getWindsorConfig().apiKey).toBe("");
    } finally {
      if (original === undefined) delete process.env.WINDSOR_API_KEY;
      else process.env.WINDSOR_API_KEY = original;
    }
  });
});
