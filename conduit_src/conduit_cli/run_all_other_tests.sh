#!/bin/zsh
cd ..
for dir in $(ls | grep -v "conduit_cli"); do
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