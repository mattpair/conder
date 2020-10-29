#!/bin/zsh

for dir in */; do
    echo "Testing $dir"
    cd $dir
    if npm run test; then 
        echo "$dir passed"
    else
        echo "$dir failed"
        exit 1
    fi
    cd ..
done