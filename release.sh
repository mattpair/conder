#!/bin/zsh
export CONDER_VERSION=0.0.2

cd conder_core/conder_kernel/
npm run gen && 
cd src/rust/ && 
docker build -t condersystems/sps:$CONDER_VERSION . && 
docker push condersystems/sps:$CONDER_VERSION &&
gh release create v$CONDER_VERSION -p