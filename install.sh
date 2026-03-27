#!/bin/bash
# Download sql.js WASM build for NeuroCore
echo "Downloading sql.js WASM..."
curl -sL "https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/sql-wasm.js" -o lib/sql-wasm.cjs
curl -sL "https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/sql-wasm.wasm" -o lib/sql-wasm.wasm
echo "Done! sql.js WASM files downloaded to lib/"
