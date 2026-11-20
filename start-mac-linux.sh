#!/bin/sh
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 20+ from https://nodejs.org/'; exit 1; }
echo 'Starting Suez News Radar at http://localhost:3000'
exec node server.js
