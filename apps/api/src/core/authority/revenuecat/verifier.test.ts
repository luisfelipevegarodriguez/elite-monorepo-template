import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalize } from './canonicalize.js';
import { isReasonCode, REASON_CODES } from './reason-code.js';
import { evaluateAssertions } from './assertions.js';
import { verifyEC001 } from './verifier.js';
import type { ObservationRequest } from './contract.js';

const request: ObservationRequest = {
  actionId: 'action-1', appUserId: 'user-1', expectedProductIdentifier: 'product.pro', expectedEntitlementId: 'pro', actionTimestamp: new Date(Date.now() - 10_000).toISOString(), freshnessPolicySeconds: 300,
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.REVENUECAT_SECRET_KEY;
});

describe('IV-001 canonicalization', () => {
  it('is deterministic regardless of object insertion order', () => expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 })));
});

describe('IV-001 reason codes', () => {
  it('accepts only the closed enum', () => {
    expect(REASON_CODES.length).toBe(14);
    expect(isReasonCode('MISSING_SECRET')).toBe(true);
    expect(isReasonCode('probably')).toBe(false);
  });
});

describe('IV-001 assertions', () => {
  it('derives active from expiration, never from an arbitrary active field', () => {
    const result = evaluateAssertions(request, {
      httpStatus: 200, observedAt: new Date().toISOString(), rawPayloadHash: 'sha256:test', originalAppUserId: 'user-1',
      entitlement: { entitlementId: 'pro', productIdentifier: 'product.pro', expiresDate: new Date(Date.now() + 60_000).toISOString(), purchaseDate: new Date(Date.now() - 1_000).toISOString() },
      reasonCode: null, source: 'https://api.revenuecat.com/v1/subscribers/user-1',
    });
    expect(result.entitlement_active).toBe(true);
    expect(result.product_id_correlation).toBe(true);
    expect(result.expiration_policy_compliance).toBe(true);
  });

  it('rejects an expired entitlement', () => {
    const result = evaluateAssertions(request, {
      httpStatus: 200, observedAt: new Date().toISOString(), rawPayloadHash: 'sha256:test', originalAppUserId: 'user-1',
      entitlement: { entitlementId: 'pro', productIdentifier: 'product.pro', expiresDate: new Date(Date.now() - 1_000).toISOString(), purchaseDate: null },
      reasonCode: null, source: 'https://api.revenuecat.com/v1/subscribers/user-1',
    });
    expect(result.entitlement_active).toBe(false);
    expect(result.expiration_policy_compliance).toBe(false);
  });
});

describe('IV-001 fail-closed verifier', () => {
  it('cannot verify without a RevenueCat secret', async () => {
    const result = await verifyEC001(request);
    expect(result.status).toBe('BLOCKED_WITH_REASON');
    expect(result.reasonCode).toBe('MISSING_SECRET');
    expect(JSON.stringify(result.bundle)).not.toContain('MISSING_SECRET_VALUE');
  });

  it('accepts a matching external fixture only inside the test boundary', async () => {
    process.env.REVENUECAT_SECRET_KEY = 'test-only-secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      subscriber: { original_app_user_id: 'user-1', entitlements: { pro: { product_identifier: 'product.pro', purchase_date: new Date(Date.now() - 1_000).toISOString(), expires_date: new Date(Date.now() + 60_000).toISOString() } } },
    }), { status: 200 })));
    const result = await verifyEC001(request);
    expect(result.status).toBe('VERIFIED');
    expect(result.bundle.verdict.reason_code).toBeNull();
    expect(result.bundle.integrity.raw_payload_hash).toMatch(/^sha256:/);
    expect(JSON.stringify(result.bundle)).not.toContain('test-only-secret');
  });
});
