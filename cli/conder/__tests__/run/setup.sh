#!/bin/zsh
conder run &
pid=$!
until curl --output /dev/null --silent --header "Content-Type: application/json" --request PUT --data '{"kind": "Noop"}' http://localhost:7213/; do :; done
echo $pid