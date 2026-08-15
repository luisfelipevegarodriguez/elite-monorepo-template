import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  getAction,
  registerIntent,
  recordVerification,
  type ActionEntry,
  type ExpectedEffect,
} from '../core/authority/action-ledger.js';
import { verifyGitHubCommit } from '../core/authority/github-verifier.js';

interface RegisterBody {
  actionId?: string;
  expectedEffect?: ExpectedEffect;
  observationMethod?: 'github_public_api';
  independentVerifierId?: string;
}

export async function authorityRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Body: RegisterBody }>('/actions', async (request, reply) => {
    const body = request.body;
    const expected = body.expectedEffect;

    if (
      !expected ||
      expected.kind !== 'github_commit_exists' ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expected.repository) ||
      !/^[0-9a-f]{40}$/.test(expected.commitSha) ||
      body.observationMethod !== 'github_public_api' ||
      !body.independentVerifierId
    ) {
      return reply.code(400).send({ status: 'BLOCKED_WITH_REASON', reason: 'INVALID_EVIDENCE_CONTRACT' });
    }

    const entry: ActionEntry = {
      actionId: body.actionId ?? randomUUID(),
      expectedEffect: expected,
      observationMethod: 'github_public_api',
      independentVerifierId: body.independentVerifierId,
    };

    const state = await registerIntent(entry);
    return reply.code(201).send(state);
  });

  server.get<{ Params: { actionId: string } }>('/actions/:actionId', async (request, reply) => {
    const state = await getAction(request.params.actionId);
    if (!state) return reply.code(404).send({ status: 'BLOCKED_WITH_REASON', reason: 'ACTION_NOT_FOUND' });
    return state;
  });

  server.post<{ Params: { actionId: string } }>(
    '/actions/:actionId/verify/github-commit',
    async (request, reply) => {
      const state = await getAction(request.params.actionId);
      if (!state) return reply.code(404).send({ status: 'BLOCKED_WITH_REASON', reason: 'ACTION_NOT_FOUND' });
      if (state.observationMethod !== 'github_public_api') {
        return reply.code(409).send({ status: 'BLOCKED_WITH_REASON', reason: 'OBSERVATION_METHOD_MISMATCH' });
      }

      const result = await verifyGitHubCommit(state.expectedEffect);
      const updated = await recordVerification(
        state.actionId,
        result.evidenceId,
        result.status,
        result.reason,
        result.observation,
      );

      return reply.code(result.status === 'VERIFIED' ? 200 : 409).send({ state: updated, evidence: result });
    },
  );
}
