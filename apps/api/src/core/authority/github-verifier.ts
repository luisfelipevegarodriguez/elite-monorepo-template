import { createHash } from 'node:crypto';
import type { ExpectedEffect } from './action-ledger.js';

export interface VerificationResult {
  status: 'VERIFIED' | 'BLOCKED_WITH_REASON';
  evidenceId: string;
  reason: string | null;
  observation: Record<string, unknown>;
}

export async function verifyGitHubCommit(expected: ExpectedEffect): Promise<VerificationResult> {
  const evidenceId = `ev_${createHash('sha256')
    .update(`${expected.repository}@${expected.commitSha}`)
    .digest('hex')
    .slice(0, 24)}`;

  const url = `https://api.github.com/repos/${expected.repository}/commits/${encodeURIComponent(expected.commitSha)}`;

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'elite-monorepo-independent-verifier',
      },
      signal: AbortSignal.timeout(8_000),
    });

    const body = (await response.json()) as { sha?: unknown; html_url?: unknown };
    const observedSha = typeof body.sha === 'string' ? body.sha : null;
    const observedUrl = typeof body.html_url === 'string' ? body.html_url : null;

    if (response.ok && observedSha === expected.commitSha) {
      return {
        status: 'VERIFIED',
        evidenceId,
        reason: null,
        observation: {
          observer: 'github_public_api',
          httpStatus: response.status,
          repository: expected.repository,
          expectedCommitSha: expected.commitSha,
          observedCommitSha: observedSha,
          observedUrl,
        },
      };
    }

    return {
      status: 'BLOCKED_WITH_REASON',
      evidenceId,
      reason: response.ok ? 'EVIDENCE_MISMATCH' : `OBSERVER_HTTP_${response.status}`,
      observation: {
        observer: 'github_public_api',
        httpStatus: response.status,
        repository: expected.repository,
        expectedCommitSha: expected.commitSha,
        observedCommitSha: observedSha,
      },
    };
  } catch (error) {
    return {
      status: 'BLOCKED_WITH_REASON',
      evidenceId,
      reason: error instanceof Error ? `OBSERVER_UNAVAILABLE:${error.name}` : 'OBSERVER_UNAVAILABLE',
      observation: {
        observer: 'github_public_api',
        repository: expected.repository,
        expectedCommitSha: expected.commitSha,
      },
    };
  }
}
