export const CONTRACT_REFERENCE = 'EC-001-REVENUE-GATE' as const;
export const VERIFIER_ID = 'REVENUE-CAT-INDEPENDENT-VERIFIER-01' as const;
export const OBSERVATION_METHOD = 'revenuecat_v1_customer_info' as const;
export const SCHEMA_VERSION = 'EB-001/v1' as const;

export interface ObservationRequest {
  actionId: string;
  appUserId: string;
  expectedProductIdentifier: string;
  expectedEntitlementId: string;
  actionTimestamp: string;
  freshnessPolicySeconds: number;
}

export interface ObservedEntitlement {
  entitlementId: string;
  productIdentifier: string | null;
  expiresDate: string | null;
  purchaseDate: string | null;
}

export interface ObservationData {
  source: string;
  httpStatus: number;
  rawPayloadHash: string;
  observedAt: string;
  freshnessDeltaSeconds: number;
  observedProductIdentifier: string | null;
  observedExpiresDate: string | null;
  observedPurchaseDate: string | null;
}

export interface AssertionResult {
  userIdentityMatch: boolean;
  entitlementExists: boolean;
  entitlementActive: boolean;
  productIdCorrelation: boolean;
  expirationPolicyCompliance: boolean;
  correlationReferenceMatch: boolean;
}

export type VerificationStatus = 'VERIFIED' | 'BLOCKED_WITH_REASON' | 'INCONCLUSIVE';

export interface EvidenceBundle {
  bundle_header: {
    schema_version: typeof SCHEMA_VERSION;
    bundle_id: string;
    timestamp_utc: string;
    verifier_id: typeof VERIFIER_ID;
    contract_reference: typeof CONTRACT_REFERENCE;
    action_reference: string;
    trace_id: string;
    idempotency_key: string;
    policy_version: string;
    freshness_policy_seconds: number;
  };
  observation_data: ObservationData;
  assertions: AssertionResult;
  verdict: {
    status: Exclude<VerificationStatus, 'INCONCLUSIVE'>;
    reason_code: string | null;
    evidence_confidence: 1.0 | 0.0;
  };
  integrity: {
    raw_payload_hash: string;
    canonical_signature: string;
  };
}

export interface VerificationResult {
  status: VerificationStatus;
  reasonCode: string | null;
  evidenceId: string;
  bundle: EvidenceBundle;
}
