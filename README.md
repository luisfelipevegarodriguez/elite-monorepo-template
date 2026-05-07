# 🚀 Elite Monorepo Template

> pnpm + Turborepo + GitHub Actions OIDC + ESLint Crockford + Husky + Renovate + CodeQL

## Stack

- **Gestor de paquetes**: pnpm v9
- **Orquestador**: Turborepo
- **Linter**: ESLint 9 con reglas Crockford-strict (`packages/config-eslint`)
- **Git Hooks**: Husky v9 + lint-staged
- **Actualizaciones**: Renovate (automerge patches/dev) + Dependabot (backup)
- **Seguridad**: CodeQL Analysis (weekly + PR), GHAS
- **CI/CD**: GitHub Actions con OIDC para GCP (sin secrets de larga vida)
- **Review IA**: Qodo PR Agent
- **Container**: Docker multi-stage (Alpine, producción optimizada)

## Uso rápido

```bash
# 1. Crear nuevo repo desde este template
gh repo create mi-org/nuevo-proyecto --template luisfelipevegarodriguez/elite-monorepo-template --clone

# 2. Instalar dependencias
pnpm install

# 3. Configurar secrets en GitHub Settings:
# GCP_WORKLOAD_IDENTITY_PROVIDER
# GCP_SERVICE_ACCOUNT
# GCP_PROJECT_ID
# OPENAI_KEY (para PR Agent)
```

## Secrets requeridos

| Secret | Uso |
|--------|-----|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | OIDC → GCP Cloud Run |
| `GCP_SERVICE_ACCOUNT` | OIDC → GCP Service Account |
| `GCP_PROJECT_ID` | ID proyecto GCP |
| `OPENAI_KEY` | Qodo PR Agent |

## Estructura

```
.
├── apps/              # Aplicaciones (Next.js, API, etc.)
├── packages/
│   └── config-eslint/ # Config ESLint Crockford compartida
├── .github/
│   └── workflows/     # ci.yml, codeql.yml, pr-agent.yml
├── turbo.json
├── pnpm-workspace.yaml
├── renovate.json
├── Dockerfile         # Multi-stage Alpine
└── docker-compose.yml
```
