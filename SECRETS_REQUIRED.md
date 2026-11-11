# 🔐 Secrets — OMNI CI v2.1

> Settings → Secrets and variables → Actions → New repository secret

## IA Engines (prioridad 1)
```
GEMINI_API_KEY        AIza...        https://aistudio.google.com/apikey
ANTHROPIC_API_KEY     sk-ant-...     https://console.anthropic.com/settings/keys
OPENAI_API_KEY        sk-...         https://platform.openai.com/api-keys
AI_MASTER_KEY         (una de las 3 anteriores)
```

## Turbo Remote Cache (prioridad 2 — acelera CI x3)
```
TURBO_TOKEN           token de Vercel  https://vercel.com/account/tokens
TURBO_TEAM            tu-team-slug     (slug visible en vercel.com/teams)
```

## GCP OIDC — zero static keys (prioridad 3)
```
GCP_WORKLOAD_IDENTITY_PROVIDER
  └ projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider

GCP_SERVICE_ACCOUNT
  └ deploy-sa@PROJECT_ID.iam.gserviceaccount.com

GCP_PROJECT
  └ tu-project-id

GCP_REGION
  └ europe-west1
```
