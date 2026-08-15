import type { EvidenceBundle } from './contract.js';

function compareKeys(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => compareKeys(a, b)).map(([key, child]) => [key, sortValue(child)]));
  }
  return value;
}

export function canonicalize(value: unknown): string { return JSON.stringify(sortValue(value)); }

export function canonicalUnsignedBundle(bundle: EvidenceBundle): string {
  const copy = JSON.parse(JSON.stringify(bundle)) as EvidenceBundle;
  copy.integrity.canonical_signature = '';
  return canonicalize(copy);
}
