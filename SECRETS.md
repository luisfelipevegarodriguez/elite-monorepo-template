# 🔐 Secrets — Checklist completo

Copia y pega en tu terminal con los valores reales. El orden importa.

## 1. GCP (desde terraform output)

```bash
cd infra/terraform
terraform init && terraform apply

gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER \
  --body "$(terraform output -raw workload_identity_provider)" \
  -R luisfelipevegarodriguez/elite-monorepo-template

gh secret set GCP_SERVICE_ACCOUNT \
  --body "$(terraform output -raw service_account_email)" \
  -R luisfelipevegarodriguez/elite-monorepo-template

gh secret set GCP_PROJECT_ID \
  --body "MI-PROJECT-ID" \
  -R luisfelipevegarodriguez/elite-monorepo-template
```

## 2. Database — Neon

```bash
# Obtener en: https://console.neon.tech → tu proyecto → Connection string
gh secret set DATABASE_URL \
  --body "postgres://user:pass@host.neon.tech/dbname?sslmode=require" \
  -R luisfelipevegarodriguez/elite-monorepo-template
```

## 3. AI — OpenAI (Qodo PR Agent)

```bash
# Obtener en: https://platform.openai.com/api-keys
gh secret set OPENAI_KEY \
  --body "sk-proj-..." \
  -R luisfelipevegarodriguez/elite-monorepo-template
```

## 4. Redis — Upstash

```bash
# Obtener en: https://console.upstash.com → tu Redis → REST URL
gh secret set REDIS_URL \
  --body "rediss://default:...@...upstash.io:6379" \
  -R luisfelipevegarodriguez/elite-monorepo-template
```

## 5. RPC — Alchemy / Infura

```bash
# Obtener en: https://dashboard.alchemy.com → Apps → API Key
gh secret set RPC_URL \
  --body "https://eth-mainnet.g.alchemy.com/v2/TU-API-KEY" \
  -R luisfelipevegarodriguez/elite-monorepo-template
```

## 6. App URL

```bash
# Tu dominio de producción (después del primer deploy)
gh secret set WEB_URL \
  --body "https://tu-dominio.com" \
  -R luisfelipevegarodriguez/elite-monorepo-template
```

## Verificar secrets configurados

```bash
gh secret list -R luisfelipevegarodriguez/elite-monorepo-template
```

## Estado esperado

```
NAME                           UPDATED
DATABASE_URL                   just now
GCP_PROJECT_ID                 just now
GCP_SERVICE_ACCOUNT            just now
GCP_WORKLOAD_IDENTITY_PROVIDER just now
OPENAI_KEY                     just now
REDIS_URL                      just now
RPC_URL                        just now
WEB_URL                        just now
```
