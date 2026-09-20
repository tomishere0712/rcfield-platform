#!/usr/bin/env sh
set -eu

# Node 25 exposes a browser-like `localStorage` getter. Jest's node
# environment forwards it to each VM context, which requires this file path.
# Older supported Node versions keep their existing command line unchanged.
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -ge 25 ]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--localstorage-file=${TMPDIR:-/tmp}/rcfield-jest-localstorage"
fi

# `exec` avoids keeping an additional Node parent process alive during the
# complete integration suite.
exec ./node_modules/.bin/jest --runInBand "$@"
