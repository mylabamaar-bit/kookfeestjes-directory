#!/usr/bin/env bash
# Zet branch protection op main: verplichte status check "checks" (strict),
# geen force-push, geen delete, geen verplichte reviews, admins niet afgedwongen.
# LET OP: branch protection werkt op PRIVATE repos alleen met een betaald GitHub-plan
# (Pro/Team); op een PUBLIEKE repo is het gratis.
# Gebruik: bash scripts/github/zet-branch-protection.sh <owner/repo>
set -euo pipefail
REPO="${1:?Gebruik: zet-branch-protection.sh <owner/repo>}"

gh api -X PUT "repos/$REPO/branches/main/protection" \
  -H "Accept: application/vnd.github+json" --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["checks"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
echo "Branch protection op main gezet voor $REPO."
