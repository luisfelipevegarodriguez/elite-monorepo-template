# 🔐 Secrets Required — OMNI CI v2.0

Pega estos secrets en: GitHub Repo → Settings → Secrets and variables → Actions

## IA Engines
```
GEMINI_API_KEY        → AIza...        (https://aistudio.google.com/apikey)
ANTHROPIC_API_KEY     → sk-ant-...     (https://console.anthropic.com/settings/keys)
OPENAI_API_KEY        → sk-...         (https://platform.openai.com/api-keys)
AI_MASTER_KEY         → (una de las 3 anteriores, la que prefieras para PR-Agent)
```

## Turbo Remote Cache
```
TURBO_TOKEN           → (https://vercel.com/account/tokens o Turborepo Cloud)
TURBO_TEAM            → tu-team-slug
```

## GCP OIDC (sin claves estáticas)
```
GCP_WORKLOAD_IDENTITY_PROVIDER → projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER
GCP_SERVICE_ACCOUNT   → deploy-sa@PROJECT_ID.iam.gserviceaccount.com
GCP_PROJECT           → tu-project-id
GCP_REGION            → europe-west1  (o us-central1)
```

## Setup OIDC en GCP (comandos exactos)
```bash
# 1. Crear Workload Identity Pool
gcloud iam workload-identity-pools create "github-pool" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# 2. Crear Provider
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# 3. Crear Service Account
gcloud iam service-accounts create deploy-sa \
  --project="$PROJECT_ID" \
  --display-name="GitHub Actions Deploy SA"

# 4. Dar permisos (Cloud Run + Artifact Registry)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:deploy-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:deploy-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# 5. Bind identidad GitHub → SA
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding \
  deploy-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/luisfelipevegarodriguez/$(YOUR_REPO)"
```
