#!/bin/bash
# Vercel "Ignored Build Step" script.
# Vercel runs this before each build; the exit code controls whether to proceed:
#   exit 0  →  cancel (ignore) the build
#   exit 1  →  proceed with the build
#
# Configure in Vercel project settings:
#   Build & Development Settings → Ignored Build Step
#   Command: bash scripts/vercel-build-check.sh

ALLOWED_BRANCHES=("main" "staging")

echo "Branch: ${VERCEL_GIT_COMMIT_REF}"

for branch in "${ALLOWED_BRANCHES[@]}"; do
  if [[ "${VERCEL_GIT_COMMIT_REF}" == "${branch}" ]]; then
    echo "Allowed branch — proceeding with build."
    exit 1
  fi
done

echo "Branch not in allowed list — skipping build."
exit 0
