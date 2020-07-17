import { FileLocation } from './../../util/filesystem';
import { Parse } from '../../parse';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { FunctionResolved } from '../../entity/resolved';

function generateParameterList(p: FunctionResolved.Parameter): string {
    const param = p.differentiate()
    return param.kind === "NoParameter" ? "" : `${param.name}`
}

function generateInternalFunction(f: FunctionResolved.Function): string {
    return `

def internal_${f.name}(${generateParameterList(f.part.Parameter)}): 
    return ${f.part.FunctionBody.children.Statement[0].differentiate().val}
    `
}

function generateFunctions(functions: FunctionResolved.Function[]): string {
    return functions.map(func => {

const internal = generateInternalFunction(func) 
//TODO: clean this up.
const param = func.part.Parameter.differentiate()
let ptype = param.kind === "NoParameter" ? null : param.part.UnaryParameterType.differentiate()
// const ptype = .part.UnaryParameterType.differentiate()
const typeLocation = ptype !== null ? `default_namespace_pb2.${ptype.name}` : `No type necessary`
const external =
`
def external_${func.name}(req):
        msg = ${typeLocation}()
        msg.ParseFromString(req.body)
        ret = internal_${func.name}(msg)
        return HttpResponse(ret.SerializeToString())


PATH_${func.name} = path('${func.name}/', external_${func.name})
`
return `${internal}\n\n${external}`
    }).join("\n\n")
}

export function modelAliasOf(loc: FileLocation): string {
    return `models_${loc.dir.replace("/", "_")}_${loc.name.replace(".cdt", "")}`
}

//TODO: generate random key.
export function containerize(manifest: FunctionResolved.Manifest, dirname: string): string {
    console.log(`MANIFEST: ${JSON.stringify(manifest, null, 2)}`)
    const functions = generateFunctions(manifest.service.functions)
    fs.mkdirSync(".deploy/compute/", {recursive: true})
    child_process.execSync(`cp -r ${dirname} .deploy/compute/server`)
    fs.writeFileSync(".deploy/compute/server/__init__.py", "")
    fs.writeFileSync(".deploy/compute/server/settings.py",
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
    #'django.middleware.csrf.CsrfViewMiddleware', Disabled so test clients may be generated
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
    fs.writeFileSync(".deploy/compute/server/urls.py",
`
from django.contrib import admin
from django.urls import path
from django.http import HttpResponse, HttpRequest
from .gen.models import default_namespace_pb2

${functions}

def index(req: HttpRequest):
    return HttpResponse("Hello world")

urlpatterns = [
    path('', index),
    ${manifest.service.functions.map(fun => `PATH_${fun.name}`).join(",\n")},
]
`)
    fs.writeFileSync(".deploy/compute/manage.py", 
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

    fs.writeFileSync(".deploy/compute/requirements.txt", "Django==3.0\nprotobuf==3.12.2")
    fs.writeFileSync(".deploy/Dockerfile",
`
FROM python:3.8-slim-buster

COPY compute/ .

RUN pip install -r requirements.txt

EXPOSE  8080

ENTRYPOINT [ "python3", "manage.py", "runserver", "0.0.0.0:8080" ]
`)
    child_process.execSync("docker build -t conder-systems/cloud-run-gen . ", {cwd: ".deploy/"})
    child_process.execSync("docker tag conder-systems/cloud-run-gen us.gcr.io/conder-systems-281115/hello-world-gen", {cwd: ".deploy/"})
    child_process.execSync("docker push us.gcr.io/conder-systems-281115/hello-world-gen")

    return "us.gcr.io/conder-systems-281115/hello-world-gen:latest"
}