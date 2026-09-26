/* test-sans-wallet-dit-quoi-faire.mjs — UN REFUS NE DOIT PAS DEMANDER L IMPOSSIBLE.
 *
 * ⛔⛔⛔ CE QUI A DECLENCHE CE TEST : une mesure de PRODUCTION, pas une relecture.
 *       `/api/entonnoir` au 2026-09-26 : `wallet_no_provider` = 25 pour `visite` = 7 ce jour-la.
 *       Les deux ne se comparent pas naivement — `visite` est dedoublonne par session
 *       (`etape(nom, true)` ecrit dans sessionStorage), `wallet_no_provider` non — mais c est
 *       exactement ce que ca dit : quelqu un a tape encore, et encore, et encore.
 *
 * ⚠️ ET CE N EST PAS UN COMPTEUR NEUF QUI DEMARRE. `wallet_no_provider` existe depuis le
 *   2026-09-23 (08b629a) ; son histoire est 0, 0, 4, 25. La hausse est reelle. J ai verifie ce
 *   point EN PREMIER parce que le piege inverse m a deja eu : un compteur ne le 09-25 aurait fait
 *   passer sa premiere journee pour une flambee.
 *
 * ⛔⛔ REPRODUIT EN NAVIGATEUR, 375 px, `window.ethereum` retire (2026-09-26) :
 *     trois taps sur la puce « Connect wallet » du header
 *       -> trois beacons `/api/etape?e=wallet_no_provider`
 *       -> `document.body.innerText` IDENTIQUE au caractere avant/apres.
 *     La raison etait bien ecrite — dans `#mienNote` (volet `v-mien`) et `#wNoteConnexion` (volet
 *     `v-wallet`), tous deux MASQUES, alors que la puce vit dans le header au-dessus des volets.
 *     Un message juste ecrit dans un `display:none` n avertit personne.
 *
 * ⛔ DEUXIEME DEFAUT, PLUS COUTEUX, SUR LE CHEMIN QUI RAPPORTE : neuf refus de l app disaient
 *   « Open your wallet to continue » — a quelqu un qui n a AUCUN wallet a ouvrir. La bonne phrase
 *   existait a UN seul endroit (le GM de la map, 2026-09-13), recopiee a la main nulle part
 *   ailleurs. C est `canonical-helper-weaker-copy` : la bonne version existe et ce sont les copies
 *   faibles qui servent.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS :
 *   · qu un wallet s ouvre. Aucun deeplink n est fabrique, et on ne peut pas mesurer d ici qu une
 *     application tierce s ouvre. Le bloc donne le LIEN, rien de plus, et il le dit.
 *   · que les 25 taps du 2026-09-26 venaient de la puce du header. Le compteur porte UN seul nom
 *     pour neuf chemins, donc l origine n est pas tracee. La puce est le suspect le plus probable
 *     (seul element de connexion visible sur tous les volets), pas un fait etabli.
 *   · que le taux de refus baisse. Ca se lira dans `/api/entonnoir` les jours suivants.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/** Corps d une fonction ou d un bloc, borne par equilibrage d accolades — jamais par un nombre de
 *  lignes. Une fenetre de lignes attribue a un bloc le contenu de son voisin ; ca m a deja donne
 *  trois faux positifs dans ce depot. */
function corpsDe(signature) {
  const d = html.indexOf(signature);
  if (d < 0) return null;
  let prof = 0, dans = null;
  for (let i = html.indexOf('{', d); i < html.length; i++) {
    const c = html[i];
    if (dans) { if (c === dans && html[i - 1] !== '\\') dans = null; continue; }
    if (c === '"' || c === "'" || c === '`') { dans = c; continue; }
    if (c === '{') prof++;
    else if (c === '}' && !--prof) return html.slice(d, i + 1);
  }
  return null;
}
/** Le corps, commentaires retires. C est CETTE version qu on interroge : voir plus bas pourquoi. */
const corpsNuDe = (signature) => { const c = corpsDe(signature); return c === null ? null : depouiller(c); };

