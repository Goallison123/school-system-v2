
#!/usr/bin/env bash

set -euo pipefail

: "${SUPABASE_FUNCTION_URL:?Set SUPABASE_FUNCTION_URL first}"
: "${MIDTERM_REMINDER_CRON_SECRET:?Set MIDTERM_REMINDER_CRON_SECRET first}"

echo "Calling the mid-term reminder function..."

curl --fail-with-body --silent --show-error \
  --request POST \
  --url "$SUPABASE_FUNCTION_URL" \
  --header "x-cron-secret: $MIDTERM_REMINDER_CRON_SECRET" \
  --header "Content-Type: application/json" \
  --data '{}'

echo
echo "Function returned a successful HTTP response."
