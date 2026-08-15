import type { AssertionResult, ObservationRequest } from './contract.js';
import type { RevenueCatObservation } from './revenuecat-client.js';

export function evaluateAssertions(request: ObservationRequest, observation: RevenueCatObservation): AssertionResult {
  const userIdentityMatch = observation.originalAppUserId === request.appUserId;
  const entitlementExists = observation.entitlement !== null;
  const expires = observation.entitlement?.expiresDate ?? null;
  const observedAtMs = Date.parse(observation.observedAt);
  const expiresMs = expires ? Date.parse(expires) : NaN;
  const entitlementActive = entitlementExists && (!expires || (Number.isFinite(expiresMs) && expiresMs > observedAtMs));
  const productIdCorrelation = entitlementExists && observation.entitlement?.productIdentifier === request.expectedProductIdentifier;
  const actionTimestampMs = Date.parse(request.actionTimestamp);
  const freshnessDeltaSeconds = (observedAtMs - actionTimestampMs) / 1000;
  const expirationPolicyCompliance = entitlementActive && Number.isFinite(freshnessDeltaSeconds);
  const correlationReferenceMatch = userIdentityMatch && entitlementExists && observation.entitlement?.entitlementId === request.expectedEntitlementId;
  return { userIdentityMatch, entitlementExists, entitlementActive, productIdCorrelation, expirationPolicyCompliance, correlationReferenceMatch };
}
