import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  getAction,
  registerIntent,
  recordVerification,
  type ActionEntry,
  type ExpectedEffect,
} from '../core/authority/action-ledger.js';
import {
  canonicalUnsignedBundle,
  REASON_CODES,
  verifyRevenueCat,
  type EvidenceBundle,
} from '../core/authority/revenuecat-verifier.js';

interface RegisterBody {
  actionId?: string;
  expectedEffect?: ExpectedEffect;
}

const REASON_SET = new Set<string>(REASON_CODES);

function requireAuthorityToken(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  const configured = process.env.AUTHORITY_TOKEN;
  const presented = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice('Bearer '.length)
    : '';
  if (!configured || !presented) {
    reply.code(503).send({ status: 'BLOCKED_WITH_REASON', reason: 'AUTHORITY_NOT_CONFIGURED' });
    return;
  }
  const configuredBytes = Buffer.from(configured);
  const presentedBytes = Buffer.from(presented);
  const valid = configuredBytes.length === presentedBytes.length && timingSafeEqual(configuredBytes, presentedBytes);
  if (!valid) {
    reply.code(401).send({ status: 'BLOCKED_WITH_REASON', reason: 'AUTHORITY_UNAUTHORIZED' });
    return;
  }
  done();
}

function signBundle(bundle: EvidenceBundle): string {
  const key = process.env.CANONICAL_SIGNING_KEY;
  if (!key) throw new Error('CANONICAL_SIGNING_KEY_REQUIRED');
  return `hmac-sha256:${createHmac('sha256', key).update(canonicalUnsignedBundle(bundle), 'utf8').digest('hex')}`;
}

function validateBundle(bundle: EvidenceBundle, action: Awaited<ReturnType<typeof getAction>>): string | null {
  if (!action) return 'ACTION_NOT_FOUND';
  if (action.canonicalStatus === 'VERIFIED') return 'ALREADY_TERMINAL';
  if (bundle.bundle_header.action_reference !== action.actionId) return 'INTEGRITY_FAILURE';
  if (bundle.bundle_header.contract_reference !== 'EC-001-REVENUE-GATE') return 'INTEGRITY_FAILURE';
  if (bundle.bundle_header.verifier_id !== action.independentVerifierId) return 'INTEGRITY_FAILURE';
  if (bundle.bundle_header.freshness_policy_seconds !== action.expectedEffect.freshnessPolicySeconds) return 'INTEGRITY_FAILURE';
  if (!bundle.observation_data.raw_payload_hash?.startsWith('sha256:')) return 'INTEGRITY_FAILURE';
  if (bundle.verdict.reason_code !== null && !REASON_SET.has(bundle.verdict.reason_code)) return 'INTEGRITY_FAILURE';
  if (bundle.verdict.status !== 'VERIFIED' && bundle.verdict.status !== 'BLOCKED_WITH_REASON') return 'INTEGRITY_FAILURE';

  const allTrue = Object.values(bundle.assertions).every(Boolean);
  if (bundle.verdict.status === 'VERIFIED' && (!allTrue || bundle.verdict.reason_code !== null)) return 'INTEGRITY_FAILURE';
  if (bundle.verdict.status === 'BLOCKED_WITH_REASON' && !bundle.verdict.reason_code) return 'INTEGRITY_FAILURE';
  return null;
}

