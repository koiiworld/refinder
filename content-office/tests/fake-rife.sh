#!/usr/bin/env bash
exec node "$(dirname "$0")/fake-visual-tool.cjs" "rife" "$@"
