## Qué cambia

<!-- Un párrafo. Un solo cambio coherente. -->

## Por qué

## Cómo se verificó

Desde la raíz, con pnpm 9.15.4:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Pega aquí la salida (o el enlace al job de CI) de cada comando.

## Comprobaciones

- [ ] El PR es pequeño y no mezcla temas
- [ ] No hay secretos, `.env`, `*.tfvars` ni credenciales
- [ ] No añade servicios de pago ni sube el plan de Vercel (Hobby, gratis)
- [ ] `pnpm install --frozen-lockfile` termina bien
- [ ] `pnpm lint` pasa
- [ ] `pnpm typecheck` pasa
- [ ] `pnpm test` pasa
- [ ] `pnpm build` pasa
