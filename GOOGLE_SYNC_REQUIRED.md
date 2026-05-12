# Google Sync — Auth Architecture v1.0

## Separación obligatoria: GCP ≠ Google Workspace

| Plano | Tecnología | Para qué |
|-------|-----------|----------|
| GitHub → GCP | OIDC + Workload Identity Federation | Deploy Cloud Run, Artifact Registry |
| App → Gmail/Calendar/Drive | OAuth 2.0 de usuario | Leer/enviar email, eventos, archivos |

NO mezcles los dos: son flows de autenticación distintos.

---

## Gmail / Calendar / Drive — OAuth 2.0 correcto

### Paso 1: Crear credenciales OAuth en Google Cloud Console
```
https://console.cloud.google.com/apis/credentials
→ Create Credentials → OAuth 2.0 Client ID
→ Application type: Web application
→ Authorized redirect URIs: http://localhost:3000/auth/callback (dev)
                              https://tu-api.run.app/auth/callback (prod)
```

### Paso 2: Activar APIs necesarias
```bash
gcloud services enable gmail.googleapis.com \
  calendar-json.googleapis.com \
  drive.googleapis.com \
  --project="$PROJECT_ID"
```

### Paso 3: Scopes mínimos (principio de menor privilegio)
```
https://www.googleapis.com/auth/gmail.send          # Solo enviar, no leer
https://www.googleapis.com/auth/gmail.readonly       # Solo leer si necesitas
https://www.googleapis.com/auth/calendar.events      # Crear/leer eventos
https://www.googleapis.com/auth/drive.file           # Solo archivos creados por la app
```

### Paso 4: Guardar tokens de refresco de forma segura
- En desarrollo: archivo local `.credentials/google-tokens.json` (en .gitignore)
- En producción: **Google Secret Manager** (no GitHub Secrets — los tokens rotan)

```bash
# Guardar refresh_token en Secret Manager
gcloud secrets create google-oauth-tokens \
  --data-file=.credentials/google-tokens.json \
  --project="$PROJECT_ID"

# Dar acceso a la SA de Cloud Run
gcloud secrets add-iam-policy-binding google-oauth-tokens \
  --member="serviceAccount:deploy-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Paso 5: Leer el token en Cloud Run (runtime)
```typescript
// apps/api/src/lib/google-auth.ts
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { OAuth2Client } from 'google-auth-library';

export async function getGoogleClient() {
  const sm = new SecretManagerServiceClient();
  const [version] = await sm.accessSecretVersion({
    name: `projects/${process.env.GCP_PROJECT}/secrets/google-oauth-tokens/versions/latest`,
  });
  const tokens = JSON.parse(version.payload!.data!.toString());
  
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}
```

---

## Google Workspace con Domain-Wide Delegation (solo si eres admin de org)

USA ESTO solo si:
- Tienes Google Workspace de empresa (no cuenta personal)
- Necesitas actuar en nombre de otros usuarios del dominio
- Eres el admin del workspace

En ese caso: Service Account + DWD es válido. Para cuenta personal Google → usa siempre OAuth 2.0 de usuario.

---

## Variables necesarias en GitHub Secrets / Cloud Run env

```
# Para OAuth 2.0 Google (apps/api)
GOOGLE_CLIENT_ID        → xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET    → GOCSPX-...
GOOGLE_REDIRECT_URI     → https://tu-api.run.app/auth/google/callback

# En Secret Manager (no en GitHub Secrets)
google-oauth-tokens     → {access_token, refresh_token, expiry_date}
```

---

## CLI recomendada para automatización Google

`googleworkspace/cli` — CLI oficial con salida JSON, útil para scripts/agents:
```bash
# Instalar
go install github.com/googleworkspace/cli@latest

# Listar emails (requiere OAuth previo)
gws gmail messages list --query="is:unread" --format=json

# Crear evento
gws calendar events create --summary="Deploy review" --start=2026-05-13T10:00:00
```
https://github.com/googleworkspace/cli

---

## Lo que NO hacer
- SMTP con password de Google: eliminado desde mayo 2022
- Service Account para Gmail personal: Google no lo permite (no hay DWD sin Workspace)
- Guardar refresh_token en GitHub Secrets: rota y expira, usa Secret Manager
