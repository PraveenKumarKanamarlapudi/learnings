#!/bin/sh
# Mounted volumes (Fly, docker -v) come up root-owned; make the data dir writable, then drop privileges.
set -e
dir="$(dirname "$PV_DB")"
mkdir -p "$dir"
chown -R node:node "$dir"
exec setpriv --reuid=node --regid=node --init-groups "$@"
