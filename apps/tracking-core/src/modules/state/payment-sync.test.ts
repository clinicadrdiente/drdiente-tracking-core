import { describe, expect, it } from "vitest";
import { InMemoryStateStore } from "./state-store.js";
import {
  filterUnprocessedPayments,
  markPaymentsProcessed,
} from "./payment-sync.js";
import type { PaymentEvent } from "../../types/domain.js";

const makePayment = (id: number): PaymentEvent => ({
  paymentId: id,
  patientId: 1,
  treatmentId: 10,
  paymentAmount: 500,
  budgetTotal: 2000,
  currency: "MXN",
  isVoided: false,
  paidAt: "2026-06-10T10:00:00Z",
});

describe("filterUnprocessedPayments", () => {
  it("returns all payments when none are processed", async () => {
    const store = new InMemoryStateStore();
    const payments = [makePayment(1), makePayment(2)];
    const result = await filterUnprocessedPayments(store, payments);
    expect(result).toHaveLength(2);
  });

  it("filters out already-processed payments", async () => {
    const store = new InMemoryStateStore();
    await store.markPaymentProcessed("payment_1");
    const payments = [makePayment(1), makePayment(2)];
    const result = await filterUnprocessedPayments(store, payments);
    expect(result).toHaveLength(1);
    expect(result[0].paymentId).toBe(2);
  });

  it("returns empty array when all payments are processed", async () => {
    const store = new InMemoryStateStore();
    const payments = [makePayment(1), makePayment(2)];
    await store.markPaymentProcessed("payment_1");
    await store.markPaymentProcessed("payment_2");
    const result = await filterUnprocessedPayments(store, payments);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when input is empty", async () => {
    const store = new InMemoryStateStore();
    const result = await filterUnprocessedPayments(store, []);
    expect(result).toHaveLength(0);
  });
});

describe("markPaymentsProcessed", () => {
  it("marks all payments so subsequent filter returns empty", async () => {
    const store = new InMemoryStateStore();
    const payments = [makePayment(1), makePayment(2)];
    await markPaymentsProcessed(store, payments);
    const result = await filterUnprocessedPayments(store, payments);
    expect(result).toHaveLength(0);
  });

  it("is idempotent", async () => {
    const store = new InMemoryStateStore();
    const payments = [makePayment(1)];
    await markPaymentsProcessed(store, payments);
    await markPaymentsProcessed(store, payments);
    const result = await filterUnprocessedPayments(store, payments);
    expect(result).toHaveLength(0);
  });

  it("does not affect unrelated payments", async () => {
    const store = new InMemoryStateStore();
    await markPaymentsProcessed(store, [makePayment(1)]);
    const result = await filterUnprocessedPayments(store, [makePayment(2)]);
    expect(result).toHaveLength(1);
    expect(result[0].paymentId).toBe(2);
  });
});

describe("claimPaymentProcessed", () => {
  it("returns true on first call, false on second", async () => {
    const store = new InMemoryStateStore();
    const first = await store.claimPaymentProcessed("treatment_42");
    const second = await store.claimPaymentProcessed("treatment_42");
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("different ids are independent claims", async () => {
    const store = new InMemoryStateStore();
    const a = await store.claimPaymentProcessed("treatment_1");
    const b = await store.claimPaymentProcessed("treatment_2");
    expect(a).toBe(true);
    expect(b).toBe(true);
  });
});
