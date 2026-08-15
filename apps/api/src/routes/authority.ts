import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getAction, registerIntent, recordVerification, type ActionEntry, type ExpectedEffect } from '../core/authority/action-ledger.js';
import { canonicalUnsignedBundle } from '../core/authority/revenuecat/canonicalize.js';
import { isReasonCode } from '../core/authority/revenuecat/reason-code.js';
import { signEvidenceBundle, verifyEvidenceBundleSignature } from '../core/authority/revenuecat/signer.js';
import { verifyEC001 } from '../core/authority/revenuecat/verifier.js';
import type { EvidenceBundle } from '../core/authority/revenuecat/contract.js';

interface RegisterBody { actionId?: string; expectedEffect?: ExpectedEffect }

function requireAuthorityToken(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  const configured = process.env.AUTHORITY_TOKEN;
  const presented = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : '';
  if (!configured || !presented) { reply.code(503).send({ status: 'BLOCKED_WITH_REASON', reason: 'MISSING_CONFIGURATION' }); return; }
  const a = Buffer.from(configured); const b = Buffer.from(presented);
  if (a.length !== b.length || !timingSafeEqual(a, b)) { reply.code(401).send({ status: 'BLOCKED_WITH_REASON', reason: 'UNAUTHORIZED' }); return; }
  done();
}

function validateBundle(bundle: EvidenceBundle, action: Awaited<ReturnType<typeof getAction>>): string | null {
  if (!action) return 'NOT_FOUND';
  if (action.canonicalStatus === 'VERIFIED' || action.canonicalStatus === 'BLOCKED_WITH_REASON') return 'VERIFICATION_FAILED';
  if (bundle.bundle_header.action_reference !== action.actionId) return 'VERIFICATION_FAILED';
  if (bundle.bundle_header.contract_reference !== 'EC-001-REVENUE-GATE') return 'VERIFICATION_FAILED';
  if (bundle.bundle_header.verifier_id !== action.independentVerifierId) return 'VERIFICATION_FAILED';
  if (bundle.bundle_header.idempotency_key !== action.actionId) return 'VERIFICATION_FAILED';
  if (bundle.bundle_header.freshness_policy_seconds !== action.expectedEffect.freshnessPolicySeconds) return 'POLICY_VIOLATION';
  if (!bundle.observation_data.raw_payload_hash?.startsWith('sha256:')) return 'VERIFICATION_FAILED';
  if (!bundle.integrity.raw_payload_hash || bundle.integrity.raw_payload_hash !== bundle.observation_data.raw_payload_hash) return 'INTEGRITY_FAILURE';
  if (!isReasonCode(bundle.verdict.reason_code) && bundle.verdict.reason_code !== null) return 'VERIFICATION_FAILED';

  const observedAt = Date.parse(bundle.observation_data.observed_at);
  const actionAt = Date.parse(action.expectedEffect.actionTimestamp);
  const delta = (observedAt - actionAt) / 1000;
  if (!Number.isFinite(observedAt) || !Number.isFinite(actionAt) || observedAt <= actionAt || delta > action.expectedEffect.freshnessPolicySeconds) return 'POLICY_VIOLATION';
  if (Math.abs(delta - bundle.observation_data.freshness_delta_seconds) > 0.001) return 'INTEGRITY_FAILURE';
  if (bundle.observation_data.http_status !== 200) return 'INVALID_SOURCE_RESPONSE';

  const a = bundle.assertions;
  const allAssertions = Object.values(a).every(Boolean);
  if (bundle.verdict.status === 'VERIFIED' && (!allAssertions || bundle.verdict.reason_code !== null)) return 'VERIFICATION_FAILED';
  if (bundle.verdict.status === 'BLOCKED_WITH_REASON' && !bundle.verdict.reason_code) return 'VERIFICATION_FAILED';
  if (bundle.verdict.status === 'VERIFIED' && bundle.verdict.evidence_confidence !== 1.0) return 'VERIFICATION_FAILED';
  if (bundle.verdict.status === 'BLOCKED_WITH_REASON' && bundle.verdict.evidence_confidence !== 0.0) return 'VERIFICATION_FAILED';
  if (bundle.verdict.status === 'VERIFIED' && (!a.user_identity_match || !a.entitlement_exists || !a.entitlement_active || !a.product_id_correlation || !a.expiration_policy_compliance || !a.correlation_reference_match)) return 'VERIFICATION_FAILED';
  return null;
}

