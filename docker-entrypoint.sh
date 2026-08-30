#!/bin/sh
set -eu

# Coolify bind mounts may be root-owned. Prepare the application data directory,
# then drop privileges before starting the bot.
mkdir -p /data
chown node:node /data
exec gosu node "$@"
