# Instrucciones para asistentes de código

Guía operativa de `elite-monorepo` para Cursor, GitHub Copilot, Codex y el resto de asistentes. El mismo contenido está en `.github/copilot-instructions.md`. Si cambias un hecho (comando, versión, regla), actualiza los dos archivos. No copies esta guía en el README ni en otros markdown.

La fuente de verdad del stack es `package.json` y los `package.json` de cada workspace. El README todavía dice Next.js 15; la dependencia real es Next.js 16.4.6.

## Reglas

- Alojamiento nuevo del frontend: **Vercel Hobby (gratis)**. No actives Vercel Pro, add-ons de pago, Analytics de pago ni Remote Cache de pago. No hace falta `vercel.json` para trabajar en el repo.
- No añadas servicios de pago ni claves de terceros de pago (Neon de pago, OpenAI, Anthropic, Gemini, Alchemy, Upstash de pago, GCP facturable u otro SaaS). Ya hay clientes de algunos de esos proveedores en el código; no amplíes esa superficie, no aprovisiones recursos y no pidas secretos reales para completar un cambio.
- No commitees secretos. Prohibido en git: `.env`, `.env.local`, `.env.*.local`, `*.tfvars` (sí se versiona `*.tfvars.example`), tokens, connection strings, salidas de `terraform output` y volcados de CI con credenciales. Los placeholders viven solo en `.env.example`. Los valores reales, si algún día hacen falta, van a variables locales ignoradas o a GitHub Actions Secrets.
- PRs pequeños y verificados: un solo cambio coherente. Antes de abrir el PR tienen que pasar, en este orden, los cinco comandos de abajo. Pega la salida en el PR. Si uno falla, no abras el PR.
- No edites `pnpm-lock.yaml` a mano. No hagas force-push ni reescribas historial.

## Comandos

En la raíz. El gestor fijado es `pnpm@9.15.4` (`packageManager` en el `package.json` raíz). La CI usa Node 20 y Node 22. Si `pnpm` no está en el PATH: `corepack enable && corepack prepare pnpm@9.15.4 --activate`.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Esos scripts delegan en Turborepo:

| Script | Comando |
| --- | --- |
| `pnpm lint` | `turbo run lint` |
| `pnpm typecheck` | `turbo run typecheck` |
| `pnpm test` | `turbo run test` |
| `pnpm build` | `turbo run build` |

`pnpm ci` ejecuta `turbo run lint typecheck test build`. En `.github/workflows/ci.yml` el orden del job `lint-test` es `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`, `pnpm test`, en Node 20 y 22. Ese workflow no llama a `pnpm typecheck`; en local hay que lanzarlo igual.

Un solo workspace:

```bash
pnpm --filter @repo/web dev
pnpm --filter @repo/api dev
pnpm --filter @repo/web test
pnpm --filter @repo/api test
```

`@repo/db` tiene `db:generate`, `db:migrate`, `db:push` y `db:studio`. No los lances contra una base de pago.

## Stack real

- pnpm 9.15.4 workspaces (`pnpm-workspace.yaml`: `apps/*`, `packages/*`) y Turborepo 2 (`turbo` ^2.5.4). Lockfile único.
- `@repo/web` (`apps/web`): Next.js 16.4.6, App Router, React 19, Tailwind CSS 4, `output: 'standalone'`. Vitest 4 con jsdom.
- `@repo/api` (`apps/api`): Fastify 5, `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`. Entrada `src/index.ts`. Rutas de salud y `/api/v1`. Vitest 4.
- `@repo/ui`: Radix UI (slot, dialog, toast), `class-variance-authority`, `clsx`, `tailwind-merge`. Exports `./button`, `./card`, `./badge`.
- `@repo/db`: Drizzle ORM y `@neondatabase/serverless`. Tablas `users` y `sessions` en `packages/db/src/schema.ts`.
- `@repo/auth`: `better-auth` 1.7.20 con adaptador Drizzle sobre `@repo/db`.
- `@repo/onchain`: `viem`, helpers de Aave y Morpho, y módulo Pendle.
- `@repo/queue`: BullMQ, `@upstash/redis` e `ioredis`.
- `@repo/eslint-config` (`packages/config-eslint`): ESLint 10 y `typescript-eslint` 8.
- Raíz: TypeScript ^6.0.3, ESLint ^10.4.0, Prettier ^3.5.3. `pnpm format` existe; no hay archivo de configuración de Prettier.

`turbo.json`: `build` depende de `^build`; `typecheck` y `test` dependen de `^build`. Solo `@repo/web` y `@repo/api` definen `build`, `typecheck` y `test`. El resto de paquetes con `src` solo define `lint`. `@repo/eslint-config` no tiene scripts. Turbo omite la tarea que el paquete no declara.

## Estructura

```
apps/web                  @repo/web              Next.js (src/app)
apps/api                  @repo/api              Fastify (src/)
packages/ui               @repo/ui
packages/db               @repo/db
packages/auth             @repo/auth
packages/onchain          @repo/onchain
packages/queue            @repo/queue
packages/config-eslint    @repo/eslint-config
infra/terraform           Terraform ya presente; no añadas recursos de pago
.github/workflows/ci.yml  install frozen, lint, build, test
.github/dependabot.yml    npm y github-actions, semanal, minor/patch agrupados
.github/CODEOWNERS        @luisfelipevegarodriguez
renovate.json             Renovate ya configurado; no añadas otro actualizador
```

## Convenciones

- TypeScript strict en web y API: `strict`, `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`. Web: `moduleResolution: bundler`, JSX `react-jsx`, alias `@/*` → `apps/web/src/*`. API: `module` y `moduleResolution` en `NodeNext`; los imports relativos llevan sufijo `.js`.
- Paquetes con `"type": "module"`. Dependencias internas con `"workspace:*"` y nombres `@repo/<nombre>`.
- Cada paquete reexporta el ESLint compartido (`import sharedConfig from '@repo/eslint-config'`) y, si tiene `src`, hace lint con `eslint src --max-warnings=0`.
- Reglas del config compartido, en `error`: `no-eval`, `no-implied-eval`, `no-with`, `no-plusplus`, `eqeqeq` (`always`), `curly` (`all`), `no-var`, `prefer-const`, `no-constant-binary-expression`, `@typescript-eslint/no-explicit-any`. El `eslint.config.js` de la raíz añade `@typescript-eslint/explicit-function-return-type` en `warn`.
- Tests con Vitest, colocados junto al código (`*.test.ts`, `*.test.tsx`).
- Estilo del código existente: comillas simples, punto y coma, identificadores en inglés. La UI está en español (`<html lang="es">`).
- `.npmrc`: `shared-workspace-lockfile=true`, `link-workspace-packages=true`, `strict-peer-dependencies=false`, `auto-install-peers=true`, y `public-hoist-pattern` para `next`, `eslint` y `prettier`.
- Tras cambiar dependencias, regenera el lockfile con `pnpm install` y commitea `pnpm-lock.yaml`. Para comprobar que el árbol es reproducible usa `pnpm install --frozen-lockfile`.
- `.husky/pre-commit` llama a `npx lint-staged` y no hay configuración de lint-staged. No des por hecho que el hook cubre el lint: ejecuta los cinco comandos.
- Plantillas: `.github/pull_request_template.md` y `.github/ISSUE_TEMPLATE/`. Úsalas; no crees otras.
