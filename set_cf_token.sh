#!/bin/bash
# Helper script: paste your Cloudflare API token and this sets it directly as a GitHub secret.
# Usage: bash set_cf_token.sh <YOUR_CLOUDFLARE_API_TOKEN>

set -e

TOKEN="$1"
REPO="kennyanju/muslim-community-accounting"
REPO2="kennyanju/majid-accounting"

if [ -z "$TOKEN" ]; then
  echo ""
  echo "❌ Usage: bash set_cf_token.sh <YOUR_CLOUDFLARE_API_TOKEN>"
  echo ""
  echo "Steps to get your Cloudflare API Token:"
  echo "  1. Open: https://dash.cloudflare.com/profile/api-tokens"
  echo "  2. Click 'Create Token'"
  echo "  3. Select 'Edit Cloudflare Workers' template"
  echo "  4. Set permissions:"
  echo "     - Account > Cloudflare Pages > Edit"
  echo "     - Account > Account Settings > Read"
  echo "  5. Click 'Continue to Summary' → 'Create Token'"
  echo "  6. Copy the token and run: bash set_cf_token.sh <token>"
  exit 1
fi

echo "Setting CLOUDFLARE_API_TOKEN secret on $REPO ..."
gh secret set CLOUDFLARE_API_TOKEN --body "$TOKEN" --repo "$REPO"
echo "✅ Secret set on $REPO"

echo "Setting CLOUDFLARE_API_TOKEN secret on $REPO2 ..."
gh secret set CLOUDFLARE_API_TOKEN --body "$TOKEN" --repo "$REPO2"
echo "✅ Secret set on $REPO2"

echo ""
echo "🚀 Triggering workflow re-run..."
gh workflow run deploy.yml --repo "$REPO" --ref main
echo ""
echo "✅ Done! Watch the deployment at:"
echo "   https://github.com/$REPO/actions"
