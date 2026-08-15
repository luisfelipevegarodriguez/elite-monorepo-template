import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export type CanonicalStatus = 'REQUESTED' | 'BLOCKED_WITH_REASON' | 'VERIFIED';

export interface ExpectedEffect {
  kind: 'github_commit_exists';
  repository: string;
  commitSha: string;
}

export interface ActionEntry {
  actionId: string;
  expectedEffect: ExpectedEffect;
  observationMethod: 'github_public_api';
  independentVerifierId: string;
}

export interface ActionState extends ActionEntry {
  canonicalStatus: CanonicalStatus;
  evidenceId: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LedgerRow {
  action_id: string;
  expected_effect: ExpectedEffect;
  observation_method: ActionEntry['observationMethod'];
  independent_verifier_id: string;
  canonical_status: CanonicalStatus;
  evidence_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

const sql = neon(process.env.DATABASE_URL ?? '');

function hashEvent(payload: string, previousHash: string | null): string {
  return createHash('sha256')
    .update(`${previousHash ?? ''}:${payload}`)
    .digest('hex');
}

export async function ensureAuthoritySchema(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL_REQUIRED_FOR_CANONICAL_AUTHORITY');
  }

  await sql`
    CREATE TABLE IF NOT EXISTS action_ledger (
      action_id TEXT PRIMARY KEY,
      expected_effect JSONB NOT NULL,
      observation_method TEXT NOT NULL,
      independent_verifier_id TEXT NOT NULL,
      canonical_status TEXT NOT NULL DEFAULT 'REQUESTED',
      evidence_id TEXT,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS action_ledger_events (
      event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action_id TEXT NOT NULL REFERENCES action_ledger(action_id),
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      previous_hash TEXT,
      event_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function registerIntent(entry: ActionEntry): Promise<ActionState> {
  await ensureAuthoritySchema();
  const payload = JSON.stringify({ type: 'INTENT_REGISTERED', entry });
  const eventHash = hashEvent(payload, null);

  await sql`
    INSERT INTO action_ledger (
      action_id, expected_effect, observation_method, independent_verifier_id
    ) VALUES (
      ${entry.actionId}, ${JSON.stringify(entry.expectedEffect)},
      ${entry.observationMethod}, ${entry.independentVerifierId}
    )
    ON CONFLICT (action_id) DO NOTHING
  `;

  await sql`
    INSERT INTO action_ledger_events (action_id, event_type, payload, previous_hash, event_hash)
    VALUES (${entry.actionId}, 'INTENT_REGISTERED', ${payload}, NULL, ${eventHash})
    ON CONFLICT (event_hash) DO NOTHING
  `;

  const [state] = await sql`
    SELECT action_id, expected_effect, observation_method, independent_verifier_id,
           canonical_status, evidence_id, reason, created_at, updated_at
    FROM action_ledger WHERE action_id = ${entry.actionId}
  ` as LedgerRow[];

  return toState(state);
}

export async function getAction(actionId: string): Promise<ActionState | null> {
  await ensureAuthoritySchema();
  const [state] = await sql`
    SELECT action_id, expected_effect, observation_method, independent_verifier_id,
           canonical_status, evidence_id, reason, created_at, updated_at
    FROM action_ledger WHERE action_id = ${actionId}
  ` as LedgerRow[];
  return state ? toState(state) : null;
}

export async function recordVerification(
  actionId: string,
  evidenceId: string,
  status: 'VERIFIED' | 'BLOCKED_WITH_REASON',
  reason: string | null,
  observation: unknown,
): Promise<ActionState> {
  await ensureAuthoritySchema();
  const current = await getAction(actionId);
  if (!current) throw new Error('ACTION_NOT_FOUND');
  if (current.canonicalStatus === 'VERIFIED') return current;

  const [latestEvent] = await sql`
    SELECT event_hash FROM action_ledger_events
    WHERE action_id = ${actionId}
    ORDER BY created_at DESC LIMIT 1
  ` as Array<{ event_hash: string }>;

  const payload = JSON.stringify({ actionId, evidenceId, status, reason, observation });
  const eventHash = hashEvent(payload, latestEvent?.event_hash ?? null);

  await sql`
    INSERT INTO action_ledger_events (
      action_id, event_type, payload, previous_hash, event_hash
    ) VALUES (
      ${actionId}, 'VERIFICATION', ${payload}, ${latestEvent?.event_hash ?? null}, ${eventHash}
    )
  `;

  await sql`
    UPDATE action_ledger
    SET canonical_status = ${status}, evidence_id = ${evidenceId}, reason = ${reason}, updated_at = NOW()
    WHERE action_id = ${actionId} AND canonical_status <> 'VERIFIED'
  `;

  const updated = await getAction(actionId);
  if (!updated) throw new Error('ACTION_STATE_LOST');
  return updated;
}

function toState(row: LedgerRow): ActionState {
  return {
    actionId: row.action_id,
    expectedEffect: row.expected_effect,
    observationMethod: row.observation_method,
    independentVerifierId: row.independent_verifier_id,
    canonicalStatus: row.canonical_status,
    evidenceId: row.evidence_id,
    reason: row.reason,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
