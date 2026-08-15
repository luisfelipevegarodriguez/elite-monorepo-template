import { createHash, createHmac, randomUUID } from 'node:crypto';
import { NullifierLedger } from './nullifier-ledger.js';

export type IV002Status = 'VERIFIED' | 'BLOCKED_WITH_REASON' | 'INCONCLUSIVE';
export type IV002Reason = 'NULLIFIER_REPLAY' | 'INVALID_PROOF' | 'STALE_MERKLE_ROOT' | 'INVALID_VERIFICATION_LEVEL' | 'SOURCE_UNAVAILABLE' | 'CORRELATION_MISMATCH' | 'INTEGRITY_FAILURE';
export interface WorldIdProof { actionId: string; appId: string; userId: string; nullifierHash: string; merkleRoot: string; verificationLevel: string; proof: string; }
export interface IV002Policy { expectedActionId: string; expectedAppId: string; expectedVerificationLevel: string; maxMerkleRootAgeSeconds: number; }
export interface WorldIdObservation { observedAt: string; valid: boolean; source: 'WORLDID_VERIFIER'; }
export interface IV002EvidenceBundle { bundleVersion: 'IV-002/EB-001'; bundleId: string; actionId: string; observation: WorldIdObservation; assertions: { action_match: boolean; app_id_match: boolean; nullifier_unused: boolean; verification_level_match: boolean }; verdict: { status: IV002Status; reason_code: IV002Reason | null }; integrity: { payload_hash: string; canonical_signature: string | null }; }
export interface WorldIdSource { verify(proof: WorldIdProof): Promise<{ valid: boolean; merkleRootTimestamp?: string }>; }

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}
const hash = (value: unknown) => createHash('sha256').update(canonicalize(value)).digest('hex');
const sign = (value: unknown, key: string) => createHmac('sha256', key).update(canonicalize(value)).digest('hex');

export async function verifyWorldId(proof: WorldIdProof, policy: IV002Policy, ledger: NullifierLedger, source: WorldIdSource, signingKey?: string): Promise<IV002EvidenceBundle> {
  const observedAt = new Date().toISOString();
  const bundle: IV002EvidenceBundle = {
    bundleVersion: 'IV-002/EB-001', bundleId: randomUUID(), actionId: proof.actionId,
    observation: { observedAt, valid: false, source: 'WORLDID_VERIFIER' },
    assertions: { action_match: proof.actionId === policy.expectedActionId, app_id_match: proof.appId === policy.expectedAppId, nullifier_unused: !ledger.has(proof.nullifierHash), verification_level_match: proof.verificationLevel === policy.expectedVerificationLevel },
    verdict: { status: 'INCONCLUSIVE', reason_code: null }, integrity: { payload_hash: '', canonical_signature: null },
  };
  if (!bundle.assertions.action_match || !bundle.assertions.app_id_match) bundle.verdict = { status: 'BLOCKED_WITH_REASON', reason_code: 'CORRELATION_MISMATCH' };
  else if (!bundle.assertions.nullifier_unused) bundle.verdict = { status: 'BLOCKED_WITH_REASON', reason_code: 'NULLIFIER_REPLAY' };
  else if (!bundle.assertions.verification_level_match) bundle.verdict = { status: 'BLOCKED_WITH_REASON', reason_code: 'INVALID_VERIFICATION_LEVEL' };
  else {
    try {
      const result = await source.verify(proof);
      if (!result.valid) bundle.verdict = { status: 'BLOCKED_WITH_REASON', reason_code: 'INVALID_PROOF' };
      else if (result.merkleRootTimestamp) {
        const age = (Date.parse(observedAt) - Date.parse(result.merkleRootTimestamp)) / 1000;
        bundle.verdict = Number.isFinite(age) && age >= 0 && age <= policy.maxMerkleRootAgeSeconds ? { status: 'VERIFIED', reason_code: null } : { status: 'BLOCKED_WITH_REASON', reason_code: 'STALE_MERKLE_ROOT' };
        bundle.observation.valid = bundle.verdict.status === 'VERIFIED';
      } else { bundle.observation.valid = true; bundle.verdict = { status: 'VERIFIED', reason_code: null }; }
    } catch { bundle.verdict = { status: 'INCONCLUSIVE', reason_code: 'SOURCE_UNAVAILABLE' }; }
  }
  const unsigned = { ...bundle, integrity: { payload_hash: '', canonical_signature: null } };
  bundle.integrity.payload_hash = `sha256:${hash(unsigned)}`;
  if (signingKey) bundle.integrity.canonical_signature = `hmac-sha256:${sign({ ...bundle, integrity: { payload_hash: bundle.integrity.payload_hash, canonical_signature: null } }, signingKey)}`;
  if (bundle.verdict.status === 'VERIFIED' && bundle.integrity.canonical_signature) ledger.record({ nullifierHash: proof.nullifierHash, appId: proof.appId, actionId: proof.actionId, recordedAt: observedAt, status: 'RECORDED' });
  return bundle;
}
