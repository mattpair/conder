
from django.contrib import admin
from django.urls import path
from django.http import HttpResponse


def index(req):
    return HttpResponse("Hello world")

urlpatterns = [
    path('', index),
]
