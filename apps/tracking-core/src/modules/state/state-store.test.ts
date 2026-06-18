import { describe, it, expect } from "vitest";
import { InMemoryStateStore } from "./state-store.js";
import type { DailyBranchReport } from "../../types/domain.js";

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

describe("InMemoryStateStore daily reports", () => {
  function makeReport(overrides: Partial<DailyBranchReport> = {}): DailyBranchReport {
    return {
      reportId: "centro_2026-06-10",
      branch: "centro",
      date: "2026-06-10",
      submittedAt: "2026-06-10T18:00:00.000Z",
      contacts: [{ channel: "llamada", count: 5 }],
      leadsReceived: 10,
      leadsContacted: 8,
      followUpsSent: 3,
      promoWhatsappSent: 2,
      emailsSent: 1,
      postsPublished: 0,
      notes: null,
      ...overrides,
    };
  }

  it("save and list round-trip", async () => {
    const store = new InMemoryStateStore();
    const report = makeReport();
    await store.saveDailyReport(report);
    const results = await store.listDailyReports("2026-06-10", "2026-06-10");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(report);
  });

  it("upsert same reportId overwrites", async () => {
    const store = new InMemoryStateStore();
    const first = makeReport({ leadsReceived: 5 });
    const second = makeReport({ leadsReceived: 99 });
    await store.saveDailyReport(first);
    await store.saveDailyReport(second);
    const results = await store.listDailyReports("2026-06-10", "2026-06-10");
    expect(results).toHaveLength(1);
    expect(results[0]!.leadsReceived).toBe(99);
  });

  it("date-range filter excludes out-of-range", async () => {
    const store = new InMemoryStateStore();
    await store.saveDailyReport(makeReport({ reportId: "centro_2026-06-09", date: "2026-06-09" }));
    await store.saveDailyReport(makeReport({ reportId: "centro_2026-06-10", date: "2026-06-10" }));
    await store.saveDailyReport(makeReport({ reportId: "centro_2026-06-11", date: "2026-06-11" }));
    const results = await store.listDailyReports("2026-06-09", "2026-06-10");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.date)).not.toContain("2026-06-11");
  });

  it("results are returned newest-first", async () => {
    const store = new InMemoryStateStore();
    await store.saveDailyReport(makeReport({ reportId: "a_2026-06-08", date: "2026-06-08" }));
    await store.saveDailyReport(makeReport({ reportId: "a_2026-06-10", date: "2026-06-10" }));
    await store.saveDailyReport(makeReport({ reportId: "a_2026-06-09", date: "2026-06-09" }));
    const results = await store.listDailyReports("2026-06-08", "2026-06-10");
    expect(results.map((r) => r.date)).toEqual(["2026-06-10", "2026-06-09", "2026-06-08"]);
  });
});

describe("InMemoryStateStore patient references", () => {
  it("set and batch-get round-trip by patientId", async () => {
    const store = new InMemoryStateStore();
    await store.setPatientReference(2716, "REDES SOCIALES");
    await store.setPatientReference(2351, "GOOGLE");
    const result = await store.batchGetPatientReferences([2716, 2351, 9999]);
    expect(result.get(2716)).toBe("REDES SOCIALES");
    expect(result.get(2351)).toBe("GOOGLE");
    expect(result.has(9999)).toBe(false);
  });

  it("last write wins for the same patient", async () => {
    const store = new InMemoryStateStore();
    await store.setPatientReference(1, "GOOGLE");
    await store.setPatientReference(1, "RECOMENDACION");
    const result = await store.batchGetPatientReferences([1]);
    expect(result.get(1)).toBe("RECOMENDACION");
  });

  it("empty id list returns empty map", async () => {
    const store = new InMemoryStateStore();
    const result = await store.batchGetPatientReferences([]);
    expect(result.size).toBe(0);
  });
});
