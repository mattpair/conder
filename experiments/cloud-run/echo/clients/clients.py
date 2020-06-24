
import models.test_pb2 as models__test
import requests


def hello(): 
    return requests.get('https://cloudrun-srv-a2afoxqzjq-uw.a.run.app')


def echo(a):
    out = requests.post('https://cloudrun-srv-a2afoxqzjq-uw.a.run.app/echo/', data=a.SerializeToString())
    return out

