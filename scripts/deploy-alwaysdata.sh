#!/usr/bin/env bash

set -Eeuo pipefail

readonly DEPLOY_BRANCH="main"
readonly ALWAYSDATA_ACCOUNT="myconcretelab"
readonly ALWAYSDATA_SITE_ID="1070862"
readonly ALWAYSDATA_KEYCHAIN_SERVICE="sonoriva-alwaysdata-api"
readonly ALWAYSDATA_SSH_HOST="ssh-myconcretelab.alwaysdata.net"
readonly ALWAYSDATA_REMOTE_DIR="/home/myconcretelab/www/sonoriva"
readonly ALWAYSDATA_SITE_URL="https://app.sonoriva.fr"

fail() {
  printf 'Erreur : %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "la commande '$1' est requise."
}

for command_name in curl git jq security ssh; do
  require_command "$command_name"
done

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || fail "ce script doit être lancé depuis le dépôt SonoRiva."
cd "$repo_root"

current_branch=$(git branch --show-current)
[[ "$current_branch" == "$DEPLOY_BRANCH" ]] || fail "seule la branche '$DEPLOY_BRANCH' peut être déployée en production (branche actuelle : '$current_branch')."

[[ -z "$(git status --porcelain)" ]] || fail "le dépôt local contient des modifications non commitées."

git fetch --quiet origin "$DEPLOY_BRANCH"
local_commit=$(git rev-parse HEAD)
remote_commit=$(git rev-parse "origin/$DEPLOY_BRANCH")
[[ "$local_commit" == "$remote_commit" ]] || fail "HEAD n'est pas identique à origin/$DEPLOY_BRANCH. Commitez et poussez avant de déployer."

if ! alwaysdata_token=$(security find-generic-password \
  -s "$ALWAYSDATA_KEYCHAIN_SERVICE" \
  -a "$ALWAYSDATA_ACCOUNT" \
  -w 2>/dev/null); then
  fail "jeton Alwaysdata introuvable dans le trousseau Apple."
fi

site_api_url="https://api.alwaysdata.com/v1/site/$ALWAYSDATA_SITE_ID/"
if ! site_environment=$(curl --fail --silent --show-error \
  --user "$alwaysdata_token account=$ALWAYSDATA_ACCOUNT:" \
  "$site_api_url" | jq --exit-status --raw-output '.environment | select(type == "string" and length > 0)'); then
  fail "impossible de récupérer l'environnement du site Alwaysdata."
fi

printf 'Déploiement du commit %s sur Alwaysdata…\n' "$local_commit"

printf '%s\n' "$site_environment" | ssh "$ALWAYSDATA_ACCOUNT@$ALWAYSDATA_SSH_HOST" "
  set -Eeuo pipefail
  set -a
  . /dev/stdin
  set +a
  cd '$ALWAYSDATA_REMOTE_DIR'
  if [[ -n \"\${DOTENV_CONFIG_PATH:-}\" ]]; then
    [[ \"\$DOTENV_CONFIG_PATH\" == /* && -f \"\$DOTENV_CONFIG_PATH\" ]] || { printf 'Fichier de configuration privé introuvable.\\n' >&2; exit 1; }
    set -a
    . \"\$DOTENV_CONFIG_PATH\"
    set +a
  fi
  git fetch --quiet origin '$DEPLOY_BRANCH'
  git merge --ff-only 'origin/$DEPLOY_BRANCH'
  npm ci --include=dev --include=optional --loglevel=warn
  npm run build
  command -v pg_dump >/dev/null
  backup_dir='/home/myconcretelab/backups/sonoriva'
  mkdir -p \"\$backup_dir\"
  backup_file=\"\$backup_dir/sonoriva-\$(date -u +%Y%m%dT%H%M%SZ)-${local_commit:0:12}.dump\"
  pg_dump --format=custom --no-owner --no-acl \"\$DATABASE_URL\" > \"\$backup_file\"
  test -s \"\$backup_file\"
  npm run db:migrate
  test -f dist/server/index.js
  test -f dist/client/index.html
  test -f dist/client/docs/index.html
  test -z \"\$(git status --porcelain)\"
"

restart_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --user "$alwaysdata_token account=$ALWAYSDATA_ACCOUNT:" \
  --request POST \
  --header 'alwaysdata-synchronous: true' \
  "${site_api_url}restart/")
[[ "$restart_status" == "204" ]] || fail "le redémarrage Alwaysdata a répondu HTTP $restart_status."

health_ok=false
for _attempt in {1..20}; do
  if health_response=$(curl --fail --silent --show-error "$ALWAYSDATA_SITE_URL/api/health" 2>/dev/null) \
    && jq --exit-status '.status == "ok"' >/dev/null 2>&1 <<<"$health_response"; then
    health_ok=true
    break
  fi
  sleep 3
done

[[ "$health_ok" == true ]] || fail "le contrôle de santé du site a échoué après le redémarrage."

if ! curl --fail --silent --show-error "$ALWAYSDATA_SITE_URL/docs/" | grep --quiet '<title>Documentation SonoRiva'; then
  fail "la documentation publique n'est pas disponible après le redémarrage."
fi

printf 'SonoRiva est déployé : %s (%s)\n' "$ALWAYSDATA_SITE_URL" "$local_commit"
