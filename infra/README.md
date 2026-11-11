# Infraestructura — GCP via Terraform

## Recursos provisionados

- **Workload Identity Pool + Provider** — OIDC para GitHub Actions (sin JSON keys)
- **Service Account** — con roles `run.developer`, `artifactregistry.writer`
- **Artifact Registry** — repositorio Docker `elite-monorepo`
- **Cloud Run v2** — servicios `elite-api` + `elite-web` con autoscaling 0→10
- **Secret Manager** — secret `DATABASE_URL` inyectado en Cloud Run

## Ejecución inicial (una sola vez)

```bash
# 1. Variables
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
# Edita terraform.tfvars con tus valores reales

# 2. Crear bucket de estado primero (manual, una sola vez)
gcloud storage buckets create gs://MI-PROYECTO-tfstate \
  --project=MI-PROYECTO --location=europe-west1 \
  --uniform-bucket-level-access

# 3. Init + Plan + Apply
cd infra/terraform
terraform init
terraform plan
terraform apply

# 4. Copiar outputs a GitHub Secrets
terraform output workload_identity_provider  # → GCP_WORKLOAD_IDENTITY_PROVIDER
terraform output service_account_email       # → GCP_SERVICE_ACCOUNT
```

## Secrets GitHub resultantes

```bash
gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER --body "$(terraform output -raw workload_identity_provider)" -R luisfelipevegarodriguez/elite-monorepo-template
gh secret set GCP_SERVICE_ACCOUNT           --body "$(terraform output -raw service_account_email)" -R luisfelipevegarodriguez/elite-monorepo-template
gh secret set GCP_PROJECT_ID                --body "MI-PROYECTO" -R luisfelipevegarodriguez/elite-monorepo-template
```
