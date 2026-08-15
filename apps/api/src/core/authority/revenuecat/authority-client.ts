import type { EvidenceBundle } from './contract.js';
import type { ReasonCode } from './reason-code.js';

export interface AuthorityResponse {
  status: 'VERIFIED' | 'BLOCKED_WITH_REASON';
  bundleId?: string;
  reasonCode?: ReasonCode | string;
}

export async function submitEvidenceBundle(bundle: EvidenceBundle): Promise<AuthorityResponse> {
  const baseUrl = process.env.CANONICAL_AUTHORITY_URL;
  const token = process.env.AUTHORITY_TOKEN;
  if (!baseUrl || !token) return { status: 'BLOCKED_WITH_REASON', reasonCode: 'MISSING_CONFIGURATION' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/authority/evidence-bundles/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': bundle.bundle_header.idempotency_key,
      },
      body: JSON.stringify({ bundle }),
      signal: controller.signal,
    });
    let body: any = null;
    try { body = await response.json(); } catch { /* handled below */ }
    if (!response.ok) return { status: 'BLOCKED_WITH_REASON', reasonCode: body?.reason ?? body?.reasonCode ?? 'AUTHORITY_REJECTED' };
    if (body?.status !== 'VERIFIED') return { status: 'BLOCKED_WITH_REASON', reasonCode: 'AUTHORITY_REJECTED' };
    return { status: 'VERIFIED', bundleId: body.bundle_id };
  } catch {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'AUTHORITY_UNAVAILABLE' };
  } finally {
    clearTimeout(timer);
  }
}
