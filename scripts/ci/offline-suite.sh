#!/usr/bin/env bash
# The keyless, deterministic verification scripts: no .env, no network, no database, no LLM credits.
# Each runs with an empty environment, so a script that starts needing a key fails here instead of quietly using one.
# Usage: bash scripts/ci/offline-suite.sh   (or: pnpm run test:ci)
set -u
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

SUITES=(
  test-dimension-single
  test-p1-2-intent-fix
  verify-dimension-extraction
  verify-entity-resolution-result-contract
  verify-llm-deadline-and-call-log
  verify-phase4.2-extraction
  verify-phase4.3-extraction
  verify-phase6.0-first-controlled-proof
  verify-phase6.1-semantic-position
  verify-phase6.2-direction-association
  verify-phase7.5.2-hospital-identity-resolution
  verify-phase8.1-answerability-contract
  verify-phase8.10-layer1-guidance
  verify-phase8.2-semantic-completeness
  verify-phase8.3-targeted-clarification
  verify-phase8.6a-temporal-foundation
  verify-qualifier-identity-safety
  verify-sql-executor-binding
  verify-summary-grounding
)

TSX="node_modules/.bin/tsx"
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT
passed=0
failed=0

if [ ! -x "$TSX" ]; then
  echo "offline-suite: $TSX not found (run pnpm install first)"
  exit 2
fi

for name in "${SUITES[@]}"; do
  file="scripts/${name}.ts"

  if [ ! -f "$file" ]; then
    echo "  MISSING  ${file}"
    failed=$((failed + 1))
    continue
  fi

  started=$(date +%s)

  if env -i PATH="$PATH" HOME="${HOME:-/tmp}" timeout 120 "$TSX" "$file" >"$LOG" 2>&1; then
    echo "  PASS  $(( $(date +%s) - started ))s  ${name}"
    passed=$((passed + 1))
  else
    echo "  FAIL  $(( $(date +%s) - started ))s  ${name}"
    tail -n 25 "$LOG" | sed 's/^/        /'
    failed=$((failed + 1))
  fi
done

echo
echo "offline suite: ${passed} passed, ${failed} failed (of ${#SUITES[@]})"
[ "$failed" -eq 0 ]
