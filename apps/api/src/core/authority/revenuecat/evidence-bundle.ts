import { randomUUID } from 'node:crypto';
import type { AssertionResult, EvidenceBundle, ObservationRequest } from './contract.js';
import { CONTRACT_REFERENCE, SCHEMA_VERSION, VERIFIER_ID } from './contract.js';
import type { RevenueCatObservation } from './revenuecat-client.js';
import type { ReasonCode } from './reason-code.js';

export function buildEvidenceBundle(
  request: ObservationRequest,
  observation: RevenueCatObservation,
  assertions: AssertionResult,
  status: 'VERIFIED' | 'BLOCKED_WITH_REASON',
  reasonCode: ReasonCode | null,
  traceId: string,
): EvidenceBundle {
  const observedAtMs = Date.parse(observation.observedAt);
  const actionTimestampMs = Date.parse(request.actionTimestamp);
  const freshnessDeltaSeconds = (observedAtMs - actionTimestampMs) / 1000;
  return {
    bundle_header: {
      schema_version: SCHEMA_VERSION,
      bundle_id: randomUUID(),
      timestamp_utc: new Date().toISOString(),
      verifier_id: VERIFIER_ID,
      contract_reference: CONTRACT_REFERENCE,
      action_reference: request.actionId,
      trace_id: traceId,
      idempotency_key: request.actionId,
      policy_version: 'EC-001/v1',
      freshness_policy_seconds: request.freshnessPolicySeconds,
    },
    observation_data: {
      source: observation.source,
      httpStatus: observation.httpStatus,
      rawPayloadHash: observation.rawPayloadHash,
      observedAt: observation.observedAt,
      freshnessDeltaSeconds,
      observedProductIdentifier: observation.entitlement?.productIdentifier ?? null,
      observedExpiresDate: observation.entitlement?.expiresDate ?? null,
      observedPurchaseDate: observation.entitlement?.purchaseDate ?? null,
    },
    assertions,
    verdict: {
      status,
      reason_code: reasonCode,
      evidence_confidence: status === 'VERIFIED' ? 1.0 : 0.0,
    },
    integrity: {
      raw_payload_hash: observation.rawPayloadHash,
      canonical_signature: '',
    },
  };
}
