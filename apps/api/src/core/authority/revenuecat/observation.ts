import { evaluateAssertions } from './assertions.js';
import { buildEvidenceBundle } from './evidence-bundle.js';
import type { ObservationRequest, VerificationResult } from './contract.js';
import { observeRevenueCat } from './revenuecat-client.js';
import { isReasonCode, type ReasonCode } from './reason-code.js';

function fallbackReason(code: string | null): ReasonCode {
  return code && isReasonCode(code) ? code : 'INTERNAL_ERROR';
}

export async function observeEC001(request: ObservationRequest, traceId: string): Promise<VerificationResult> {
  if (!request.actionId || !request.appUserId || !request.expectedProductIdentifier || !request.expectedEntitlementId) {
    const observation = await observeRevenueCat(request);
    const bundle = buildEvidenceBundle(request, observation, {
      userIdentityMatch: false,
      entitlementExists: false,
      entitlementActive: false,
      productIdCorrelation: false,
      expirationPolicyCompliance: false,
      correlationReferenceMatch: false,
    }, 'BLOCKED_WITH_REASON', 'MISSING_CONFIGURATION', traceId);
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'MISSING_CONFIGURATION', evidenceId: bundle.bundle_header.bundle_id, bundle };
  }

  const observation = await observeRevenueCat(request);
  const assertions = evaluateAssertions(request, observation);
  const observedAtMs = Date.parse(observation.observedAt);
  const actionAtMs = Date.parse(request.actionTimestamp);
  const freshnessDelta = (observedAtMs - actionAtMs) / 1000;

  let status: VerificationResult['status'] = 'VERIFIED';
  let reasonCode: ReasonCode | null = null;
  if (observation.reasonCode) {
    status = observation.reasonCode === 'NOT_FOUND' ? 'INCONCLUSIVE' : 'BLOCKED_WITH_REASON';
    reasonCode = fallbackReason(observation.reasonCode);
  } else if (!Number.isFinite(observedAtMs) || !Number.isFinite(actionAtMs) || observedAtMs <= actionAtMs || freshnessDelta > request.freshnessPolicySeconds) {
    status = 'BLOCKED_WITH_REASON';
    reasonCode = 'POLICY_VIOLATION';
  } else if (!Object.values(assertions).every(Boolean)) {
    status = 'BLOCKED_WITH_REASON';
    if (!assertions.userIdentityMatch) reasonCode = 'VERIFICATION_FAILED';
    else if (!assertions.entitlementExists) reasonCode = 'NOT_FOUND';
    else if (!assertions.entitlementActive) reasonCode = 'POLICY_VIOLATION';
    else if (!assertions.productIdCorrelation || !assertions.correlationReferenceMatch) reasonCode = 'VERIFICATION_FAILED';
    else reasonCode = 'VERIFICATION_FAILED';
  }

  const bundle = buildEvidenceBundle(
    request,
    observation,
    assertions,
    status === 'INCONCLUSIVE' ? 'BLOCKED_WITH_REASON' : status,
    reasonCode,
    traceId,
  );
  return { status, reasonCode, evidenceId: bundle.bundle_header.bundle_id, bundle };
}
