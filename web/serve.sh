#!/usr/bin/env bash
# Serve the searchable CLI GUI on http://127.0.0.1:8080/
cd "$(dirname "$0")"
exec python3 -m http.server "${1:-8080}" --bind 127.0.0.1
