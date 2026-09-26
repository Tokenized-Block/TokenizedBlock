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
  /* ⛔⛔ LA PHRASE A CHANGE LE 2026-09-27, ET LA RAISON EST MESUREE. L ancienne menait avec « Open
   *     this page from inside your wallet app » — exactement ce que quelqu un SANS wallet ne peut
   *     pas faire. Le bloc avait deja ete reordonne pour mettre la porte sans application devant le
   *     bouton impossible ; le TEXTE, lui, pointait encore vers l impasse. La moitie d un correctif
   *     ressemble a un correctif.
   *   ⇒ L ordre des deux sorties suit maintenant leur FAISABILITE : d abord ce qui marche ici,
   *     ensuite l application pour qui l a deja. AUCUNE sortie n a ete retiree. */
  assert.match(corps, /No wallet in this browser/,
    'la fonction ne porte plus la phrase du cas sans wallet');
  /* ⛔ ELLE DOIT DIRE QUOI FAIRE, pas seulement ce qui manque. « aucun wallet » sans suite laisse le
   *   visiteur devant un mur ; c est ce mur qui a ete tape 29 fois pour 24 visites le 2026-09-26. */
  assert.match(corps, /make one right here/,
    'la phrase ne donne plus de suite POSSIBLE : nommer la cause sans dire quoi faire, c est un mur');
  /* ⛔⛔ ET LE CHEMIN FAISABLE DOIT VENIR EN PREMIER, pas seulement etre present. Une phrase qui
   *     contient les deux sorties mais COMMENCE par la plus dure reconduit le defaut en le
   *     documentant. On compare donc les POSITIONS, pas la presence. */
  assert.ok(corps.indexOf('make one right here') < corps.indexOf('open this page inside it'),
    'la phrase mene encore avec le chemin le plus dur : le possible doit passer devant');
  assert.match(corps, /Coinbase Wallet or MetaMask/,
    'la phrase ne nomme plus l autre sortie pour qui a deja une application');
  /* ⛔ ET ELLE DOIT RENDRE L AUTRE PHRASE QUAND UN WALLET EST LA : une fonction qui repond toujours
   *   pareil n est pas une mesure, c est une constante. */
  assert.match(corps, /if \(window\.ethereum\) return siWalletPresent;/,
    'le cas « wallet present » ne rend plus le message d origine : tous les refus diraient la meme chose');
  const combien = (nu.match(/No wallet in this browser/g) || []).length;
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

