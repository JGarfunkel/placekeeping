#!/usr/bin/env bash
# Builds the apps/web image locally with `docker build`, sourcing the
# NEXT_PUBLIC_* build args the same way cloudbuild.yaml does — so there's
# one source of truth (that file) instead of a second hardcoded copy here.
#
# _MAPS_MAP_ID / _FIREBASE_AUTH_DOMAIN / _FIREBASE_PROJECT_ID / _FIREBASE_APP_ID
# are read straight out of cloudbuild.yaml's committed substitution defaults.
# _MAPS_KEY / _FIREBASE_API_KEY are deliberately left blank there (API-key-shaped
# strings, kept out of git — see cloudbuild.yaml) and are read from .env instead,
# same as the deploy flow uses locally.
#
# Usage:
#   scripts/build-local.sh [tag]      # defaults to placekeeping-web:local

set -euo pipefail

TAG="${1:-placekeeping-web:local}"
CLOUDBUILD_FILE="cloudbuild.yaml"
ENV_FILE=".env"

if [[ ! -f "$CLOUDBUILD_FILE" ]]; then
  echo "$CLOUDBUILD_FILE not found — run this from the repo root" >&2
  exit 1
fi

read_substitution() {
  # Pulls a single "  _NAME: value" line's value out of cloudbuild.yaml's
  # substitutions: block. Deliberately a targeted line scan rather than a
  # full YAML parser, since that block is a flat list of scalar values.
  node -e '
    const fs = require("node:fs");
    const text = fs.readFileSync(process.argv[1], "utf8");
    const name = process.argv[2];
    const re = new RegExp("^\\s{2}" + name + ":\\s*\"?([^\"\\n]*)\"?\\s*$", "m");
    const m = re.exec(text);
    if (m) process.stdout.write(m[1]);
  ' "$CLOUDBUILD_FILE" "$1"
}

read_env_var() {
  # Same approach as push-secrets-to-gcp.sh: delegate to Node's util.parseEnv
  # so quoting/escaping matches how the app itself reads .env.
  node -e '
    const fs = require("node:fs");
    const { parseEnv } = require("node:util");
    if (!fs.existsSync(process.argv[1])) process.exit(0);
    const parsed = parseEnv(fs.readFileSync(process.argv[1], "utf8"));
    const value = parsed[process.argv[2]];
    if (value !== undefined) process.stdout.write(value);
  ' "$ENV_FILE" "$1"
}

MAPS_MAP_ID="$(read_substitution _MAPS_MAP_ID)"
FIREBASE_AUTH_DOMAIN="$(read_substitution _FIREBASE_AUTH_DOMAIN)"
FIREBASE_PROJECT_ID="$(read_substitution _FIREBASE_PROJECT_ID)"
FIREBASE_APP_ID="$(read_substitution _FIREBASE_APP_ID)"

MAPS_KEY="$(read_env_var NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)"
FIREBASE_API_KEY="$(read_env_var NEXT_PUBLIC_FIREBASE_API_KEY)"

for pair in "MAPS_KEY:NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env" \
            "FIREBASE_API_KEY:NEXT_PUBLIC_FIREBASE_API_KEY in .env" \
            "MAPS_MAP_ID:_MAPS_MAP_ID in cloudbuild.yaml" \
            "FIREBASE_AUTH_DOMAIN:_FIREBASE_AUTH_DOMAIN in cloudbuild.yaml" \
            "FIREBASE_PROJECT_ID:_FIREBASE_PROJECT_ID in cloudbuild.yaml" \
            "FIREBASE_APP_ID:_FIREBASE_APP_ID in cloudbuild.yaml"; do
  var="${pair%%:*}"
  where="${pair#*:}"
  if [[ -z "${!var}" ]]; then
    echo "warning: $var is empty (expected $where) — build will bake in an empty value" >&2
  fi
done

echo "Building $TAG (context: repo root, -f Dockerfile)"

docker build \
  -f Dockerfile \
  --build-arg=NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="$MAPS_KEY" \
  --build-arg=NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID="$MAPS_MAP_ID" \
  --build-arg=NEXT_PUBLIC_FIREBASE_API_KEY="$FIREBASE_API_KEY" \
  --build-arg=NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="$FIREBASE_AUTH_DOMAIN" \
  --build-arg=NEXT_PUBLIC_FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID" \
  --build-arg=NEXT_PUBLIC_FIREBASE_APP_ID="$FIREBASE_APP_ID" \
  -t "$TAG" \
  .
