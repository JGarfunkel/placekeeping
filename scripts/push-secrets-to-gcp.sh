#!/usr/bin/env bash
# Pushes every var above the "# config options" marker in the root .env
# into Google Secret Manager: creates each secret on first use, adds a new
# version on every run after. Vars at/after the marker (EMAIL_PROVIDER,
# IMAGE_STORAGE, etc.) are plain deploy-time config, not secrets, and are
# left alone — see .env for the marker line. Values never touch shell
# history or `gcloud`'s argv — they're piped in via --data-file=-.
#
# See CLOUD_RUN_DEPLOY.md for how these secrets get consumed by Cloud Run
# (--set-secrets) once they're pushed.
#
# Usage:
#   scripts/push-secrets-to-gcp.sh [--list] [env-file] [secret-name...]
#
#   --list        Print the discovered key names (one per line) and exit —
#                 no gcloud calls, no project required. Useful for feeding
#                 the same key list to `--set-secrets` / IAM-grant loops
#                 elsewhere so they don't drift from what actually gets
#                 pushed (see CLOUD_RUN_DEPLOY.md).
#   env-file      Defaults to .env. Parsed with Node's util.parseEnv, so
#                 quoting rules match what apps/web/next.config.ts loads.
#   secret-name   Optional: push only these vars instead of everything
#                 found above the marker (e.g. to rotate one credential).
#
# Requires: gcloud CLI authenticated against the target project (or set
# GCP_PROJECT to override `gcloud config get-value project`), Node >= 20.6.

set -euo pipefail

LIST_ONLY=0
if [[ "${1:-}" == "--list" ]]; then
  LIST_ONLY=1
  shift
fi

ENV_FILE=".env"
if [[ $# -gt 0 && -f "$1" ]]; then
  ENV_FILE="$1"
  shift
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 1
fi

MARKER="${CONFIG_MARKER:-# config options}"

read_var() {
  # Delegates to Node's util.parseEnv so quoting/escaping matches how the
  # app itself reads .env (see next.config.ts), instead of reimplementing
  # dotenv parsing in bash.
  node -e '
    const fs = require("node:fs");
    const { parseEnv } = require("node:util");
    const parsed = parseEnv(fs.readFileSync(process.argv[1], "utf8"));
    const value = parsed[process.argv[2]];
    if (value !== undefined) process.stdout.write(value);
  ' "$ENV_FILE" "$1"
}

keys_before_marker() {
  # Lists KEY names from uncommented KEY=... lines that appear before the
  # marker line (trimmed match), in file order, de-duplicated. Deliberately
  # scans raw lines rather than parseEnv's output so ordering and the
  # marker cutoff are exact.
  node -e '
    const fs = require("node:fs");
    const text = fs.readFileSync(process.argv[1], "utf8");
    const marker = process.argv[2];
    const seen = new Set();
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === marker) break;
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line.trim());
      if (m && !seen.has(m[1])) {
        seen.add(m[1]);
        console.log(m[1]);
      }
    }
  ' "$ENV_FILE" "$MARKER"
}

SECRETS=("$@")
if [[ ${#SECRETS[@]} -eq 0 ]]; then
  mapfile -t SECRETS < <(keys_before_marker)
fi

if [[ ${#SECRETS[@]} -eq 0 ]]; then
  echo "no keys found above the \"$MARKER\" marker in $ENV_FILE" >&2
  exit 1
fi

if [[ "$LIST_ONLY" -eq 1 ]]; then
  printf '%s\n' "${SECRETS[@]}"
  exit 0
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI not found on PATH" >&2
  exit 1
fi

PROJECT_ID="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "no GCP project set — pass GCP_PROJECT=... or run 'gcloud config set project ...'" >&2
  exit 1
fi

echo "Project: $PROJECT_ID"
echo "Source:  $ENV_FILE (above \"$MARKER\")"
echo "Keys:    ${SECRETS[*]}"
echo

for NAME in "${SECRETS[@]}"; do
  VALUE="$(read_var "$NAME")"
  if [[ -z "$VALUE" ]]; then
    echo "skip  $NAME (empty or not set in $ENV_FILE)"
    continue
  fi

  if gcloud secrets describe "$NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$VALUE" | gcloud secrets versions add "$NAME" \
      --project="$PROJECT_ID" --data-file=- --quiet >/dev/null
    echo "update $NAME (new version)"
  else
    printf '%s' "$VALUE" | gcloud secrets create "$NAME" \
      --project="$PROJECT_ID" --replication-policy=automatic --data-file=- --quiet >/dev/null
    echo "create $NAME"
  fi
done

echo
echo "Done. Grant the Cloud Run service account access with:"
echo '  gcloud secrets add-iam-policy-binding SECRET_NAME --member="serviceAccount:SA_EMAIL" --role="roles/secretmanager.secretAccessor"'
echo "(see CLOUD_RUN_DEPLOY.md — one-time per secret, not needed again on every push)"
