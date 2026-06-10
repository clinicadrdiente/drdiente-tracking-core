import { describe, it, expect } from "vitest";
import { InMemoryStateStore } from "./state-store.js";

describe("InMemoryStateStore heartbeat", () => {
  it("writeHeartbeat and readHeartbeat round-trip", async () => {
    const store = new InMemoryStateStore();
    await store.writeHeartbeat("my-cron", "2026-06-10T05:00:00.000Z");
    const result = await store.readHeartbeat("my-cron");
    expect(result).toBe("2026-06-10T05:00:00.000Z");
  });

  it("readHeartbeat returns null for unknown key", async () => {
    const store = new InMemoryStateStore();
    const result = await store.readHeartbeat("does-not-exist");
    expect(result).toBeNull();
  });
});
