import { createHash } from 'node:crypto';
import type { ObservationRequest, ObservedEntitlement } from './contract.js';
import type { ReasonCode } from './reason-code.js';
import { canonicalize } from './canonicalize.js';

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

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function canonicalPayloadHash(payload: unknown): string { return `sha256:${createHash('sha256').update(canonicalize(payload), 'utf8').digest('hex')}`; }
function rawBytesHash(raw: string): string { return `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`; }
function reasonForStatus(status: number): ReasonCode {
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SOURCE_UNAVAILABLE';
  return 'INVALID_SOURCE_RESPONSE';
}
function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('INVALID_DATE');
  return new Date(Date.parse(value)).toISOString();
}

export async function observeRevenueCat(request: ObservationRequest): Promise<RevenueCatObservation> {
  const secret = process.env.REVENUECAT_SECRET_KEY;
  const source = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(request.appUserId)}`;
  if (!secret) return { httpStatus: 0, observedAt: new Date().toISOString(), rawPayloadHash: 'sha256:', originalAppUserId: null, entitlement: null, reasonCode: 'MISSING_SECRET', source };

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(source, { method: 'GET', headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' }, signal: controller.signal });
      const raw = await response.text();
      const observedAt = new Date().toISOString();
      if (!response.ok) {
        if (RETRYABLE.has(response.status) && attempt < RETRY_DELAYS_MS.length - 1) continue;
        return { httpStatus: response.status, observedAt, rawPayloadHash: rawBytesHash(raw), originalAppUserId: null, entitlement: null, reasonCode: reasonForStatus(response.status), source };
      }

      let payload: unknown;
      try { payload = JSON.parse(raw); } catch { return { httpStatus: response.status, observedAt, rawPayloadHash: rawBytesHash(raw), originalAppUserId: null, entitlement: null, reasonCode: 'INVALID_SOURCE_RESPONSE', source }; }
      const rawPayloadHash = canonicalPayloadHash(payload);
      const subscriber = (payload as { subscriber?: unknown })?.subscriber;
      if (!subscriber || typeof subscriber !== 'object') return { httpStatus: response.status, observedAt, rawPayloadHash, originalAppUserId: null, entitlement: null, reasonCode: 'INVALID_SOURCE_RESPONSE', source };

      const subscriberRecord = subscriber as { original_app_user_id?: unknown; entitlements?: unknown };
      const originalAppUserId = typeof subscriberRecord.original_app_user_id === 'string' ? subscriberRecord.original_app_user_id : null;
      const entitlements = subscriberRecord.entitlements;
      if (!entitlements || typeof entitlements !== 'object') return { httpStatus: response.status, observedAt, rawPayloadHash, originalAppUserId, entitlement: null, reasonCode: 'INVALID_SOURCE_RESPONSE', source };
      const entitlement = (entitlements as Record<string, unknown>)[request.expectedEntitlementId];
      if (!entitlement || typeof entitlement !== 'object') return { httpStatus: response.status, observedAt, rawPayloadHash, originalAppUserId, entitlement: null, reasonCode: 'NOT_FOUND', source };

      try {
        const record = entitlement as { product_identifier?: unknown; expires_date?: unknown; purchase_date?: unknown };
        return {
          httpStatus: response.status,
          observedAt,
          rawPayloadHash,
          originalAppUserId,
          entitlement: {
            entitlementId: request.expectedEntitlementId,
            productIdentifier: typeof record.product_identifier === 'string' ? record.product_identifier : null,
            expiresDate: normalizeDate(record.expires_date),
            purchaseDate: normalizeDate(record.purchase_date),
          },
          reasonCode: null,
          source,
        };
      } catch {
        return { httpStatus: response.status, observedAt, rawPayloadHash, originalAppUserId, entitlement: null, reasonCode: 'INVALID_SOURCE_RESPONSE', source };
      }
    } catch {
      if (attempt === RETRY_DELAYS_MS.length - 1) return { httpStatus: 0, observedAt: new Date().toISOString(), rawPayloadHash: 'sha256:', originalAppUserId: null, entitlement: null, reasonCode: 'SOURCE_UNAVAILABLE', source };
    } finally { clearTimeout(timer); }
  }
  return { httpStatus: 0, observedAt: new Date().toISOString(), rawPayloadHash: 'sha256:', originalAppUserId: null, entitlement: null, reasonCode: 'SOURCE_UNAVAILABLE', source };
}
