import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { FileStateStore, InMemoryStateStore, RedisStateStore } from "./state-store.js";
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

describe("InMemoryStateStore releasePaymentClaim", () => {
  it("claim -> release -> claim returns true again", async () => {
    const store = new InMemoryStateStore();
    expect(await store.claimPaymentProcessed("treatment_1")).toBe(true);
    expect(await store.claimPaymentProcessed("treatment_1")).toBe(false);
    await store.releasePaymentClaim("treatment_1");
    expect(await store.claimPaymentProcessed("treatment_1")).toBe(true);
  });

  it("release is a no-op for an unclaimed key", async () => {
    const store = new InMemoryStateStore();
    await store.releasePaymentClaim("treatment_missing");
    expect(await store.claimPaymentProcessed("treatment_missing")).toBe(true);
  });

  it("release only affects the targeted key", async () => {
    const store = new InMemoryStateStore();
    await store.claimPaymentProcessed("treatment_1");
    await store.claimPaymentProcessed("treatment_2");
    await store.releasePaymentClaim("treatment_1");
    expect(await store.claimPaymentProcessed("treatment_1")).toBe(true);
    expect(await store.claimPaymentProcessed("treatment_2")).toBe(false);
  });
});

describe("FileStateStore releasePaymentClaim", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "state-store-test-"));
    filePath = join(dir, "state.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("claim -> release -> claim returns true again", async () => {
    const store = new FileStateStore(filePath);
    expect(await store.claimPaymentProcessed("treatment_1")).toBe(true);
    expect(await store.claimPaymentProcessed("treatment_1")).toBe(false);
    await store.releasePaymentClaim("treatment_1");
    expect(await store.claimPaymentProcessed("treatment_1")).toBe(true);
  });

  it("release is a no-op for an unclaimed key", async () => {
    const store = new FileStateStore(filePath);
    await store.releasePaymentClaim("treatment_missing");
    expect(await store.claimPaymentProcessed("treatment_missing")).toBe(true);
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

describe("RedisStateStore dedupe", () => {
  function makeRedisStore(results: unknown[]) {
    const commands: Array<Array<string | number>> = [];
    let call = 0;
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      commands.push(JSON.parse(String(init?.body)) as Array<string | number>);
      const result = call < results.length ? results[call] : null;
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ result }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const store = new RedisStateStore(
      "https://redis.example",
      "token",
      "test",
      fetchImpl,
    );
    return { store, commands };
  }

  it("claimPaymentProcessed issues SET ... NX EX and returns true on OK", async () => {
    const { store, commands } = makeRedisStore(["OK"]);
    const claimed = await store.claimPaymentProcessed("treatment_1");
    expect(claimed).toBe(true);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual([
      "SET",
      "test:payment-sync:processed:k:treatment_1",
      "1",
      "NX",
      "EX",
      expect.any(Number),
    ]);
  });

  it("claimPaymentProcessed returns false when SET NX yields null", async () => {
    const { store, commands } = makeRedisStore([null]);
    const claimed = await store.claimPaymentProcessed("treatment_1");
    expect(claimed).toBe(false);
    expect(commands[0]?.[3]).toBe("NX");
  });

  it("releasePaymentClaim issues a DEL", async () => {
    const { store, commands } = makeRedisStore([1]);
    await store.releasePaymentClaim("treatment_1");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual([
      "DEL",
      "test:payment-sync:processed:k:treatment_1",
    ]);
  });

  it("empty-id savePaymentSyncState issues one SET cursor and no SADD", async () => {
    const { store, commands } = makeRedisStore(["OK"]);
    await store.savePaymentSyncState({
      lastCheckIso: "2026-06-17T00:00:00.000Z",
      processedPaymentIds: [],
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]?.[0]).toBe("SET");
    expect(commands[0]?.[1]).toBe("test:payment-sync:state");
    expect(commands.some((c) => c[0] === "SADD")).toBe(false);
  });
});
