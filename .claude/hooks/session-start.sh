#!/bin/bash
# Runs at the start of every Claude Code session in this repository.
# 1) In cloud sessions: installs npm dependencies (only when they changed).
# 2) Prints the roadmap status, so the session immediately knows its step.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}"

if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  # Reinstall only if a file that decides what gets installed has changed.
  hashes=node_modules/.session-start.sha256
  if ! sha256sum --check --status "$hashes" 2>/dev/null; then
    rm -f "$hashes"
    npm install --no-audit --no-fund --loglevel=error >&2
    sha256sum .claude/hooks/session-start.sh package.json package-lock.json > "$hashes" || rm -f "$hashes"
  fi
fi

echo "=== «Первый костёр»: дорожная карта ==="
node tools/roadmap.ts next || echo "Не удалось прочитать дорожную карту: выполни npm run next вручную."
echo "Порядок работы над шагом: docs/PROCESS.md (обязателен). Текущее состояние игры: docs/STATUS.md."
