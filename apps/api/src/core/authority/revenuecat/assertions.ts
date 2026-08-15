import type { AssertionResult, ObservationRequest } from './contract.js';
import type { RevenueCatObservation } from './revenuecat-client.js';

export function evaluateAssertions(request: ObservationRequest, observation: RevenueCatObservation): AssertionResult {
  const user_identity_match = observation.originalAppUserId === request.appUserId;
  const entitlement_exists = observation.entitlement !== null;
  const observedAtMs = Date.parse(observation.observedAt);
  const actionTimestampMs = Date.parse(request.actionTimestamp);
  const expires = observation.entitlement?.expiresDate ?? null;
  const expiresMs = expires === null ? null : Date.parse(expires);
  const entitlement_active = entitlement_exists && (expires === null || (expiresMs !== null && Number.isFinite(expiresMs) && expiresMs > observedAtMs));
  const product_id_correlation = entitlement_exists && observation.entitlement?.productIdentifier === request.expectedProductIdentifier;
  const freshnessDeltaSeconds = (observedAtMs - actionTimestampMs) / 1000;
  const freshnessCompliant = Number.isFinite(observedAtMs) && Number.isFinite(actionTimestampMs) && observedAtMs > actionTimestampMs && freshnessDeltaSeconds <= request.freshnessPolicySeconds;
  const expiration_policy_compliance = entitlement_active && freshnessCompliant;
  const correlation_reference_match = user_identity_match && entitlement_exists && observation.entitlement?.entitlementId === request.expectedEntitlementId;
  return { user_identity_match, entitlement_exists, entitlement_active, product_id_correlation, expiration_policy_compliance, correlation_reference_match };
}
