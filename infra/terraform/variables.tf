variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "europe-west1"
}

variable "github_repo" {
  description = "GitHub repo in format owner/repo"
  type        = string
  default     = "luisfelipevegarodriguez/elite-monorepo-template"
}

variable "tfstate_bucket" {
  description = "GCS bucket for Terraform state"
  type        = string
}
