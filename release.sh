#!/bin/zsh
export CONDER_VERSION=0.0.3

cd conder_core/conder_kernel &&
npm run gen && 
cd src/rust/ &&
docker build -t condersystems/sps:$CONDER_VERSION . && 
docker push condersystems/sps:$CONDER_VERSION &&
cd ../../../ &&
npm run compile &&
cd .. &&
tar --exclude='**/node_modules/' --exclude='**/rust/' -czhf conder-api.tar.gz conder_core
gh release create v$CONDER_VERSION -p -t v$CONDER_VERSION 'conder-api.tar.gz#Conder API'
rm conder-api.tar.gz