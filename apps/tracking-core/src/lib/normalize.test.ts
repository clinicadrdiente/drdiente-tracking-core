import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone } from "./normalize.js";

describe("normalizePhone", () => {
  it("strips spaces and dashes", () => {
    expect(normalizePhone("+52 55 1234-5678")).toBe("525512345678");
  });
  it("strips all non-digit characters", () => {
    expect(normalizePhone("+1 (800) 555-1234")).toBe("18005551234");
  });
  it("returns empty string for empty input", () => {
    expect(normalizePhone("")).toBe("");
  });
  it("keeps only digits from a mixed string", () => {
    expect(normalizePhone("abc123def")).toBe("123");
  });
});

describe("normalizeEmail", () => {
  it("lowercases email", () => {
    expect(normalizeEmail("User@Example.COM")).toBe("user@example.com");
  });
  it("trims whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });
  it("returns null for null", () => {
    expect(normalizeEmail(null)).toBeNull();
  });
  it("returns null for undefined", () => {
    expect(normalizeEmail(undefined)).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(normalizeEmail("")).toBeNull();
  });
});
