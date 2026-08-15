import { randomUUID } from 'node:crypto';
import type { ObservationRequest, VerificationResult } from './contract.js';
import { observeEC001 } from './observation.js';

export async function verifyEC001(request: ObservationRequest): Promise<VerificationResult> {
  const traceId = randomUUID();
  return observeEC001(request, traceId);
}
