#!/bin/zsh
export CONDER_VERSION=0.0.5

cd conder_core/conder_kernel
npm run gen 
cd src/rust/
docker build -t condersystems/sps:$CONDER_VERSION . 
docker push condersystems/sps:$CONDER_VERSION
cd ../../../
npm run compile
node -p "JSON.stringify({...require('./package.json'), version: '$CONDER_VERSION'}, null, 2)" > temp.json && mv temp.json package.json
cd ..
tar --exclude='**/rust/' -czhf conder-api.tar.gz conder_core
gh release create v$CONDER_VERSION -p -t v$CONDER_VERSION 'conder-api.tar.gz#Conder API'
rm conder-api.tar.gz