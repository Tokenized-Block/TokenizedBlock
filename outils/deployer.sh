#!/bin/bash
# outils/deployer.sh — deploie l ARBRE LOCAL de ce depot sur Railway et attend que /sante montre le tampon attendu.
# Usage : bash outils/deployer.sh <tampon data-build>     (le tampon doit deja etre dans app.html, attribut ET <code>, <= 40 caracteres)
#
# ⛔ `railway up` envoie l arbre LOCAL, pas le commit : tout fichier servi modifie et non prouve part en prod. Stasher avant.
# ⛔ 2026-10-04 : « operation timed out » est la REPONSE du CLI qui expire. L envoi peut etre passe (le build arrive quand meme)
#    ou avoir vraiment echoue (`railway deployment list` : FAILED « does not have an associated build » = envoi trop lourd).
#    Un envoi « rate » se VERIFIE donc sur /sante (150 s) avant tout nouvel envoi — ne jamais boucler sur l envoi.
# Apres : lire /sante.sondes (naissance, marche, echange, cerveau = PRET ; 45 s apres le redemarrage, puis toutes les 10 min).
BUILD="$1"
cd "$(dirname "$0")/.." || exit 2
[ -n "$BUILD" ] || { echo "usage : bash outils/deployer.sh <tampon>"; exit 2; }
grep -q "data-build=\"$BUILD\"" app.html || { echo "le tampon $BUILD n est pas dans app.html"; exit 2; }
node vendor-xmtp.mjs > /dev/null 2>&1 || { echo "vendor-xmtp a echoue"; exit 3; }
lire() { curl -s -m 20 -H "x-ms-monitor: 1" https://tokenizedblock.space/sante | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).build)}catch(e){console.log('illisible')}})"; }
for essai in 1 2 3 4; do
  echo "envoi $essai"
  SORTIE=$(railway up --no-gitignore --detach --service tokenized-block 2>&1)
  CODE=$?
  echo "$SORTIE" | tail -2
  ATTENTE=36
  if [ $CODE -ne 0 ] || echo "$SORTIE" | grep -q -i -E "timed out|error|Caused by"; then
    echo "le CLI dit que l envoi a rate (code $CODE) : on LIT /sante 150 s avant de renvoyer"
    ATTENTE=15
  fi
  for i in $(seq 1 $ATTENTE); do
    sleep 10
    B=$(lire)
    if [ "$B" = "$BUILD" ]; then echo "SERVI: $B (essai $essai, ~$((i*10)) s)"; exit 0; fi
  done
  echo "pas encore servi apres $((ATTENTE*10)) s (vu: $B)"
done
echo "ECHEC: le build $BUILD n est pas servi — lire : railway deployment list --service tokenized-block"
exit 1