export async function authorityRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Body: RegisterBody }>('/actions', { preHandler: requireAuthorityToken }, async (request, reply) => {
    const body = request.body;
    const expected = body.expectedEffect;
    if (
      !expected ||
      expected.kind !== 'revenuecat_entitlement_active' ||
      !expected.appUserId ||
      !expected.expectedProductIdentifier ||
      !expected.expectedEntitlementId ||
      !Number.isFinite(Date.parse(expected.actionTimestamp)) ||
      expected.freshnessPolicySeconds <= 0 ||
      expected.freshnessPolicySeconds > 3600
    ) {
      return reply.code(400).send({ status: 'BLOCKED_WITH_REASON', reason: 'INTEGRITY_FAILURE' });
    }

    const entry: ActionEntry = {
      actionId: body.actionId ?? randomUUID(),
      expectedEffect: expected,
      observationMethod: 'revenuecat_v1_customer_info',
      independentVerifierId: 'REVENUE-CAT-INDEPENDENT-VERIFIER-01',
    };
    return reply.code(201).send(await registerIntent(entry));
  });

  server.get<{ Params: { actionId: string } }>('/actions/:actionId', { preHandler: requireAuthorityToken }, async (request, reply) => {
    const state = await getAction(request.params.actionId);
    if (!state) return reply.code(404).send({ status: 'BLOCKED_WITH_REASON', reason: 'ACTION_NOT_FOUND' });
    return state;
  });

  server.post<{ Params: { actionId: string } }>(
    '/actions/:actionId/verify/revenuecat',
    { preHandler: requireAuthorityToken },
    async (request, reply) => {
      const state = await getAction(request.params.actionId);
      if (!state) return reply.code(404).send({ status: 'BLOCKED_WITH_REASON', reason: 'ACTION_NOT_FOUND' });
      if (state.observationMethod !== 'revenuecat_v1_customer_info') {
        return reply.code(409).send({ status: 'BLOCKED_WITH_REASON', reason: 'INTEGRITY_FAILURE' });
      }
      if (state.canonicalStatus === 'VERIFIED') {
        return reply.code(409).send({ status: 'BLOCKED_WITH_REASON', reason: 'ALREADY_TERMINAL' });
      }
      if (state.canonicalStatus === 'BLOCKED_WITH_REASON') {
        return reply.code(409).send({ status: 'BLOCKED_WITH_REASON', reason: 'ACTION_ALREADY_BLOCKED' });
      }

      const result = await verifyRevenueCat(state.actionId, state.expectedEffect);
      const validationError = validateBundle(result.bundle, state);
      if (validationError) {
        const blocked = await recordVerification(state.actionId, result.evidenceId, 'BLOCKED_WITH_REASON', 'INTEGRITY_FAILURE', {
          verifier: result.bundle.bundle_header.verifier_id,
          validationError,
        });
        return reply.code(409).send({ state: blocked, evidence: result.bundle });
      }

      if (!process.env.CANONICAL_SIGNING_KEY) {
        const blocked = await recordVerification(state.actionId, result.evidenceId, 'BLOCKED_WITH_REASON', 'INTEGRITY_FAILURE', {
          verifier: result.bundle.bundle_header.verifier_id,
          reason: 'CANONICAL_SIGNING_KEY_REQUIRED',
        });
        return reply.code(503).send({ state: blocked, evidence: result.bundle });
      }

      result.bundle.integrity.canonical_signature = signBundle(result.bundle);
      const updated = await recordVerification(state.actionId, result.evidenceId, result.status, result.reason, result.bundle);
      return reply.code(result.status === 'VERIFIED' ? 200 : 409).send({ state: updated, evidence: result.bundle });
    },
  );

  server.post<{ Body: { bundle: EvidenceBundle } }>(
    '/evidence-bundles/validate',
    { preHandler: requireAuthorityToken },
    async (request, reply) => {
      const bundle = request.body?.bundle;
      if (!bundle) return reply.code(400).send({ status: 'BLOCKED_WITH_REASON', reason: 'INTEGRITY_FAILURE' });
      const action = await getAction(bundle.bundle_header?.action_reference ?? '');
      const validationError = validateBundle(bundle, action);
      if (validationError) return reply.code(409).send({ status: 'BLOCKED_WITH_REASON', reason: validationError });

      const key = process.env.CANONICAL_SIGNING_KEY;
      if (!key || !bundle.integrity.canonical_signature) {
        return reply.code(503).send({ status: 'BLOCKED_WITH_REASON', reason: 'INTEGRITY_FAILURE' });
      }
      const expected = Buffer.from(signBundle(bundle));
      const presented = Buffer.from(bundle.integrity.canonical_signature);
      if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
        return reply.code(409).send({ status: 'BLOCKED_WITH_REASON', reason: 'INTEGRITY_FAILURE' });
      }
      return { status: 'VERIFIED', bundle_id: bundle.bundle_header.bundle_id };
    },
  );
}
