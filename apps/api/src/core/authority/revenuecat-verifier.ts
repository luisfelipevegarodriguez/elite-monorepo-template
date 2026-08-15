import { createHash, randomUUID } from 'node:crypto';
import type { ExpectedEffect } from './action-ledger.js';

export const REASON_CODES = [
  'NETWORK_AUTHORITY_UNREACHABLE',
  'SUBJECT_NOT_FOUND',
  'ENTITLEMENT_NOT_FOUND',
  'ENTITLEMENT_INACTIVE',
  'CORRELATION_MISMATCH',
  'STALE_DATA_DETECTED',
  'INTEGRITY_FAILURE',
] as const;

export type ReasonCode = typeof REASON_CODES[number];
export type VerdictStatus = 'VERIFIED' | 'BLOCKED_WITH_REASON';

export interface EvidenceBundle {
  bundle_header: {
    bundle_id: string;
    timestamp_utc: string;
    verifier_id: 'REVENUE-CAT-INDEPENDENT-VERIFIER-01';
    contract_reference: 'EC-001-REVENUE-GATE';
    action_reference: string;
    freshness_policy_seconds: number;
  };
  observation_data: {
    source: string;
    http_status: number | null;
    raw_payload_hash: string | null;
    observed_at: string;
    freshness_delta_seconds: number | null;
    observed_product_identifier: string | null;
    observed_expires_date: string | null;
    observed_purchase_date: string | null;
  };
  assertions: {
    user_identity_match: boolean;
    entitlement_active: boolean;
    product_id_correlation: boolean;
    expiration_policy_compliance: boolean;
    correlation_reference_match: boolean;
  };
  verdict: {
    status: VerdictStatus;
    reason_code: ReasonCode | null;
    evidence_confidence: number;
  };
  integrity: { canonical_signature: string };
}

export interface VerificationResult {
  status: VerdictStatus;
  evidenceId: string;
  reason: ReasonCode | null;
  bundle: EvidenceBundle;
}

interface RevenueCatEntitlement {
  expires_date?: string | null;
  purchase_date?: string | null;
  product_identifier?: string | null;
}

interface RevenueCatSubscriber {
  original_app_user_id?: string | null;
  entitlements?: Record<string, RevenueCatEntitlement>;
}

interface RevenueCatResponse { subscriber?: RevenueCatSubscriber; }

const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [0, 500, 1500, 3000];

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function isRetryable(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}

function isoOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function entitlementActive(expiresDate: string | null, observedAtMs: number): boolean {
  return expiresDate === null || Date.parse(expiresDate) > observedAtMs;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

export function canonicalUnsignedBundle(bundle: EvidenceBundle): string {
  const unsigned = { ...bundle, integrity: { canonical_signature: '' } };
  return canonicalize(unsigned);
}

function evidenceId(actionId: string, rawHash: string | null, observedAt: string): string {
  return `ev_${createHash('sha256').update(`${actionId}:${rawHash ?? 'none'}:${observedAt}`).digest('hex').slice(0, 32)}`;
}

function blockedBundle(
  expected: ExpectedEffect,
  actionId: string,
  observedAt: string,
  httpStatus: number | null,
  source: string,
  rawHash: string | null,
  reason: ReasonCode,
  freshnessDelta: number | null,
): EvidenceBundle {
  return {
    bundle_header: {
      bundle_id: randomUUID(),
      timestamp_utc: observedAt,
      verifier_id: 'REVENUE-CAT-INDEPENDENT-VERIFIER-01',
      contract_reference: 'EC-001-REVENUE-GATE',
      action_reference: actionId,
      freshness_policy_seconds: expected.freshnessPolicySeconds,
    },
    observation_data: {
      source,
      http_status: httpStatus,
      raw_payload_hash: rawHash,
      observed_at: observedAt,
      freshness_delta_seconds: freshnessDelta,
      observed_product_identifier: null,
      observed_expires_date: null,
      observed_purchase_date: null,
    },
    assertions: {
      user_identity_match: false,
      entitlement_active: false,
      product_id_correlation: false,
      expiration_policy_compliance: false,
      correlation_reference_match: false,
    },
    verdict: { status: 'BLOCKED_WITH_REASON', reason_code: reason, evidence_confidence: 1.0 },
    integrity: { canonical_signature: '' },
  };
}

export async function verifyRevenueCat(actionId: string, expected: ExpectedEffect): Promise<VerificationResult> {
  const apiKey = process.env.REVENUECAT_SECRET_KEY;
  const source = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(expected.appUserId)}`;
  const actionMs = Date.parse(expected.actionTimestamp);

  if (!apiKey || !Number.isFinite(actionMs) || expected.freshnessPolicySeconds <= 0) {
    const observedAt = new Date().toISOString();
    const bundle = blockedBundle(expected, actionId, observedAt, null, source, null, 'INTEGRITY_FAILURE', null);
    return { status: 'BLOCKED_WITH_REASON', evidenceId: evidenceId(actionId, null, observedAt), reason: 'INTEGRITY_FAILURE', bundle };
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await sleep(BACKOFF_MS[attempt]);
    const observedAt = new Date().toISOString();
    const observedAtMs = Date.parse(observedAt);
    const freshnessDelta = (observedAtMs - actionMs) / 1000;

    if (observedAtMs <= actionMs || freshnessDelta > expected.freshnessPolicySeconds) {
      const bundle = blockedBundle(expected, actionId, observedAt, null, source, null, 'STALE_DATA_DETECTED', freshnessDelta);
      return { status: 'BLOCKED_WITH_REASON', evidenceId: evidenceId(actionId, null, observedAt), reason: 'STALE_DATA_DETECTED', bundle };
    }

    try {
      const response = await fetch(source, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      const rawPayload = await response.text();
      const rawHash = `sha256:${createHash('sha256').update(rawPayload, 'utf8').digest('hex')}`;

      if (!response.ok) {
        if (isRetryable(response.status) && attempt < MAX_ATTEMPTS - 1) continue;
        const reason: ReasonCode = response.status === 404 ? 'SUBJECT_NOT_FOUND' : 'NETWORK_AUTHORITY_UNREACHABLE';
        const bundle = blockedBundle(expected, actionId, observedAt, response.status, source, rawHash, reason, freshnessDelta);
        return { status: 'BLOCKED_WITH_REASON', evidenceId: evidenceId(actionId, rawHash, observedAt), reason, bundle };
      }

      let parsed: RevenueCatResponse;
      try {
        parsed = JSON.parse(rawPayload) as RevenueCatResponse;
      } catch {
        const bundle = blockedBundle(expected, actionId, observedAt, response.status, source, rawHash, 'INTEGRITY_FAILURE', freshnessDelta);
        return { status: 'BLOCKED_WITH_REASON', evidenceId: evidenceId(actionId, rawHash, observedAt), reason: 'INTEGRITY_FAILURE', bundle };
      }

      const subscriber = parsed.subscriber;
      if (!subscriber) {
        const bundle = blockedBundle(expected, actionId, observedAt, response.status, source, rawHash, 'SUBJECT_NOT_FOUND', freshnessDelta);
        return { status: 'BLOCKED_WITH_REASON', evidenceId: evidenceId(actionId, rawHash, observedAt), reason: 'SUBJECT_NOT_FOUND', bundle };
      }

      const userMatch = subscriber.original_app_user_id === expected.appUserId;
      if (!userMatch) {
        const bundle = blockedBundle(expected, actionId, observedAt, response.status, source, rawHash, 'CORRELATION_MISMATCH', freshnessDelta);
        return { status: 'BLOCKED_WITH_REASON', evidenceId: evidenceId(actionId, rawHash, observedAt), reason: 'CORRELATION_MISMATCH', bundle };
      }

      const entitlement = subscriber.entitlements?.[expected.expectedEntitlementId];
      if (!entitlement) {
        const bundle = blockedBundle(expected, actionId, observedAt, response.status, source, rawHash, 'ENTITLEMENT_NOT_FOUND', freshnessDelta);
        bundle.assertions.user_identity_match = true;
        return { status: 'BLOCKED_WITH_REASON', evidenceId: evidenceId(actionId, rawHash, observedAt), reason: 'ENTITLEMENT_NOT_FOUND', bundle };
      }

      const product = entitlement.product_identifier ?? null;
      const expires = isoOrNull(entitlement.expires_date);
      const purchase = isoOrNull(entitlement.purchase_date);
      const active = entitlementActive(expires, observedAtMs);
      const productMatch = product === expected.expectedProductIdentifier;
      const expirationCompliant = active;
      const correlationMatch = productMatch;
      const reason: ReasonCode | null = !active
        ? 'ENTITLEMENT_INACTIVE'
        : !productMatch
          ? 'CORRELATION_MISMATCH'
          : freshnessDelta <= 0 || freshnessDelta > expected.freshnessPolicySeconds
            ? 'STALE_DATA_DETECTED'
            : null;
      const status: VerdictStatus = reason ? 'BLOCKED_WITH_REASON' : 'VERIFIED';

      const bundle: EvidenceBundle = {
        bundle_header: {
          bundle_id: randomUUID(),
          timestamp_utc: observedAt,
          verifier_id: 'REVENUE-CAT-INDEPENDENT-VERIFIER-01',
          contract_reference: 'EC-001-REVENUE-GATE',
          action_reference: actionId,
          freshness_policy_seconds: expected.freshnessPolicySeconds,
        },
        observation_data: {
          source,
          http_status: response.status,
          raw_payload_hash: rawHash,
          observed_at: observedAt,
          freshness_delta_seconds: freshnessDelta,
          observed_product_identifier: product,
          observed_expires_date: expires,
          observed_purchase_date: purchase,
        },
        assertions: {
          user_identity_match: true,
          entitlement_active: active,
          product_id_correlation: productMatch,
          expiration_policy_compliance: expirationCompliant,
          correlation_reference_match: correlationMatch,
        },
        verdict: { status, reason_code: reason, evidence_confidence: 1.0 },
        integrity: { canonical_signature: '' },
      };

      return { status, evidenceId: evidenceId(actionId, rawHash, observedAt), reason, bundle };
    } catch {
      if (attempt === MAX_ATTEMPTS - 1) {
        const bundle = blockedBundle(expected, actionId, observedAt, null, source, null, 'NETWORK_AUTHORITY_UNREACHABLE', freshnessDelta);
        return { status: 'BLOCKED_WITH_REASON', evidenceId: evidenceId(actionId, null, observedAt), reason: 'NETWORK_AUTHORITY_UNREACHABLE', bundle };
      }
    }
  }

  throw new Error('VERIFIER_TERMINATION_INVARIANT_VIOLATION');
}
