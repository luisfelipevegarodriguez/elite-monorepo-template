output "workload_identity_provider" {
  description = "Value for GCP_WORKLOAD_IDENTITY_PROVIDER secret in GitHub"
  value       = "projects/${data.google_project.current.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github.workload_identity_pool_provider_id}"
}

output "service_account_email" {
  description = "Value for GCP_SERVICE_ACCOUNT secret in GitHub"
  value       = google_service_account.github_actions.email
}

output "api_url" {
  description = "Cloud Run API service URL"
  value       = google_cloud_run_v2_service.api.uri
}

output "web_url" {
  description = "Cloud Run Web service URL"
  value       = google_cloud_run_v2_service.web.uri
}

output "artifact_registry" {
  description = "Artifact Registry host"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/elite-monorepo"
}

data "google_project" "current" {
  project_id = var.project_id
}
