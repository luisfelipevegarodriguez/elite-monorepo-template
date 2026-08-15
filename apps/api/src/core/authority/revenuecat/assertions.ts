import type { AssertionResult, ObservationRequest } from './contract.js';
import type { RevenueCatObservation } from './revenuecat-client.js';

export function evaluateAssertions(request: ObservationRequest, observation: RevenueCatObservation): AssertionResult {
  const userIdentityMatch = observation.originalAppUserId === request.appUserId;
  const entitlementExists = observation.entitlement !== null;
  const observedAtMs = Date.parse(observation.observedAt);
  const actionTimestampMs = Date.parse(request.actionTimestamp);
  const expires = observation.entitlement?.expiresDate ?? null;
  const expiresMs = expires === null ? null : Date.parse(expires);
  const entitlementActive = entitlementExists && (expires === null || (expiresMs !== null && Number.isFinite(expiresMs) && expiresMs > observedAtMs));
  const productIdCorrelation = entitlementExists && observation.entitlement?.productIdentifier === request.expectedProductIdentifier;
  const freshnessDeltaSeconds = (observedAtMs - actionTimestampMs) / 1000;
  const freshnessCompliant = Number.isFinite(observedAtMs) && Number.isFinite(actionTimestampMs) && observedAtMs > actionTimestampMs && freshnessDeltaSeconds <= request.freshnessPolicySeconds;
  const expirationPolicyCompliance = entitlementActive && freshnessCompliant;
  const correlationReferenceMatch = userIdentityMatch && entitlementExists && observation.entitlement?.entitlementId === request.expectedEntitlementId;
  return { userIdentityMatch, entitlementExists, entitlementActive, productIdCorrelation, expirationPolicyCompliance, correlationReferenceMatch };
}
