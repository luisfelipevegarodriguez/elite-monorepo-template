import { createHash, createHmac } from 'node:crypto';
import { NullifierLedger } from './nullifier-ledger.js';

export type IV002Status = 'VERIFIED' | 'BLOCKED_WITH_REASON' | 'INCONCLUSIVE';
export type IV002Reason =
  | 'NULLIFIER_REPLAY'
  | 'INVALID_PROOF'
  | 'STALE_MERKLE_ROOT'
  | 'INVALID_VERIFICATION_LEVEL'
  | 'SOURCE_UNAVAILABLE'
  | 'CORRELATION_MISMATCH'
  | 'INTEGRITY_FAILURE';

export interface WorldIdProof {
  actionId: string;
  appId: string;
  userId: string;
  nullifierHash: string;
  merkleRoot: string;
  verificationLevel: string;
  proof: string;
}

export interface IV002Policy {
  expectedActionId: string;
  expectedAppId: string;
  expectedVerificationLevel: string;
  maxMerkleRootAgeSeconds: number;
}

export interface WorldIdObservation {
  observedAt: string;
  valid: boolean;
  reason?: IV002Reason;
  source: 'WORLDID_VERIFIER';
}

export interface IV002EvidenceBundle {
  bundleVersion: 'IV-002/EB-001';
  bundleId: string;
  actionId: string;
  observation: WorldIdObservation;
  assertions: {
    action_match: boolean;
    app_id_match: boolean;
    nullifier_unused: boolean;
    verification_level_match: boolean;
  };
  verdict: {
    status: IV002Status;
    reason_code: IV002Reason | null;
  };
  integrity: { payload_hash: string; canonical_signature: string | null };
}

export interface WorldIdSource {
  verify(proof: WorldIdProof): Promise<{ valid: boolean; merkleRootTimestamp?: string }>;
}

function canonicalize(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort(), 0);
}

function sign(payload: unknown, key: string): string {
  return createHmac('sha256', key).update(canonicalize(payload)).digest('hex');
}

function bundleHash(payload: unknown): string {
  return createHash('sha256').update(canonicalize(payload)).digest('hex');
}

export async function verifyWorldId(
  proof: WorldIdProof,
  policy: IV002Policy,
  ledger: NullifierLedger,
  source: WorldIdSource,
  signingKey?: string,
): Promise<IV002EvidenceBundle> {
  const observedAt = new Date().toISOString();
  const base = {
    bundleVersion: 'IV-002/EB-001' as const,
    bundleId: crypto.randomUUID(),
    actionId: proof.actionId,
    observation: { observedAt, valid: false, source: 'WORLDID_VERIFIER' as const },
    assertions: {
      action_match: proof.actionId === policy.expectedActionId,
      app_id_match: proof.appId === policy.expectedAppId,
      nullifier_unused: !ledger.has(proof.nullifierHash),
      verification_level_match: proof.verificationLevel === policy.expectedVerificationLevel,
    },
    verdict: { status: 'INCONCLUSIVE' as IV002Status, reason_code: null as IV002Reason | null },
    integrity: { payload_hash: '', canonical_signature: null as string | null },
  };

  if (!base.assertions.action_match || !base.assertions.app_id_match) {
    base.verdict = { status: 'BLOCKED_WITH_REASON', reason_code: 'CORRELATION_MISMATCH' };
  } else if (!base.assertions.nullifier_unused) {
    base.verdict = { status: 'BLOCKED_WITH_REASON', reason_code: 'NULLIFIER_REPLAY' };
  } else if (!base.assertions.verification_level_match) {
    base.verdict = { status: 'BLOCKED_WITH_REASON', reason_code: 'INVALID_VERIFICATION_LEVEL' };
  } else {
    try {
      const result = await source.verify(proof);
      if (!result.valid) {
        base.verdict = { status: 'BLOCKED_WITH_REASON', reason_code: 'INVALID_PROOF' };
      } else if (result.merkleRootTimestamp) {
        const age = (Date.parse(observedAt) - Date.parse(result.merkleRootTimestamp)) / 1000;
        if (!Number.isFinite(age) || age < 0 || age > policy.maxMerkleRootAgeSeconds) {
          base.verdict = { status: 'BLOCKED_WITH_REASON', reason_code: 'STALE_MERKLE_ROOT' };
        } else {
          base.observation.valid = true;
          base.verdict = { status: 'VERIFIED', reason_code: null };
        }
      } else {
        base.observation.valid = true;
        base.verdict = { status: 'VERIFIED', reason_code: null };
      }
    } catch {
      base.verdict = { status: 'INCONCLUSIVE', reason_code: 'SOURCE_UNAVAILABLE' };
    }
  }

  base.integrity.payload_hash = `sha256:${bundleHash({ ...base, integrity: undefined })}`;
  if (signingKey) base.integrity.canonical_signature = `hmac-sha256:${sign({ ...base, integrity: { ...base.integrity, canonical_signature: undefined } }, signingKey)}`;

  // Atomicity rule: record only after a successful VERIFIED verdict and valid signature.
  if (base.verdict.status === 'VERIFIED' && base.integrity.canonical_signature) {
    ledger.record({
      nullifierHash: proof.nullifierHash,
      appId: proof.appId,
      actionId: proof.actionId,
      recordedAt: observedAt,
      status: 'RECORDED',
    });
  }

  return base;
}