export async function authorityRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Body: RegisterBody }>('/actions', { preHandler: requireAuthorityToken }, async (request, reply) => {
    const expected = request.body?.expectedEffect;
    if (!expected || expected.kind !== 'revenuecat_entitlement_active' || !expected.appUserId || !expected.expectedProductIdentifier || !expected.expectedEntitlementId || !Number.isFinite(Date.parse(expected.actionTimestamp)) || expected.freshnessPolicySeconds <= 0 || expected.freshnessPolicySeconds > 3600) return reply.code(400).send({ status: 'BLOCKED_WITH_REASON', reason: 'VERIFICATION_FAILED' });
    const entry: ActionEntry = { actionId: request.body?.actionId ?? randomUUID(), expectedEffect: expected, observationMethod: 'revenuecat_v1_customer_info', independentVerifierId: 'REVENUE-CAT-INDEPENDENT-VERIFIER-01' };
    return reply.code(201).send(await registerIntent(entry));
  });

  server.get<{ Params: { actionId: string } }>('/actions/:actionId', { preHandler: requireAuthorityToken }, async (request, reply) => {
    const state = await getAction(request.params.actionId);
    if (!state) return reply.code(404).send({ status: 'BLOCKED_WITH_REASON', reason: 'NOT_FOUND' });
    return state;
  });

  server.post<{ Params: { actionId: string } }>('/actions/:actionId/verify/revenuecat', { preHandler: requireAuthorityToken }, async (request, reply) => {
    const state = await getAction(request.params.actionId);
    if (!state) return reply.code(404).send({ status: 'BLOCKED_WITH_REASON', reason: 'NOT_FOUND' });
    if (state.canonicalStatus === 'VERIFIED' || state.canonicalStatus === 'BLOCKED_WITH_REASON') return reply.code(409).send({ status: 'BLOCKED_WITH_REASON', reason: 'VERIFICATION_FAILED' });

    const result = await verifyEC001({ actionId: state.actionId, appUserId: state.expectedEffect.appUserId, expectedProductIdentifier: state.expectedEffect.expectedProductIdentifier, expectedEntitlementId: state.expectedEffect.expectedEntitlementId, actionTimestamp: state.expectedEffect.actionTimestamp, freshnessPolicySeconds: state.expectedEffect.freshnessPolicySeconds });

    if (!process.env.CANONICAL_SIGNING_KEY) {
      const blocked = await recordVerification(state.actionId, result.evidenceId, 'BLOCKED_WITH_REASON', 'MISSING_SECRET', result.bundle);
      return reply.code(503).send({ state: blocked, evidence: result.bundle });
    }

    result.bundle.integrity.canonical_signature = signEvidenceBundle(result.bundle);
    const validationError = validateBundle(result.bundle, state);
    if (validationError || !verifyEvidenceBundleSignature(result.bundle)) {
      const blocked = await recordVerification(state.actionId, result.evidenceId, 'BLOCKED_WITH_REASON', validationError ?? 'VERIFICATION_FAILED', result.bundle);
      return reply.code(409).send({ state: blocked, evidence: result.bundle });
    }

    const finalStatus = result.status === 'VERIFIED' ? 'VERIFIED' : 'BLOCKED_WITH_REASON';
    const updated = await recordVerification(state.actionId, result.evidenceId, finalStatus, result.reasonCode, result.bundle);
    return reply.code(finalStatus === 'VERIFIED' ? 200 : 409).send({ state: updated, evidence: result.bundle, verifier_status: result.status });
  });

  server.post<{ Body: { bundle: EvidenceBundle } }>('/evidence-bundles/validate', { preHandler: requireAuthorityToken }, async (request, reply) => {
    const bundle = request.body?.bundle;
    if (!bundle) return reply.code(400).send({ status: 'BLOCKED_WITH_REASON', reason: 'VERIFICATION_FAILED' });
    const action = await getAction(bundle.bundle_header?.action_reference ?? '');
    const error = validateBundle(bundle, action);
    if (error) return reply.code(409).send({ status: 'BLOCKED_WITH_REASON', reason: error });
    try {
      if (!canonicalUnsignedBundle(bundle) || !verifyEvidenceBundleSignature(bundle)) return reply.code(409).send({ status: 'BLOCKED_WITH_REASON', reason: 'VERIFICATION_FAILED' });
      return { status: 'VERIFIED', bundle_id: bundle.bundle_header.bundle_id };
    } catch {
      return reply.code(503).send({ status: 'BLOCKED_WITH_REASON', reason: 'SIGNING_FAILED' });
    }
  });
}
