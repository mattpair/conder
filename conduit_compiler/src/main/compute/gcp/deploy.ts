import * as fs from 'fs';
import * as child_process from 'child_process';

function generateAndDeployHelloWorld() {
    fs.mkdirSync(".deploy/server/server", {recursive: true})
    fs.writeFileSync(".deploy/server/server/__init__.py", "")
    fs.writeFileSync(".deploy/server/server/settings.py",
`
import os

# Build paths inside the project like this: os.path.join(BASE_DIR, ...)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/3.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = '3_+m*a$mw1q4gd22y9j_=ts%%*@_!dfldt2rd05ni#ao0r*e*n'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

ALLOWED_HOSTS = ['*']


# Application definition

INSTALLED_APPS = [
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'server.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]


# Database
# https://docs.djangoproject.com/en/3.0/ref/settings/#databases

# DATABASES = {
#     'default': {
#         'ENGINE': 'django.db.backends.sqlite3',
#         'NAME': os.path.join(BASE_DIR, 'db.sqlite3'),
#     }
# }


# Internationalization
# https://docs.djangoproject.com/en/3.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_L10N = True

USE_TZ = True


`
    )
    fs.writeFileSync(".deploy/server/server/urls.py",
`
from django.contrib import admin
from django.urls import path
from django.http import HttpResponse


def index(req):
    return HttpResponse("Hello world")

urlpatterns = [
    path('', index),
]
`)
    fs.writeFileSync(".deploy/server/manage.py", 
`
import os
import sys


def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
`)

    fs.writeFileSync(".deploy/server/requirements.txt", "Django==3.0")
    fs.writeFileSync(".deploy/Dockerfile",
`
FROM python:3.8-slim-buster

COPY server/ .

RUN pip install -r requirements.txt

EXPOSE  8080

ENTRYPOINT [ "python3", "manage.py", "runserver", "0.0.0.0:8080" ]
`)
    fs.writeFileSync(".deploy/cloud-run.tf",
`
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
    metadata {
        annotations = {
          "autoscaling.knative.dev/maxScale"      = "2"
          "run.googleapis.com/client-name"        = "terraform"
        }
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
`)
    child_process.execSync("docker build -t conder-systems/cloud-run-gen . ", {cwd: ".deploy/"})
    child_process.execSync("docker tag conder-systems/cloud-run-gen us.gcr.io/conder-systems-281115/hello-world-gen", {cwd: ".deploy/"})
    child_process.execSync("docker push us.gcr.io/conder-systems-281115/hello-world-gen")
    child_process.execSync("terraform init && terraform apply -auto-approve", {cwd: ".deploy/", encoding: "utf-8"})
}