import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalUnsignedBundle, verifyRevenueCat } from './revenuecat-verifier.js';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.REVENUECAT_SECRET_KEY;
});

const action = {
  kind: 'revenuecat_entitlement_active' as const,
  appUserId: 'test-user',
  expectedProductIdentifier: 'product.pro',
  expectedEntitlementId: 'pro',
  actionTimestamp: new Date(Date.now() - 1000).toISOString(),
  freshnessPolicySeconds: 300,
};

describe('EC-001 RevenueCat verifier', () => {
  it('fails closed when the RevenueCat secret is absent', async () => {
    const result = await verifyRevenueCat('action-1', action);
    expect(result.status).toBe('BLOCKED_WITH_REASON');
    expect(result.reason).toBe('INTEGRITY_FAILURE');
  });

  it('verifies a matching active entitlement from an external response', async () => {
    process.env.REVENUECAT_SECRET_KEY = 'test-secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      subscriber: {
        original_app_user_id: 'test-user',
        entitlements: {
          pro: {
            product_identifier: 'product.pro',
            purchase_date: new Date(Date.now() - 1000).toISOString(),
            expires_date: new Date(Date.now() + 60_000).toISOString(),
          },
        },
      },
    }), { status: 200 })));

    const result = await verifyRevenueCat('action-2', action);

    expect(result.status).toBe('VERIFIED');
    expect(result.bundle.verdict.reason_code).toBeNull();
    expect(result.bundle.assertions).toEqual({
      user_identity_match: true,
      entitlement_active: true,
      product_id_correlation: true,
      expiration_policy_compliance: true,
      correlation_reference_match: true,
    });
    expect(result.bundle.observation_data.raw_payload_hash).toMatch(/^sha256:/);
    expect(canonicalUnsignedBundle(result.bundle)).not.toContain('undefined');
  });

  it('blocks a product correlation mismatch', async () => {
    process.env.REVENUECAT_SECRET_KEY = 'test-secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      subscriber: {
        original_app_user_id: 'test-user',
        entitlements: { pro: { product_identifier: 'product.other', expires_date: null } },
      },
    }), { status: 200 })));

    const result = await verifyRevenueCat('action-3', action);
    expect(result.status).toBe('BLOCKED_WITH_REASON');
    expect(result.reason).toBe('CORRELATION_MISMATCH');
  });

  it('blocks an expired entitlement', async () => {
    process.env.REVENUECAT_SECRET_KEY = 'test-secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      subscriber: {
        original_app_user_id: 'test-user',
        entitlements: { pro: { product_identifier: 'product.pro', expires_date: new Date(Date.now() - 1000).toISOString() } },
      },
    }), { status: 200 })));

    const result = await verifyRevenueCat('action-4', action);
    expect(result.status).toBe('BLOCKED_WITH_REASON');
    expect(result.reason).toBe('ENTITLEMENT_INACTIVE');
  });
});
