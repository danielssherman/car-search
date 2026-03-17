#!/bin/bash
# Download the latest inventory.db from Cloudflare R2
# Usage: ./scripts/sync-db.sh

set -euo pipefail

# Load env vars from .env.local if present
if [ -f .env.local ]; then
  export $(grep -E '^R2_' .env.local | xargs)
fi

if [ -z "${R2_ACCOUNT_ID:-}" ] || [ -z "${R2_BUCKET:-}" ]; then
  echo "Error: R2 credentials not set. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET to .env.local"
  exit 1
fi

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

mkdir -p data

echo "Downloading inventory.db from R2..."
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
AWS_DEFAULT_REGION=auto \
aws s3 cp "s3://${R2_BUCKET}/inventory.db" ./data/inventory.db \
  --endpoint-url "$R2_ENDPOINT"

echo "Done. Database size:"
ls -lh ./data/inventory.db
echo ""
sqlite3 ./data/inventory.db "SELECT 'Vehicles:', COUNT(*) FROM vehicles WHERE removed_at IS NULL; SELECT 'Dealers:', COUNT(DISTINCT dealer_name) FROM listings WHERE removed_at IS NULL; SELECT 'Makes:', GROUP_CONCAT(DISTINCT make) FROM vehicles WHERE removed_at IS NULL;"
