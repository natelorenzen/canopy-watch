#!/usr/bin/env bash
# Create a Global Forest Watch Data API key and save it to .env.local as GFW_API_KEY.
# Prompts for your GFW account email and password (password is not echoed or stored).
# Steps follow https://globalnaturewatch.org/help/developers/guides/create-and-use-an-api-key/
# The key is scoped to the "localhost" domain; scripts send a matching Origin header (_common.gfw_headers).
set -euo pipefail
cd "$(dirname "$0")/.."
API=https://data-api.globalforestwatch.org

EMAIL="${1:-}"   # optional: pass your email as the first argument
[ -n "$EMAIL" ] || read -r -p "GFW account email: " EMAIL
EMAIL=$(printf '%s' "$EMAIL" | tr -d '[:space:]')
read -r -s -p "GFW password (hidden): " PASSWORD; echo

TOKEN=$(curl -s -X POST "$API/auth/token" --data-urlencode "username=$EMAIL" --data-urlencode "password=$PASSWORD" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("data",{}).get("access_token") or d.get("access_token") or "")')
unset PASSWORD
if [ -z "$TOKEN" ]; then echo "Login failed: check the email/password you use on globalforestwatch.org."; exit 1; fi

RESP=$(curl -s -X POST "$API/auth/apikey" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"alias\":\"canopy-watch-$(date +%Y%m%d-%H%M%S)\",\"organization\":\"Canopy Watch\",\"email\":\"$EMAIL\",\"domains\":[\"localhost\"]}")
KEY=$(printf '%s' "$RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or {}).get("api_key",""))')
EXPIRES=$(printf '%s' "$RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or {}).get("expires_on",""))')
if [ -z "$KEY" ]; then echo "Could not create a key. Server said: $RESP"; exit 1; fi

touch .env.local
grep -v '^GFW_API_KEY=' .env.local > .env.local.tmp || true
mv .env.local.tmp .env.local
printf 'GFW_API_KEY=%s\n' "$KEY" >> .env.local
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "x-api-key: $KEY" -H "Origin: http://localhost" \
  "$API/dataset/wdpa_protected_areas/v202512/query/json?sql=SELECT%20name%20FROM%20results%20LIMIT%201")
echo "Test query with the new key: HTTP $STATUS (200 = working; new keys can take a few minutes)."
echo "Saved GFW_API_KEY to .env.local (ends …${KEY: -4}${EXPIRES:+, expires $EXPIRES})."

# Also hand the key to the daily ingest GitHub Action, and switch that workflow on.
if command -v gh >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
  printf '%s' "$KEY" | gh secret set GFW_API_KEY >/dev/null && echo "Saved GitHub Actions secret GFW_API_KEY."
  gh workflow enable "Ingest alerts" >/dev/null 2>&1 && echo "Daily ingest workflow enabled."
fi
