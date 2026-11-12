# Instrucciones para GitHub Copilot

Mismas reglas que `AGENTS.md` (raíz). Si cambias un hecho, actualiza los dos. La fuente de verdad del stack son los `package.json`. El README dice Next.js 15; la dependencia real es Next.js 16.4.6.

## Reglas

- Alojamiento nuevo del frontend: **Vercel Hobby (gratis)**. No actives Vercel Pro, add-ons de pago, Analytics de pago ni Remote Cache de pago. No hace falta `vercel.json` para trabajar en el repo.
- No añadas servicios de pago ni claves de terceros de pago (Neon de pago, OpenAI, Anthropic, Gemini, Alchemy, Upstash de pago, GCP facturable u otro SaaS). Ya hay clientes de algunos de esos proveedores; no amplíes esa superficie, no aprovisiones recursos y no pidas secretos reales para completar un cambio.
- No commitees secretos. Prohibido en git: `.env`, `.env.local`, `.env.*.local`, `*.tfvars` (sí se versiona `*.tfvars.example`), tokens, connection strings, salidas de `terraform output` y volcados de CI con credenciales. Los placeholders viven solo en `.env.example`. Los valores reales, si algún día hacen falta, van a variables locales ignoradas o a GitHub Actions Secrets.
- PRs pequeños y verificados: un solo cambio coherente. Antes de abrir el PR tienen que pasar, en este orden, los cinco comandos de abajo. Pega la salida en el PR. Si uno falla, no abras el PR.
- No edites `pnpm-lock.yaml` a mano. No hagas force-push ni reescribas historial.

## Comandos

En la raíz. Gestor fijado: `pnpm@9.15.4`. CI en Node 20 y Node 22. Si falta `pnpm`: `corepack enable && corepack prepare pnpm@9.15.4 --activate`.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

| Script | Comando |
| --- | --- |
| `pnpm lint` | `turbo run lint` |
| `pnpm typecheck` | `turbo run typecheck` |
| `pnpm test` | `turbo run test` |
| `pnpm build` | `turbo run build` |

`pnpm ci` ejecuta `turbo run lint typecheck test build`. `.github/workflows/ci.yml` (job `lint-test`) hace `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build` y `pnpm test`. No llama a `pnpm typecheck`; en local hay que lanzarlo igual.

```bash
pnpm --filter @repo/web dev
pnpm --filter @repo/api dev
pnpm --filter @repo/web test
pnpm --filter @repo/api test
```

`@repo/db` tiene `db:generate`, `db:migrate`, `db:push` y `db:studio`. No los lances contra una base de pago.

## Stack real

- pnpm 9.15.4 (`apps/*`, `packages/*`) y Turborepo 2 (`turbo` ^2.5.4). Lockfile único.
- `@repo/web`: Next.js 16.4.6, App Router, React 19, Tailwind CSS 4, `output: 'standalone'`. Vitest 4 + jsdom.
- `@repo/api`: Fastify 5, `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`. Entrada `src/index.ts`. Rutas de salud y `/api/v1`. Vitest 4.
- `@repo/ui`: Radix (slot, dialog, toast), CVA, clsx, tailwind-merge. Exports `./button`, `./card`, `./badge`.
- `@repo/db`: Drizzle ORM y `@neondatabase/serverless`. Tablas `users` y `sessions`.
- `@repo/auth`: `better-auth` 1.7.20 con adaptador Drizzle sobre `@repo/db`.
- `@repo/onchain`: `viem`, Aave, Morpho y Pendle.
- `@repo/queue`: BullMQ, `@upstash/redis` e `ioredis`.
- `@repo/eslint-config` en `packages/config-eslint` (ESLint 10, `typescript-eslint` 8).
- Raíz: TypeScript ^6.0.3, ESLint ^10.4.0, Prettier ^3.5.3. `pnpm format` existe; no hay config de Prettier.

`typecheck` y `test` dependen de `^build`. Solo web y API definen `build`, `typecheck` y `test`. El resto de paquetes con `src` solo define `lint`. Turbo omite la tarea que el paquete no declara.

## Estructura

```
apps/web                  @repo/web
apps/api                  @repo/api
packages/ui               @repo/ui
packages/db               @repo/db
packages/auth             @repo/auth
packages/onchain          @repo/onchain
packages/queue            @repo/queue
packages/config-eslint    @repo/eslint-config
infra/terraform           ya presente; no añadas recursos de pago
.github/workflows/ci.yml  install frozen, lint, build, test
.github/dependabot.yml    npm y github-actions, semanal, minor/patch agrupados
.github/CODEOWNERS        @luisfelipevegarodriguez
renovate.json             ya configurado; no añadas otro actualizador
```

## Convenciones

- TypeScript strict en web y API: `strict`, `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`. Web: `moduleResolution: bundler`, JSX `react-jsx`, alias `@/*` → `apps/web/src/*`. API: `NodeNext` e imports relativos con sufijo `.js`.
- `"type": "module"`. Dependencias internas: `"workspace:*"` y nombres `@repo/<nombre>`.
- ESLint de cada paquete reexporta `@repo/eslint-config`. Lint de `src`: `eslint src --max-warnings=0`.
- En `error`: `no-eval`, `no-implied-eval`, `no-with`, `no-plusplus`, `eqeqeq` (`always`), `curly` (`all`), `no-var`, `prefer-const`, `no-constant-binary-expression`, `@typescript-eslint/no-explicit-any`. El ESLint de la raíz añade `explicit-function-return-type` en `warn`.
- Tests Vitest junto al código (`*.test.ts`, `*.test.tsx`).
- Comillas simples, punto y coma, identificadores en inglés. UI en español (`<html lang="es">`).
- `.npmrc`: lockfile compartido, `link-workspace-packages=true`, `strict-peer-dependencies=false`, `auto-install-peers=true`, hoist público de `next`, `eslint` y `prettier`.
- Dependencias nuevas: `pnpm install` y commitea `pnpm-lock.yaml`. La comprobación reproducible es `pnpm install --frozen-lockfile`.
- `.husky/pre-commit` llama a `npx lint-staged` y no hay config de lint-staged. Ejecuta los cinco comandos; no fíes el lint al hook.
- Plantillas: `.github/pull_request_template.md` y `.github/ISSUE_TEMPLATE/`. Úsalas; no crees otras.
