# EC-001 — Runtime configuration contract

The following values are required at runtime. Secret values must never be committed to Git.

## Cloud Run Secret Manager secrets

| Secret | Purpose | Required by |
|---|---|---|
| `elite-api-database-url` | Neon/Postgres connection string | Canonical State Authority |
| `elite-api-authority-token` | Bearer token protecting authority endpoints | Authority API |
| `elite-api-revenuecat-secret` | RevenueCat server secret API key | IV-001 |
| `elite-api-canonical-signing-key` | HMAC-SHA256 signing key owned by Canonical State Authority | Evidence sealing |

The Cloud Run service account must have `roles/secretmanager.secretAccessor` on these four secrets.

## GitHub Actions secrets

| Secret | Purpose |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | GitHub OIDC provider |
| `GCP_SERVICE_ACCOUNT` | Deployment service account |
| `GCP_PROJECT` | GCP project ID |
| `GCP_REGION` | Artifact Registry / Cloud Run region |
| `CANONICAL_API_URL` | Public URL of `elite-api` |
| `CANONICAL_AUTHORITY_TOKEN` | Runtime authority token used by the observation workflow |

## Test subject inputs

The real-observation workflow requires an existing controlled RevenueCat App User ID plus:

- expected `product_identifier`
- expected entitlement identifier
- freshness policy (default `300` seconds)

No mock payload, local fixture, cache, executor output, or synthetic success value is accepted as observation evidence.

## Terminal rule

A real observation produces exactly one typed terminal state for the action:

- `VERIFIED`
- `BLOCKED_WITH_REASON`

A blocked action is not promoted by retrying the state transition; the cause must be corrected and a new action may then be registered.