/* ⛔⛔ COTE LU SANS LES COMMENTAIRES, ET C EST LA DEUXIEME FOIS QUE JE ME FAIS PRENDRE DANS CE SEUL
 *     FICHIER. Ce depot ecrit ses defauts EN CLAIR dans le code, phrases fautives et lignes
 *     fautives comprises : une sonde qui grep le fichier brut trouve la DOCUMENTATION du defaut et
 *     l accuse. Ma version precedente a classe `allerA('wallet')` — cite dans un commentaire — comme
 *     l appel reel, et a declare l ordre casse alors qu il etait juste.
 *   ⇒ DANS CE DEPOT, TOUTE SONDE TEXTUELLE DEPOUILLE LES COMMENTAIRES D ABORD. Sans ca, l honnetete
 *     du code devient sa propre source de faux positifs. */
const depouiller = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const nu = depouiller(html);

v('⛔ la phrase du cas « aucun wallet » existe une seule fois, dans une seule fonction', () => {
  const corps = corpsNuDe('function texteRefusConnexion(');
  assert.ok(corps, 'texteRefusConnexion() est introuvable : les neuf refus n ont plus de source unique');
  assert.match(corps, /No wallet found in this browser/,
    'la fonction ne porte plus la phrase du cas sans wallet');
  /* ⛔ ELLE DOIT DIRE QUOI FAIRE, pas seulement ce qui manque. « aucun wallet » sans suite laisse
   *   le visiteur devant un mur ; c est ce mur qui a ete tape 25 fois. */
  assert.match(corps, /Open this page from inside your wallet app/,
    'la phrase ne donne plus de suite possible : nommer la cause sans dire quoi faire, c est un mur');
  /* ⛔ ET ELLE DOIT RENDRE L AUTRE PHRASE QUAND UN WALLET EST LA : une fonction qui repond toujours
   *   pareil n est pas une mesure, c est une constante. */
  assert.match(corps, /if \(window\.ethereum\) return siWalletPresent;/,
    'le cas « wallet present » ne rend plus le message d origine : tous les refus diraient la meme chose');
  const combien = (nu.match(/No wallet found in this browser/g) || []).length;
  assert.equal(combien, 1,
    'la phrase est ecrite ' + combien + ' fois : une copie a la main derive, et c est la copie faible qui reste');
});

