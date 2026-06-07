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

export class RedisStateStore implements StateStore {
  private readonly stateKey: string;
  private readonly processedSetKey: string;

  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
    keyPrefix: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.stateKey = `${keyPrefix}:payment-sync:state`;
    this.processedSetKey = `${keyPrefix}:payment-sync:processed`;
  }

  async getPaymentSyncState(): Promise<PaymentSyncState> {
    const [stateJson, processedPaymentIds] = await Promise.all([
      this.command<string | null>(["GET", this.stateKey]),
      this.command<string[]>(["SMEMBERS", this.processedSetKey]),
    ]);
    const parsedState = parsePaymentSyncState(stateJson);

    return {
      lastCheckIso: parsedState.lastCheckIso,
      processedPaymentIds: Array.isArray(processedPaymentIds)
        ? processedPaymentIds
        : [],
    };
  }

  async savePaymentSyncState(state: PaymentSyncState): Promise<void> {
    const payload = JSON.stringify({ lastCheckIso: state.lastCheckIso });
    await this.command(["SET", this.stateKey, payload]);

    if (state.processedPaymentIds.length > 0) {
      await this.command([
        "SADD",
        this.processedSetKey,
        ...state.processedPaymentIds,
      ]);
    }
  }

  async hasProcessedPayment(paymentId: string): Promise<boolean> {
    const result = await this.command<number>([
      "SISMEMBER",
      this.processedSetKey,
      paymentId,
    ]);
    return result === 1;
  }

  async markPaymentProcessed(paymentId: string): Promise<void> {
    await this.command(["SADD", this.processedSetKey, paymentId]);
  }

  private async command<T = unknown>(
    command: Array<string | number>,
  ): Promise<T> {
    const response = await this.fetchImpl(this.restUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error(`Redis request failed with status ${response.status}`);
    }

    const body = (await response.json()) as {
      result?: T;
      error?: string;
    };

    if (body.error) {
      throw new Error(`Redis command failed: ${body.error}`);
    }

    return body.result as T;
  }
}

function parsePaymentSyncState(value: string | null): Pick<PaymentSyncState, "lastCheckIso"> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as PaymentSyncState;
    return {
      lastCheckIso:
        typeof parsed.lastCheckIso === "string"
          ? parsed.lastCheckIso
          : undefined,
    };
  } catch {
    return {};
  }
}
