
provider "google" {
    project = "conder-systems-281115"
    region = "us-west1"
    zone = "a"
    version = "~> 3.26"
}

resource "google_cloud_run_service" "genservice" {
  name     = "cloudrun-srv"
  location = "us-west1"

  template {
    spec {
      containers {
        image = "us.gcr.io/conder-systems-281115/hello-world-gen"
      }
    }
  }

    metadata {
      annotations = {
        "autoscaling.knative.dev/maxScale"      = "2"
        "run.googleapis.com/client-name"        = "terraform"
      }
    }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

data "google_iam_policy" "noauth" {
  binding {
    role = "roles/run.invoker"
    members = [
      "allUsers",
    ]
  }
}

resource "google_cloud_run_service_iam_policy" "noauth" {
  location    = google_cloud_run_service.genservice.location
  project     = google_cloud_run_service.genservice.project
  service     = google_cloud_run_service.genservice.name

  policy_data = data.google_iam_policy.noauth.policy_data
}
