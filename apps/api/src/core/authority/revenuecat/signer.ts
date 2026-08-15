import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EvidenceBundle } from './contract.js';
import { canonicalUnsignedBundle } from './canonicalize.js';

export function signEvidenceBundle(bundle: EvidenceBundle): string {
  const key = process.env.CANONICAL_SIGNING_KEY;
  if (!key) throw new Error('MISSING_SECRET');
  return `hmac-sha256:${createHmac('sha256', key).update(canonicalUnsignedBundle(bundle), 'utf8').digest('hex')}`;
}

export function verifyEvidenceBundleSignature(bundle: EvidenceBundle): boolean {
  const expected = Buffer.from(signEvidenceBundle(bundle));
  const presented = Buffer.from(bundle.integrity.canonical_signature || '');
  return expected.length === presented.length && timingSafeEqual(expected, presented);
}