v('⛔⛔ aucun refus ne dit plus « ouvre ton wallet » sans passer par la fonction', () => {
  /* Chaque occurrence de l instruction impossible doit etre l ARGUMENT de texteRefusConnexion() :
   * la phrase reste pour qui a un wallet, elle est remplacee pour qui n en a pas. */
  const motifs = [
    'Open your wallet to continue',
    'Your wallet did not connect',
    'The wallet did not connect',
  ];
  const nus = [];
  for (const m of motifs) {
    let i = 0;
    for (;;) {
      i = nu.indexOf(m, i);
      if (i < 0) break;
      /* on remonte jusqu au debut de l instruction pour voir si l appel enveloppe la chaine.
       * ⛔ MA PREMIERE VERSION A ACCUSE LES NEUF SITES DEJA CORRIGES : elle exigeait que
       *   `texteRefusConnexion(` touche la phrase, en oubliant le GUILLEMET OUVRANT qui est
       *   forcement entre les deux. Une sonde qui crie sur le correctif desarme celle qui criera
       *   sur la regression — on retire donc le guillemet AVANT de juger. */
      const debut = Math.max(0, i - 160);
      const avant = nu.slice(debut, i).replace(/['"`]\s*$/, '');
      if (!/texteRefusConnexion\(\s*$/.test(avant)) nus.push(m + ' @ ' + i);
      i += m.length;
    }
  }
  assert.deepEqual(nus, [],
    'refus qui demandent encore l impossible : ' + nus.join(' · ')
    + ' — sans wallet dans le navigateur, « ouvre ton wallet » est infaisable');
});

v('⛔⛔ la puce du header mene quelque part, meme quand la connexion echoue', () => {
  const corps = corpsNuDe("$('#pCompte').addEventListener('click', async ()");
  assert.ok(corps, 'le gestionnaire de la puce de connexion est introuvable');
  /* ⛔ LE DEFAUT EXACT : `if (!compte) { await connecter(); return; }` sortait AVANT le
   *   `allerA('wallet')`, donc la raison restait dans un volet masque. Le `return` precoce est
   *   interdit ici, et c est cette forme-la qu on nomme. */
  assert.ok(!/if \(!compte\) \{[^}]*return;[^}]*\}/.test(corps),
    'la puce sort encore avant de naviguer : la raison s ecrira dans un volet masque, comme avant');
  const iC = corps.indexOf('await connecter()');
  const iN = corps.indexOf("allerA('wallet')");
  assert.ok(iC > 0 && iN > iC,
    'l ordre « tenter la connexion puis emmener voir » est casse : ' + iC + ' / ' + iN);
});

v('⛔ le bloc « sans wallet » existe, part masque, et donne le lien', () => {
  assert.match(html, /id="wSansWallet" hidden/,
    'le bloc sans-wallet n est plus masque au depart : il crierait a tort sur chaque visiteur equipe');
  assert.match(html, /id="wSansWalletUrl"/,
    'l URL en clair a disparu : un « Copied » sans copie reelle serait un mensonge a l ecran');
  assert.match(html, /id="wCopierLien"/, 'le bouton de copie du lien a disparu');
  /* ⛔ LE BOUTON DE CONNEXION RESTE. Certaines extensions s injectent apres le chargement : cacher
   *   `#bConnecterW` enfermerait celui dont le wallet arrive en retard. */
  assert.ok(!/bConnecterW'\)[^;]*\.hidden = true/.test(nu),
    'le bouton Connect wallet est cache quelque part : un wallet injecte tardivement n aurait plus de porte');
});

v('⛔ le bloc se montre sur le refus mesure, et se referme quand un wallet apparait', () => {
  const corps = corpsNuDe('async function connecter(');
  assert.ok(corps, 'connecter() est introuvable');
  const iCompteur = corps.indexOf("etape('wallet_no_provider')");
  const iMontre = corps.indexOf('montrerSansWallet(true)');
  const iCache = corps.indexOf('montrerSansWallet(false)');
  assert.ok(iCompteur > 0, 'le compteur du cas sans wallet a disparu de connecter()');
  assert.ok(iMontre > iCompteur, 'le bloc n est plus montre sur le chemin sans wallet');
  assert.ok(iCache > iMontre,
    'rien ne referme le bloc quand un wallet finit par repondre : une alerte qui survit a sa cause devient du decor');
  const m = corpsNuDe('function montrerSansWallet(');
  assert.ok(m, 'montrerSansWallet() est introuvable');
  /* ⛔ UNE SEULE MECANIQUE DE COPIE DANS L APP. Celle-la (`data-copier-diag`) dit deja un echec de
   *   presse-papier au lieu de le taire ; en ecrire une seconde la ferait diverger. */
  assert.match(m, /data-copier-diag/,
    'le bouton n utilise plus le seul gestionnaire de copie de l app : deux mecaniques finiront par diverger');
  assert.match(m, /bloc\.hidden = !sans;/, 'le bloc ne suit plus l etat mesure');
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok sans-wallet-dit-quoi-faire — ' + n + ' cas.');
console.log('   Les neuf refus ont UNE phrase, la puce du header mene au volet ou elle est ecrite,');
console.log('   et le seul chemin restant (le lien de la page) est donne avec son echec de copie visible.');
console.log('⚠️ NE PROUVE PAS qu un wallet s ouvre, ni que les 25 taps du 2026-09-26 venaient de la');
console.log('   puce : le compteur porte un seul nom pour neuf chemins. La suite se lit dans');
console.log('   /api/entonnoir les jours suivants, pas ici.');
