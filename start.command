#!/bin/bash
cd "$(dirname "$0")"
(cd frontend && npm install && npm run build)
node server.js
