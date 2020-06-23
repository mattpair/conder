import * as fs from 'fs';
import * as child_process from 'child_process';
import {compileFiles} from "./compileToProto"

// This is just a hack for now. I'm the only one running this.
// Revisit once productionizing.
const DEPENDENCY_DIR = '/Users/jerm/ConderSystems/conduit/conduit_compiler/src/main/deps'

function conduitToProto(conduits: string[]): Promise<string[]>  {
    const toCompile: Record<string, () => string> = {}
    conduits.forEach(c => toCompile[c] = () => fs.readFileSync(`./conduit/${c}`, {encoding: "utf-8"}))
    const protos = compileFiles(toCompile)
    fs.mkdirSync(".proto")
    
    const writes: Promise<string>[] = []
    for (const proto in protos) {
        writes.push(fs.promises.writeFile(`.proto/${proto}`, protos[proto]).then(r => proto))
    }
    if (writes.length == 0) {
        console.warn("Did not find any message types in conduit/")
    }

    return Promise.all(writes)
}

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


# Password validation
# https://docs.djangoproject.com/en/3.0/ref/settings/#auth-password-validators

# AUTH_PASSWORD_VALIDATORS = [
#     {
#         'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
#     },
#     {
#         'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
#     },
#     {
#         'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
#     },
#     {
#         'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
#     },
# ]


# Internationalization
# https://docs.djangoproject.com/en/3.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_L10N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/3.0/howto/static-files/

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
    child_process.execSync("docker build -t conder-systems/cloud-run-gen . ", {cwd: ".deploy/"})
    child_process.execSync("docker tag conder-systems/cloud-run-gen us.gcr.io/conder-systems-281115/hello-world-gen", {cwd: ".deploy/"})
}

function main() {
    generateAndDeployHelloWorld()
    // let conduits: string[]
    // try {
    //     conduits = fs.readdirSync("./conduit/")
    // } catch(e) {
    //     console.error("Unable to find ./conduit/")
    //     return
    // }

    // if (conduits.length == 0) {
    //     console.warn("no files to compile")
    // } else {
    //     conduitToProto(conduits)
    //     .then((protos) => {
    //         console.log("done!")
    //         child_process.execSync('mkdir -p python/models')
    //         child_process.execSync('touch python/models/__init__.py')
    //         protos.forEach(p => child_process.execSync(`${DEPENDENCY_DIR}/proto/bin/protoc -I=.proto/ --python_out=python/models ${p} 2>&1`, {encoding: "utf-8"}))
    //     })
    //     .catch((e) => console.log("failed.", e))
    // }    
}

main()

