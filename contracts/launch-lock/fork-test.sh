#!/usr/bin/env bash
# FORK ONLY — never --broadcast. Base build of forge (real B20 precompiles), pinned post-Cobalt block.
set -euo pipefail
cd "$(dirname "$0")"
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1
FORGE="${FORGE:-$HOME/.foundry/versions/base-nightly/forge}"
RPC="${BASE_RPC:-https://base.drpc.org}"
BLOCK="${FORK_BLOCK:-52070900}"
exec "$FORGE" test --fork-url "$RPC" --fork-block-number "$BLOCK" \
  --compute-units-per-second "${CUPS:-40}" --fork-retries 12 --fork-retry-backoff 3000 "$@"
