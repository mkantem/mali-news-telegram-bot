#!/bin/sh
set -eu

# Coolify bind mounts may be root-owned. Prepare the application data directory,
# then drop privileges before starting the bot.
mkdir -p /data
chown node:node /data
exec setpriv --reuid=node --regid=node --init-groups "$@"
