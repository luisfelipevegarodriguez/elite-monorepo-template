import { describe, expect, it } from 'vitest';
import { canonicalize } from './canonicalize.js';
import { isReasonCode, REASON_CODES } from './reason-code.js';
import { evaluateAssertions } from './assertions.js';
import type { ObservationRequest } from './contract.js';

const request: ObservationRequest = {
  actionId: 'action-1',
  appUserId: 'user-1',
  expectedProductIdentifier: 'product.pro',
  expectedEntitlementId: 'pro',
  actionTimestamp: '2026-08-15T10:00:00.000Z',
  freshnessPolicySeconds: 300,
};

describe('IV-001 canonicalization', () => {
  it('is deterministic regardless of object insertion order', () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 }));
  });
});

describe('IV-001 reason codes', () => {
  it('accepts only the closed enum', () => {
    expect(REASON_CODES.length).toBe(14);
    expect(isReasonCode('MISSING_SECRET')).toBe(true);
    expect(isReasonCode('probably')).toBe(false);
  });
});

describe('IV-001 assertions', () => {
  it('does not infer active from an arbitrary active field', () => {
    const result = evaluateAssertions(request, {
      httpStatus: 200,
      observedAt: '2026-08-15T10:00:10.000Z',
      rawPayloadHash: 'sha256:test',
      originalAppUserId: 'user-1',
      entitlement: { entitlementId: 'pro', productIdentifier: 'product.pro', expiresDate: '2026-08-15T11:00:00.000Z', purchaseDate: '2026-08-15T09:59:00.000Z' },
      reasonCode: null,
      source: 'https://api.revenuecat.com/v1/subscribers/user-1',
    });
    expect(result.entitlementActive).toBe(true);
    expect(result.productIdCorrelation).toBe(true);
  });

  it('rejects an expired entitlement', () => {
    const result = evaluateAssertions(request, {
      httpStatus: 200,
      observedAt: '2026-08-15T10:00:10.000Z',
      rawPayloadHash: 'sha256:test',
      originalAppUserId: 'user-1',
      entitlement: { entitlementId: 'pro', productIdentifier: 'product.pro', expiresDate: '2026-08-15T09:00:00.000Z', purchaseDate: null },
      reasonCode: null,
      source: 'https://api.revenuecat.com/v1/subscribers/user-1',
    });
    expect(result.entitlementActive).toBe(false);
  });
});
