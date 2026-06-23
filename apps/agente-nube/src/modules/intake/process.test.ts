import { describe, expect, it } from "vitest";
import { processLeadHandoff, type LeadMirror, type LeadPersistence } from "./process.js";
import type { CanonicalLead, LeadHandoffInput } from "../../types/domain.js";

const input: LeadHandoffInput = {
  eventId: "lead_roma_1",
  occurredAt: "2026-06-23T18:00:00.000Z",
  account: "roma",
  firstName: "Juan",
  phone: "+52 55 1234 5678",
  email: "JUAN@Example.com",
};

class FakeSupabase implements LeadPersistence {
  inserted: boolean;
  calls: CanonicalLead[] = [];
  constructor(inserted: boolean, private readonly configured = true) {
    this.inserted = inserted;
  }
  isConfigured(): boolean {
    return this.configured;
  }
  async upsertLead(lead: CanonicalLead): Promise<{ inserted: boolean }> {
    this.calls.push(lead);
    return { inserted: this.inserted };
  }
}

class FakeSheets implements LeadMirror {
  calls: CanonicalLead[] = [];
  constructor(private readonly configured = true) {}
  isConfigured(): boolean {
    return this.configured;
  }
  async appendLead(lead: CanonicalLead): Promise<void> {
    this.calls.push(lead);
  }
}

describe("processLeadHandoff", () => {
  it("normaliza, persiste en Supabase y refleja en Sheets en alta nueva", async () => {
    const supabase = new FakeSupabase(true);
    const sheets = new FakeSheets(true);
    const result = await processLeadHandoff(input, {
      supabase,
      sheets,
      now: () => "2026-06-23T18:00:01.000Z",
    });

    expect(result.deduped).toBe(false);
    expect(result.supabase).toBe("ok");
    expect(result.sheets).toBe("ok");
    expect(supabase.calls[0]?.phoneNormalized).toBe("525512345678");
    expect(supabase.calls[0]?.emailNormalized).toBe("juan@example.com");
    expect(sheets.calls).toHaveLength(1);
  });

  it("no duplica fila en Sheets cuando el lead ya existía", async () => {
    const supabase = new FakeSupabase(false);
    const sheets = new FakeSheets(true);
    const result = await processLeadHandoff(input, { supabase, sheets });

    expect(result.deduped).toBe(true);
    expect(sheets.calls).toHaveLength(0);
  });

  it("degrada cuando las integraciones no están configuradas", async () => {
    const result = await processLeadHandoff(input, {
      supabase: new FakeSupabase(true, false),
      sheets: new FakeSheets(false),
    });
    expect(result.supabase).toBe("skipped");
    expect(result.sheets).toBe("skipped");
  });
});
