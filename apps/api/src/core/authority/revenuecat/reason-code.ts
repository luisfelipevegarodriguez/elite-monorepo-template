export const REASON_CODES = [
  'MISSING_CONFIGURATION',
  'MISSING_SECRET',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'SOURCE_UNAVAILABLE',
  'NOT_FOUND',
  'INVALID_SOURCE_RESPONSE',
  'CANONICALIZATION_FAILED',
  'SIGNING_FAILED',
  'AUTHORITY_UNAVAILABLE',
  'AUTHORITY_REJECTED',
  'VERIFICATION_FAILED',
  'POLICY_VIOLATION',
  'INTERNAL_ERROR',
] as const;

export type ReasonCode = typeof REASON_CODES[number];

export function isReasonCode(value: unknown): value is ReasonCode {
  return typeof value === 'string' && (REASON_CODES as readonly string[]).includes(value);
}
