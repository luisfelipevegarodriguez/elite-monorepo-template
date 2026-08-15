import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyGitHubCommit } from './github-verifier.js';

const expected = {
  kind: 'github_commit_exists' as const,
  repository: 'luisfelipevegarodriguez/elite-monorepo-template',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('independent GitHub verifier', () => {
  it('accepts an independently observed matching commit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        sha: expected.commitSha,
        html_url: 'https://github.com/luisfelipevegarodriguez/elite-monorepo-template/commit/0123456789abcdef0123456789abcdef01234567',
      }), { status: 200 }),
    ));

    const result = await verifyGitHubCommit(expected);

    expect(result.status).toBe('VERIFIED');
    expect(result.reason).toBeNull();
    expect(result.observation.observer).toBe('github_public_api');
  });

  it('blocks a mismatching observation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sha: 'fedcba9876543210fedcba9876543210fedcba98' }), { status: 200 }),
    ));

    const result = await verifyGitHubCommit(expected);

    expect(result.status).toBe('BLOCKED_WITH_REASON');
    expect(result.reason).toBe('EVIDENCE_MISMATCH');
  });
});