v('⛔⛔ les deux portes de sortie sont construites, pas recopiees, et au bon format', () => {
  /* ⛔⛔ POURQUOI ELLES EXISTENT : mesure de production du 2026-09-26. Sur les trois jours pleins ou
   *     le compteur existe (09-24 -> 09-26) : 55 sessions, 29 `wallet_no_provider`, et
   *     `wallet_connect_ok` = ZERO. `connecter()` est la SEULE porte qui pose `compte`, et le
   *     compteur a ete prouve atteignable a l execution (beacon ET enregistrement serveur) : ce
   *     zero est donc un vrai zero. Une phrase honnete ne suffisait pas ; il fallait une porte. */
  const m = corpsNuDe('function montrerSansWallet(');
  assert.ok(m, 'montrerSansWallet() est introuvable');
  /* ⛔ LES FORMATS SONT LUS DANS LA DOC, PAS RECITES — et c est la mutation qui compte, parce qu une
   *   URL fausse a exactement l air d une URL vraie.
   *   · MetaMask : `link.metamask.io/dapp/<hote+chemin>`, SANS le schema. De memoire j aurais ecrit
   *     `metamask.app.link`, qui est l ANCIEN hote.
   *   · Coinbase Wallet : `go.cb-w.com/dapp?cb_url=<URL complete, percent-encodee>`. */
  assert.match(m, /'https:\/\/go\.cb-w\.com\/dapp\?cb_url=' \+ encodeURIComponent\(location\.href\)/,
    'le lien Coinbase Wallet a change de forme : il veut l URL COMPLETE, percent-encodee');
  assert.match(m, /'https:\/\/link\.metamask\.io\/dapp\/' \+ location\.host \+ location\.pathname/,
    'le lien MetaMask a change de forme : hote documente `link.metamask.io`, et hote+chemin SANS schema');
  assert.ok(!/metamask\.app\.link/.test(m),
    'l ancien hote `metamask.app.link` est revenu : c est celui que la memoire propose, pas celui que la doc donne');
  /* ⛔ ET RIEN N EST ECRIT EN DUR : une URL recopiee enverrait le visiteur sur une AUTRE page que
   *   celle qu il regarde, sans qu il puisse s en apercevoir. */
  assert.ok(!/cb_url=https/.test(nu), 'une URL de destination est ecrite en dur dans le lien');
  /* ⛔ ON NE PROMET PAS QUE L APPLICATION S OUVRE : rien ici ne peut le mesurer. */
  assert.match(nu, /If you already have one of these apps/,
    'la phrase n est plus conditionnelle : elle promettrait une ouverture qu on ne mesure pas');
  /* ⛔ DEUX COMPTEURS, PAS UN — sinon on reproduit le defaut du jour meme (un nom, neuf chemins). */
  assert.match(nu, /etape\(a\.id === 'wOuvrirCbw' \? 'wallet_ouvrir_cbw' : 'wallet_ouvrir_mm'\)/,
    'les deux portes ne sont plus comptees separement : on ne saura pas laquelle sert');
  const serveur = depouiller(readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8'));
  for (const nom of ['wallet_ouvrir_cbw', 'wallet_ouvrir_mm']) {
    assert.ok(serveur.includes("'" + nom + "'"),
      nom + ' manque a ETAPES_ENTONNOIR : /api/etape rendrait 204 sans rien enregistrer');
  }
});

v('⛔⛔ la porte passkey existe, est servie par NOUS, et ne recouvre aucun wallet', () => {
  /* ⛔⛔ CE QUI L A DECIDE : 55 sessions du 2026-09-24 au 09-26, 29 `wallet_no_provider`, et
   *     `wallet_connect_ok` = ZERO. Les deeplinks supposent une application deja installee ; ce
   *     chemin-ci n en suppose aucune. */
  assert.match(nu, /id="wBaseAccount"/, 'le bouton Base Account a disparu du volet Wallet');

  const c = corpsNuDe('function chargerBaseAccount(');
  assert.ok(c, 'chargerBaseAccount() est introuvable');
  /* ⛔ SERVI PAR NOUS, PAS PAR UN CDN. Ce bundle fabrique les signatures de wallet de nos
   *   utilisateurs : un rebundle cote CDN changerait des octets sans qu on l ait decide. */
  assert.ok(!/cdn\.jsdelivr|unpkg|esm\.sh|https:\/\//.test(c),
    'le SDK est charge depuis une origine externe : un rebundle passerait sans decision');
  assert.match(nu, /const BASE_ACCOUNT_SRC = '\/npm\/@base-org\/account@2\.5\.13\/dist\/base-account\.min\.js'/,
    'le chemin du SDK a change : il doit rester celui du manifeste verifie');
  /* ⛔ UN ECHEC NE SE MET PAS EN CACHE : sinon un reseau qui tousse une fois ferme la porte pour
   *   toute la session, et le visiteur reclique dans le vide — 25 taps, on connait. */
  assert.match(c, /baseAccountCharge\.catch\(\(\) => \{ baseAccountCharge = null; \}\)/,
    'un echec de chargement reste en cache : la porte se fermerait pour toute la session');

  const o = corpsNuDe('async function ouvrirBaseAccount(');
  assert.ok(o, 'ouvrirBaseAccount() est introuvable');
  /* ⛔⛔ ON NE RECOUVRE JAMAIS UN WALLET EXISTANT. Sans ce garde, une extension injectee entre-temps
   *     serait ecrasee : l utilisateur a choisi son wallet, pas nous. */
  assert.match(o, /if \(!window\.ethereum\) \{\s*Object\.defineProperty\(window, 'ethereum'/,
    'le provider est pose sans verifier qu aucun wallet n est deja la : on ecraserait le sien');
  assert.match(o, /configurable: true/,
    'la propriete n est plus configurable : une extension injectee plus tard ne pourrait plus la remplacer');
  /* ⛔ ON PASSE PAR `connecter()`. Court-circuiter sauterait `wallet_connect_ok`, la bascule de
   *   chaine et la peinture — et on ne saurait pas si la porte sert. */
  /* ⛔ CETTE ASSERTION TESTAIT L ORTHOGRAPHE, PAS L INTENTION. Elle exigeait littéralement
   *   `await connecter()` ; quand j ai ajoute le filet anti-bouton-mort, l appel est devenu
   *   `connecter().then(…)` puis `await promesse` — strictement equivalent, et la garde a crie.
   *   Une garde qui nomme une FORME plutot qu une PROPRIETE bloque les bons correctifs et laisse
   *   passer les mauvais ecrits autrement. On exige donc : l appel existe, et il est attendu. */
  assert.match(o, /const promesse = connecter\(\)/,
    'la porte court-circuite connecter() : le succes ne serait plus compte, et le reste non plus');
  /* ⛔ ET L ECHEC NOMME SA CAUSE au lieu de renvoyer chercher un defaut chez soi. */
  assert.match(o, /Base Account did not open: /,
    'l echec ne nomme plus sa cause');

  /* ⛔ LES DEUX COMPTEURS DOIVENT ETRE ACCEPTES : /api/etape rend 204 pour un nom inconnu comme
   *   pour un nom connu, donc un compteur hors liste blanche disparait en silence. */
  /* ⛔⛔ LE BOUTON NE DOIT JAMAIS RESTER MORT. Mesure au banc le 2026-09-26 : la fenetre de
   *     connexion du SDK n a pas pu s ouvrir, `eth_requestAccounts` n a jamais resolu, et le bouton
   *     est reste « Opening… » DESACTIVE 25 secondes — sans aucun geste possible. C est la faute
   *     que toute cette journee a servi a corriger, et elle allait partir en production.
   *   ⛔ La garde exige les DEUX moities : rendre le bouton, ET ne pas abandonner la promesse (un
   *     vrai Face ID prend du temps ; couper refuserait une connexion en cours). */
  assert.match(o, /const relance = setTimeout\(/,
    'aucun filet : une fenetre de connexion bloquee laisserait le bouton mort pour toujours');
  /* ⛔⛔ CETTE ASSERTION TENAIT LA MAUVAISE MOITIE, et une mutation l a prouve. La ligne qui rend le
   *     bouton existe DEUX fois : dans le filet, et dans le `finally` de fin de fonction. Chercher
   *     la chaine dans toute la fonction verdissait donc meme en SUPPRIMANT celle du filet — or
   *     c est la seule qui compte, parce que le `finally` n est jamais atteint tant que la promesse
   *     ne rend pas la main. On borne donc la lecture au CORPS DU FILET.
   *   ⇒ « une garde peut etre VRAIE et couvrir la mauvaise moitie ». */
  const iF = o.indexOf('const relance = setTimeout(');
  const jF = o.indexOf('}, 12000);', iF);
  assert.ok(iF > 0 && jF > iF, 'le corps du filet est introuvable : bornes ' + iF + ' / ' + jF);
  const filet = o.slice(iF, jF);
  assert.match(filet, /b\.disabled = false; b\.textContent = 'Create a Base Account/,
    'le filet lui-meme ne rend pas le bouton : le visiteur resterait sans geste');
  assert.match(filet, /etape\('wallet_base_attente'\)/,
    'le filet ne compte pas : « la fenetre ne s ouvre pas » se lirait comme « personne n a essaye »');
  assert.match(o, /try \{ await promesse; \} finally \{ clearTimeout\(relance\); \}/,
    'la promesse est abandonnee au lieu d etre attendue : une connexion lente serait refusee');
  assert.match(o, /your browser blocked the pop-up/,
    'le filet ne nomme plus la cause probable : « ca ne marche pas » renvoie chercher un defaut chez soi');

  const serveur = depouiller(readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8'));
  for (const nom of ['wallet_base_clic', 'wallet_base_ko', 'wallet_base_attente']) {
    assert.ok(serveur.includes("'" + nom + "'"),
      nom + ' manque a ETAPES_ENTONNOIR : le beacon repondrait 204 sans rien enregistrer');
  }
  /* ⛔⛔ ET PAS DE SECOND COMPTEUR DE SUCCES. Le succes passe par `connecter()`, donc par
   *     `wallet_connect_ok`. Deux compteurs de succes concurrents finissent par faire publier le
   *     plus flatteur des deux. */
  assert.ok(!/wallet_base_ok/.test(nu + serveur),
    'un second compteur de succes est apparu : le rapport clic -> wallet_connect_ok cesserait de decider');

  /* ⛔ LE SDK EST DANS LE MANIFESTE VERIFIE, sinon le serveur ne le sert pas et le bouton est mort. */
  const manif = JSON.parse(readFileSync(new URL('./xmtp-manifeste.json', import.meta.url), 'utf8'));
  assert.ok(manif.fichiers['/npm/@base-org/account@2.5.13/dist/base-account.min.js'],
    'le SDK Base Account est absent du manifeste : le serveur refuserait de le servir');
});

assert.equal(n, 7, 'compte de cas inattendu : ' + n);
console.log('ok sans-wallet-dit-quoi-faire — ' + n + ' cas.');
console.log('   Les neuf refus ont UNE phrase, la puce du header mene au volet ou elle est ecrite,');
console.log('   et le seul chemin restant (le lien de la page) est donne avec son echec de copie visible.');
console.log('⚠️ NE PROUVE PAS qu un wallet s ouvre, ni que les 25 taps du 2026-09-26 venaient de la');
console.log('   puce : le compteur porte un seul nom pour neuf chemins. La suite se lit dans');
console.log('   /api/entonnoir les jours suivants, pas ici.');
