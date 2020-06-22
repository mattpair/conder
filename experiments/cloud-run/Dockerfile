FROM python:3.8-slim-buster

COPY mysite/ .

RUN pip install -r requirements.txt

EXPOSE  8080

ENTRYPOINT [ "python3", "manage.py", "runserver", "0.0.0.0:8080" ]