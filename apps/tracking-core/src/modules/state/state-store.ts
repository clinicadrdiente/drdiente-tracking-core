import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";

export interface PaymentSyncState {
  lastCheckIso?: string;
  processedPaymentIds: string[];
}

export interface StateStore {
  getPaymentSyncState(): Promise<PaymentSyncState>;
  savePaymentSyncState(state: PaymentSyncState): Promise<void>;
  hasProcessedPayment(paymentId: string): Promise<boolean>;
  markPaymentProcessed(paymentId: string): Promise<void>;
}

export class InMemoryStateStore implements StateStore {
  private paymentSyncState: PaymentSyncState = {
    processedPaymentIds: [],
  };

  async getPaymentSyncState(): Promise<PaymentSyncState> {
    return {
      lastCheckIso: this.paymentSyncState.lastCheckIso,
      processedPaymentIds: [...this.paymentSyncState.processedPaymentIds],
    };
  }

  async savePaymentSyncState(state: PaymentSyncState): Promise<void> {
    this.paymentSyncState = {
      lastCheckIso: state.lastCheckIso,
      processedPaymentIds: [...state.processedPaymentIds],
    };
  }

  async hasProcessedPayment(paymentId: string): Promise<boolean> {
    return this.paymentSyncState.processedPaymentIds.includes(paymentId);
  }

  async markPaymentProcessed(paymentId: string): Promise<void> {
    if (!this.paymentSyncState.processedPaymentIds.includes(paymentId)) {
      this.paymentSyncState.processedPaymentIds.push(paymentId);
    }
  }
}

export class FileStateStore implements StateStore {
  constructor(private readonly filePath: string) {}

  async getPaymentSyncState(): Promise<PaymentSyncState> {
    return this.readState();
  }

  async savePaymentSyncState(state: PaymentSyncState): Promise<void> {
    await this.writeState(state);
  }

  async hasProcessedPayment(paymentId: string): Promise<boolean> {
    const state = await this.readState();
    return state.processedPaymentIds.includes(paymentId);
  }

  async markPaymentProcessed(paymentId: string): Promise<void> {
    const state = await this.readState();
    if (!state.processedPaymentIds.includes(paymentId)) {
      state.processedPaymentIds.push(paymentId);
      await this.writeState(state);
    }
  }

  private async readState(): Promise<PaymentSyncState> {
    try {
      const raw = await readFile(this.absolutePath(), "utf8");
      const parsed = JSON.parse(raw) as PaymentSyncState;
      return {
        lastCheckIso: parsed.lastCheckIso,
        processedPaymentIds: Array.isArray(parsed.processedPaymentIds)
          ? parsed.processedPaymentIds
          : [],
      };
    } catch {
      return { processedPaymentIds: [] };
    }
  }

  private async writeState(state: PaymentSyncState): Promise<void> {
    const path = this.absolutePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2), "utf8");
  }

  private absolutePath(): string {
    if (!isAbsolute(this.filePath) && process.env.VERCEL) {
      return resolve(tmpdir(), this.filePath);
    }

    return resolve(process.cwd(), this.filePath);
  }
}
