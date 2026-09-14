#!/usr/bin/env bash
# Publish web/landing as branch "hosting" for Hostinger Git auto-deploy.
# Stays on your current branch (usually main).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d web/landing ]]; then
  echo "Missing web/landing" >&2
  exit 1
fi

# Ensure landing is committed on current branch before split
if ! git diff --quiet -- web/landing || ! git diff --cached --quiet -- web/landing; then
  echo "Commit web/landing changes on main first, then re-run." >&2
  exit 1
fi

echo "Splitting web/landing → branch hosting …"
git branch -D hosting 2>/dev/null || true
git subtree split --prefix=web/landing -b hosting

echo ""
echo "Done. Push to GitHub, then point Hostinger at branch 'hosting':"
echo "  git push -u origin hosting --force"
echo ""
echo "--force is OK for orphan/split publish branch. Do NOT force-push main."
