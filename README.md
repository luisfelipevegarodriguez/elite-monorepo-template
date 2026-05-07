# 🚀 Elite Monorepo Template

> **Gold Standard 2026** · pnpm · Turborepo · Next.js 15 · Fastify 5 · Drizzle · Radix UI · GCP OIDC · CodeQL · ESLint Crockford

[![CI](https://github.com/luisfelipevegarodriguez/elite-monorepo-template/actions/workflows/ci.yml/badge.svg)](https://github.com/luisfelipevegarodriguez/elite-monorepo-template/actions/workflows/ci.yml)
[![CodeQL](https://github.com/luisfelipevegarodriguez/elite-monorepo-template/actions/workflows/codeql.yml/badge.svg)](https://github.com/luisfelipevegarodriguez/elite-monorepo-template/actions/workflows/codeql.yml)

## ⚡ Uso en 60 segundos

```bash
# 1. Crear nuevo proyecto desde este template
gh repo create mi-org/nuevo-proyecto \
  --template luisfelipevegarodriguez/elite-monorepo-template \
  --clone && cd nuevo-proyecto

# 2. Instalar dependencias
pnpm install

# 3. Provisionar infra GCP (una vez)
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # edita PROJECT_ID
terraform init && terraform apply

# 4. Inyectar secrets desde outputs de Terraform
gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER \
  --body "$(terraform output -raw workload_identity_provider)" \
  -R mi-org/nuevo-proyecto
gh secret set GCP_SERVICE_ACCOUNT \
  --body "$(terraform output -raw service_account_email)" \
  -R mi-org/nuevo-proyecto
gh secret set GCP_PROJECT_ID --body "MI-PROJECT-ID" -R mi-org/nuevo-proyecto
gh secret set OPENAI_KEY     --body "sk-..."         -R mi-org/nuevo-proyecto
gh secret set DATABASE_URL   --body "postgres://..." -R mi-org/nuevo-proyecto

# 5. Primer deploy automático
git commit --allow-empty -m "chore: trigger deploy" && git push
```

## 🗂️ Estructura

```
.
├── apps/
│   ├── api/              # Fastify 5 · TypeScript strict · /health · /api/v1
│   └── web/              # Next.js 15 App Router · Tailwind v4 · React 19
├── packages/
│   ├── config-eslint/    # Reglas Crockford: no-eval, no-plusplus, eqeqeq…
│   ├── ui/               # Button · Card · Badge (Radix UI + CVA + twMerge)
│   └── db/               # Drizzle ORM + Neon · schema: users, sessions
├── infra/terraform/      # OIDC pool · SA · Artifact Registry · Cloud Run · Secret Manager
├── .github/
│   └── workflows/
│       ├── ci.yml        # Matrix Node 20/22 · build/lint/test · deploy GCP OIDC
│       ├── codeql.yml    # Análisis seguridad JS/TS — weekly + PR
│       └── pr-agent.yml  # Qodo AI review automático en cada PR
├── turbo.json            # Pipeline: build › lint › test › dev
├── pnpm-workspace.yaml
├── renovate.json         # Automerge patches · timezone Madrid
└── docker-compose.yml    # Entornos prod + dev
```

## 🔐 Secrets requeridos

| Secret | Origen | Uso |
|--------|--------|-----|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `terraform output` | OIDC → GCP |
| `GCP_SERVICE_ACCOUNT` | `terraform output` | OIDC → GCP |
| `GCP_PROJECT_ID` | Manual | Docker push / Cloud Run |
| `OPENAI_KEY` | [platform.openai.com](https://platform.openai.com) | Qodo PR Agent |
| `DATABASE_URL` | Neon console | Drizzle / Cloud Run |

## 🏗️ Infraestructura GCP provisionada

- **Workload Identity Federation** — GitHub Actions sin JSON keys
- **Artifact Registry** — `elite-monorepo` Docker repository
- **Cloud Run v2** — `elite-api` + `elite-web` · autoscaling 0→10 · healthchecks
- **Secret Manager** — `DATABASE_URL` inyectado en runtime

## 🛡️ Seguridad

- CodeQL Analysis (JS/TS) en cada PR + semanal
- ESLint Crockford-strict: `no-eval`, `no-with`, `no-plusplus`, `eqeqeq`, `no-var`
- Husky pre-commit: bloquea código que no pase lint
- Renovate: automerge patches y devDependencies
- Dependabot: backup de actualizaciones
- Security headers en Next.js: `X-Frame-Options`, `nosniff`, `Permissions-Policy`

## 🧑‍💻 Desarrollo local

```bash
pnpm dev          # Levanta todos los apps en paralelo (Turborepo)
pnpm lint         # ESLint en todo el monorepo
pnpm test         # Vitest en todos los packages
pnpm build        # Build optimizado de producción

# Solo un app
pnpm --filter @repo/api dev
pnpm --filter @repo/web dev

# DB
pnpm --filter @repo/db db:push     # push schema a Neon
pnpm --filter @repo/db db:studio   # Drizzle Studio UI
```

## 📦 Añadir un nuevo package

```bash
mkdir packages/mi-lib && cd packages/mi-lib
pnpm init
# Añadir "@repo/eslint-config": "workspace:*" como devDependency
# Turbo lo incluye automáticamente en el pipeline
```

---

Hecho con ❤️ por [@luisfelipevegarodriguez](https://github.com/luisfelipevegarodriguez)
