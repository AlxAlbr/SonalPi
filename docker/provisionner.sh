#!/usr/bin/env bash
# Provisionnement du Nextcloud de test — IDEMPOTENT :
# chaque étape vérifie avant d'agir, le script peut être relancé sans dommage.
#
#   1. Attendre que Nextcloud soit prêt (le 1er démarrage installe longtemps)
#   2. Créer les comptes max et olivier
#   3. Activer files_lock + verrou natif avec timeout
#   4. Créer /MonCorpus chez max, y semer un corpus.json minimal (v3)
#   5. Partager MonCorpus avec olivier (lecture/écriture)
set -euo pipefail

cd "$(dirname "$0")"


MAX_PASS='max-max-1234'
OLIVIER_PASS='olivier-olivier-5678'

# Pile ciblée : BASE=http://localhost:8080 (A, défaut) ou :8081 (B) ;
# COMPOSE_FILE=compose-b.yml pour piloter la PILE B en occ.
# SANS_LOCK=1 → NE PAS installer files_lock (pile B du banc de contrat).
BASE="${BASE:-http://localhost:8080}"
SANS_LOCK="${SANS_LOCK:-0}"
FILE="${COMPOSE_FILE:-compose.yml}"
NC="docker compose -f $FILE exec -T -u www-data app php occ"

echo "── 1. Attente de Nextcloud…"
for i in $(seq 1 120); do
  if $NC status >/dev/null 2>&1; then echo "   prêt (${i}0 s max)."; break; fi
  sleep 5
  if [ "$i" = 120 ]; then echo "Nextcloud ne répond pas après 10 min." >&2; exit 1; fi
done

creer_user() { # $1=login $2=motdepasse
  if $NC user:info "$1" >/dev/null 2>&1; then
    echo "── user $1 : déjà présent."
  else
    echo "── user $1 : création…"
    # --password-from-env lit OCC_PASS dans l'ENVIRONNEMENT du processus occ :
    # le préfixe d'affectation le transmet sans jamais l'écrire sur disque.
    docker compose -f compose.yml exec -T -e OC_PASS="$2" -u www-data app php occ user:add --password-from-env --no-warnings "$1" >/dev/null \
      || { echo "échec création $1" >&2; exit 1; }
  fi
}
creer_user max "$MAX_PASS"
creer_user olivier "$OLIVIER_PASS"

if [ "$SANS_LOCK" = "1" ]; then
  echo "── files_lock : SKIPPÉ (pile B — ce serveur EST le cas « capacités restreintes »)."
elif $NC app:list 2>/dev/null | grep -q 'files_lock'; then
  # Verrous non éternels (défaut 0 = jamais) : 1 h, cf. plan §8.
  $NC config:app:set files_lock lock_timeout --value 3600 >/dev/null || true
  echo "   actif (lock_timeout 3600)."
else
  # L'image officielle ne bundle PAS l'app : installation depuis l'App Store
  # (nécessite que le conteneur ait accès à internet).
  if $NC app:install files_lock >/dev/null 2>&1; then
    $NC config:app:set files_lock lock_timeout --value 3600 >/dev/null || true
    echo "   installé depuis l'App Store (lock_timeout 3600)."
  else
    echo "   installation impossible (pas d'accès App Store ?) → la variante B" \
         " (PUT conditionnel) couvre. Résultat de sonde utile, pas un échec."
  fi
fi

echo "── Corpus partagé /MonCorpus…"
AUTH_MAX="max:${MAX_PASS}"
CODEX="$BASE/remote.php/dav/files/max/MonCorpus"
MKCOL() { curl -s -o /dev/null -u "$AUTH_MAX" -X MKCOL "$CODEX/$1"; }

# MKCOL idempotent (405 si existe déjà).
curl -s -o /dev/null -u "$AUTH_MAX" -X MKCOL "$CODEX"
MKCOL entretiens

# corpus.json minimal v3 (contrat src/shared/format.ts) — membership vide.
cat > /tmp/corpus-seed.json <<'JSON'
{
  "formatVersion": 3,
  "nom": "Corpus Docker Test",
  "codebook": {},
  "variables": {},
  "reglesAnon": {},
  "personnes": {},
  "membership": {}
}
JSON
curl -s -o /dev/null -u "$AUTH_MAX" -X PUT \
     -H 'Content-Type: application/json' --data-binary @/tmp/corpus-seed.json \
     "$CODEX/corpus.json"

echo "── Partage avec olivier (lecture/écriture)…"
# Pas de commande occ `share:` : l'API OCS files_sharing est la voie officielle.
# Idempotent : re-partager un chemin déjà partagé renvoie 403 (toléré).
CODE_SHARE=$(curl -s -o /tmp/ocs-share.xml -w '%{http_code}' -u "$AUTH_MAX" -X POST \
  "$BASE/ocs/v2.php/apps/files_sharing/api/v1/shares" \
  -H 'OCS-APIRequest: true' \
  -d 'path=MonCorpus&shareType=0&shareWith=olivier&permissions=31')
if [ "$CODE_SHARE" = "200" ]; then
  echo "   partagé."
elif grep -q '<statuscode>403' /tmp/ocs-share.xml; then
  echo "   déjà partagé."
else
  echo "   ÉCHEC du partage (HTTP $CODE_SHARE) — voir /tmp/ocs-share.xml." >&2
  exit 1
fi

echo
echo "Socle prêt :"
echo "  UI web          : $BASE (admin / admin-admin-1)"
echo "  DAV de max      : $CODEX        ($AUTH_MAX)"
echo "  DAV d'olivier   : $BASE/remote.php/dav/files/olivier/MonCorpus  (olivier:$OLIVIER_PASS)"
