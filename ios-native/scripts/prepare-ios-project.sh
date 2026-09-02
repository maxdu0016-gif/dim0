#!/usr/bin/env bash
set -euo pipefail

if ! command -v xcodegen >/dev/null 2>&1; then
  HOMEBREW_NO_AUTO_UPDATE=1 brew install xcodegen
fi

(cd ios && xcodegen generate)
