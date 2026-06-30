#!/bin/bash
# 
# Vercel "Ignored Build Step" script.
# Vercel runs this before each build; the exit code controls whether to proceed:
#   exit 0  →  proceed with the build
#   exit 1  →  cancel (ignore) the build
#
# Configure in Vercel project settings:
#   Settings → Git → Ignored Build Step
#
# Option A — inline (works immediately, no file needed in repo):
#   if [[ "$VERCEL_GIT_COMMIT_REF" == "main" || "$VERCEL_GIT_COMMIT_REF" == "staging" ]]; then exit 0; else exit 1; fi
#
# Option B — file-based (requires this script committed and pushed first):
#   bash scripts/vercel-build-check.sh

ALLOWED_BRANCHES=("main" "staging")

echo "Branch: ${VERCEL_GIT_COMMIT_REF}"

for branch in "${ALLOWED_BRANCHES[@]}"; do
  if [[ "${VERCEL_GIT_COMMIT_REF}" == "${branch}" ]]; then
    echo "Allowed branch — proceeding with build."
    exit 0
  fi
done

echo "Branch not in allowed list — skipping build."
exit 1
