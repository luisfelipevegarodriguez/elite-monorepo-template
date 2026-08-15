import { createHash } from 'node:crypto';
import type { ObservationRequest, ObservedEntitlement } from './contract.js';
import type { ReasonCode } from './reason-code.js';

export interface RevenueCatObservation {
  httpStatus: number;
  observedAt: string;
  rawPayloadHash: string;
  originalAppUserId: string | null;
  entitlement: ObservedEntitlement | null;
  reasonCode: ReasonCode | null;
  source: string;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [0, 500, 1500, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashRawPayload(raw: string): string {
  return `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`;
}

function reasonForStatus(status: number): ReasonCode {
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SOURCE_UNAVAILABLE';
  return 'INVALID_SOURCE_RESPONSE';
}

export async function observeRevenueCat(request: ObservationRequest): Promise<RevenueCatObservation> {
  const secret = process.env.REVENUECAT_SECRET_KEY;
  if (!secret) {
    return {
      httpStatus: 0,
      observedAt: new Date().toISOString(),
      rawPayloadHash: 'sha256:',
      originalAppUserId: null,
      entitlement: null,
      reasonCode: 'MISSING_SECRET',
      source: `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(request.appUserId)}`,
    };
  }

  const source = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(request.appUserId)}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(source, {
        method: 'GET',
        headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      lastStatus = response.status;
      const raw = await response.text();
      const observedAt = new Date().toISOString();
      const rawPayloadHash = hashRawPayload(raw);
      if (!response.ok) {
        if (RETRYABLE.has(response.status) && attempt < RETRY_DELAYS_MS.length - 1) continue;
        return { httpStatus: response.status, observedAt, rawPayloadHash, originalAppUserId: null, entitlement: null, reasonCode: reasonForStatus(response.status), source };
      }

      let payload: any;
      try { payload = JSON.parse(raw); } catch {
        return { httpStatus: response.status, observedAt, rawPayloadHash, originalAppUserId: null, entitlement: null, reasonCode: 'INVALID_SOURCE_RESPONSE', source };
      }

      const subscriber = payload?.subscriber;
      if (!subscriber || typeof subscriber !== 'object') {
        return { httpStatus: response.status, observedAt, rawPayloadHash, originalAppUserId: null, entitlement: null, reasonCode: 'INVALID_SOURCE_RESPONSE', source };
      }

      const entitlements = subscriber.entitlements && typeof subscriber.entitlements === 'object' ? subscriber.entitlements : {};
      const entitlement = entitlements[request.expectedEntitlementId];
      if (!entitlement) {
        return { httpStatus: response.status, observedAt, rawPayloadHash, originalAppUserId: subscriber.original_app_user_id ?? null, entitlement: null, reasonCode: 'NOT_FOUND', source };
      }

      return {
        httpStatus: response.status,
        observedAt,
        rawPayloadHash,
        originalAppUserId: subscriber.original_app_user_id ?? null,
        entitlement: {
          entitlementId: request.expectedEntitlementId,
          productIdentifier: typeof entitlement.product_identifier === 'string' ? entitlement.product_identifier : null,
          expiresDate: entitlement.expires_date ?? null,
          purchaseDate: entitlement.purchase_date ?? null,
        },
        reasonCode: null,
        source,
      };
    } catch {
      if (attempt === RETRY_DELAYS_MS.length - 1) {
        return { httpStatus: lastStatus, observedAt: new Date().toISOString(), rawPayloadHash: 'sha256:', originalAppUserId: null, entitlement: null, reasonCode: 'SOURCE_UNAVAILABLE', source };
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return { httpStatus: lastStatus, observedAt: new Date().toISOString(), rawPayloadHash: 'sha256:', originalAppUserId: null, entitlement: null, reasonCode: 'SOURCE_UNAVAILABLE', source };
}
