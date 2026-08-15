import { describe, expect, it } from 'vitest';
import { NullifierLedger } from './nullifier-ledger.js';
import { verifyWorldId, type WorldIdProof, type WorldIdSource } from './verifier.js';

const policy = {
  expectedActionId: 'action-1',
  expectedAppId: 'app-1',
  expectedVerificationLevel: 'orb',
  maxMerkleRootAgeSeconds: 300,
};

const proof: WorldIdProof = {
  actionId: 'action-1', appId: 'app-1', userId: 'user-1',
  nullifierHash: 'nullifier-A', merkleRoot: 'root-1', verificationLevel: 'orb', proof: 'real-proof-fixture',
};

const validSource: WorldIdSource = {
  verify: async () => ({ valid: true, merkleRootTimestamp: new Date().toISOString() }),
};

const unavailableSource: WorldIdSource = {
  verify: async () => { throw new Error('timeout'); },
};

describe('IV-002 falsification suite', () => {
  it('accepts a valid proof and atomically records the nullifier', async () => {
    const ledger = new NullifierLedger();
    const result = await verifyWorldId(proof, policy, ledger, validSource, 'test-signing-key');
    expect(result.verdict.status).toBe('VERIFIED');
    expect(ledger.has(proof.nullifierHash)).toBe(true);
  });

  it('blocks duplicate nullifier before external verification', async () => {
    const ledger = new NullifierLedger();
    ledger.record({ nullifierHash: proof.nullifierHash, appId: proof.appId, actionId: proof.actionId, recordedAt: new Date().toISOString(), status: 'RECORDED' });
    const result = await verifyWorldId(proof, policy, ledger, validSource, 'test-signing-key');
    expect(result.verdict).toEqual({ status: 'BLOCKED_WITH_REASON', reason_code: 'NULLIFIER_REPLAY' });
  });

  it('blocks the same nullifier even when the user_id changes', async () => {
    const ledger = new NullifierLedger();
    ledger.record({ nullifierHash: proof.nullifierHash, appId: proof.appId, actionId: proof.actionId, recordedAt: new Date().toISOString(), status: 'RECORDED' });
    const reused = { ...proof, userId: 'different-user' };
    const result = await verifyWorldId(reused, policy, ledger, validSource, 'test-signing-key');
    expect(result.verdict.reason_code).toBe('NULLIFIER_REPLAY');
  });

  it('blocks mismatched action/app identity', async () => {
    const ledger = new NullifierLedger();
    const result = await verifyWorldId({ ...proof, actionId: 'wrong-action' }, policy, ledger, validSource, 'test-signing-key');
    expect(result.verdict.reason_code).toBe('CORRELATION_MISMATCH');
    expect(ledger.has(proof.nullifierHash)).toBe(false);
  });

  it('blocks an invalid verification level', async () => {
    const ledger = new NullifierLedger();
    const result = await verifyWorldId({ ...proof, verificationLevel: 'device' }, policy, ledger, validSource, 'test-signing-key');
    expect(result.verdict.reason_code).toBe('INVALID_VERIFICATION_LEVEL');
    expect(ledger.has(proof.nullifierHash)).toBe(false);
  });

  it('fails closed on verifier-source timeout without recording the nullifier', async () => {
    const ledger = new NullifierLedger();
    const result = await verifyWorldId(proof, policy, ledger, unavailableSource, 'test-signing-key');
    expect(result.verdict).toEqual({ status: 'INCONCLUSIVE', reason_code: 'SOURCE_UNAVAILABLE' });
    expect(ledger.has(proof.nullifierHash)).toBe(false);
  });
});
