export type NullifierStatus = 'RECORDED';

export interface NullifierRecord {
  nullifierHash: string;
  appId: string;
  actionId: string;
  recordedAt: string;
  status: NullifierStatus;
}

/** In-memory canonical ledger adapter for falsification tests. Replace with an append-only durable store before production. */
export class NullifierLedger {
  private readonly records = new Map<string, NullifierRecord>();

  has(nullifierHash: string): boolean {
    return this.records.has(nullifierHash);
  }

  get(nullifierHash: string): NullifierRecord | undefined {
    return this.records.get(nullifierHash);
  }

  record(record: NullifierRecord): void {
    if (this.records.has(record.nullifierHash)) {
      throw new Error('NULLIFIER_ALREADY_RECORDED');
    }
    this.records.set(record.nullifierHash, Object.freeze({ ...record }));
  }
}
