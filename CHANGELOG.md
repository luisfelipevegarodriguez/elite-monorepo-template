# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-05-07

### Added

#### Apps
- `apps/api` — Fastify 5 + TypeScript strict + @fastify/helmet + cors + rate-limit + Vitest
- `apps/web` — Next.js 15 App Router + Tailwind CSS v4 + React 19 + React Compiler

#### Packages
- `packages/config-eslint` — ESLint 9 Crockford-strict (no-eval, no-plusplus, eqeqeq, no-var, prefer-const)
- `packages/ui` — Design system: Button, Card, Badge (Radix UI + CVA + tailwind-merge)
- `packages/db` — Drizzle ORM + Neon serverless · schema: users, sessions

#### CI/CD & Security
- GitHub Actions CI matrix Node 20/22 con caché pnpm
- Deploy GCP Cloud Run via OIDC (sin JSON keys)
- CodeQL Analysis JS/TS semanal + PR
- Qodo PR Agent review automático
- Renovate automerge patches/dev · timezone Europe/Madrid
- Dependabot npm + Actions cada lunes
- Husky pre-commit con lint-staged

#### Infrastructure (Terraform)
- Workload Identity Pool + Provider (GitHub OIDC)
- Service Account con roles run.developer + artifactregistry.writer
- Artifact Registry Docker repository
- Cloud Run v2 services (api + web) con autoscaling 0→10 y healthchecks
- Secret Manager secret DATABASE_URL
- Outputs listos para `gh secret set`

#### Community
- `.github` repo: CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, PR template, Issue templates
- Profile README
