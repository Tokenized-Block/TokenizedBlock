/* test-stades-bouton-relit-vraiment.mjs — UN ECRAN NE NOMME PAS UN GESTE INTROUVABLE.
 *
 * ⛔⛔ LE DEFAUT : le panneau des paliers disait, quand une passe finissait avec des marches non lus,
 *     « node lag / rate-limit, not a verdict on the blocks. Open a profile or Retry » — et le
 *     panneau `#stades` ne contenait AUCUN bouton. Ni « Retry », ni rien. Le lecteur cherchait un
 *     geste qui n existait pas, donc il cherchait le defaut chez lui.
 *     C est exactement la faute corrigee le meme jour sur la connexion : « Open your wallet to
 *     continue » dit a quelqu un qui n a aucun wallet a ouvrir.
 *
 * ⛔⛔ ET LE CORRECTIF EVIDENT AURAIT ETE FAUX. Brancher `lireLaVie()` tel quel sur ce bouton :
 *     le tour normal lit les 30 SUIVANTS du curseur, pas les non-lus. Le bouton aurait porte un nom
 *     faux, on n aurait rien vu bouger, et le curseur aurait avance — donc chaque clic aurait fait
 *     SAUTER 30 blocks a la rotation normale, en silence. Un rattrapage qui vole le tour.
 *   ⇒ `lireLaVie(cibles)` relit exactement les adresses demandees, plafonnees a `VIE_PAR_PASSE`, et
 *     ne touche PAS au curseur.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS :
 *   · que le noeud repondra. Le bouton relance la lecture ; si le RPC etrangle encore, les blocks
 *     resteront non lus — et c est la verite que le panneau dit deja.
 *   · que quelqu un clique. Ca se lira dans `stades_relire` sur `/api/entonnoir`, pas ici.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

/* ⛔ COMMENTAIRES DEPOUILLES AVANT TOUTE LECTURE. Ce depot ecrit ses defauts en clair, lignes
 *   fautives comprises ; une sonde qui grep le fichier brut accuse la documentation du defaut.
 *   Ca m est arrive DEUX fois dans la meme journee, le 2026-09-26. */
const depouiller = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const nu = depouiller(html);
const serveur = depouiller(readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8'));

let n = 0;
const v = (nom, fn) => { fn(); n++; };

function corpsDe(source, signature) {
  const d = source.indexOf(signature);
  if (d < 0) return null;
  let prof = 0, dans = null;
  for (let i = source.indexOf('{', d); i < source.length; i++) {
    const c = source[i];
    if (dans) { if (c === dans && source[i - 1] !== '\\') dans = null; continue; }
    if (c === '"' || c === "'" || c === '`') { dans = c; continue; }
    if (c === '{') prof++;
    else if (c === '}' && !--prof) return source.slice(d, i + 1);
  }
  return null;
}

v('⛔⛔ le panneau ne renvoie plus vers un bouton absent', () => {
  assert.ok(!/Open a profile or Retry/.test(nu),
    'le panneau nomme encore un geste (« Open a profile or Retry ») sans le fournir');
  assert.match(nu, /data-relire="/,
    'aucun bouton de relecture dans le panneau : la phrase redeviendrait une instruction morte');
  /* ⛔ LE BOUTON ANNONCE CE QU IL VA TENTER, pas le total en attente. Promettre 251 relectures au
   *   noeud qui vient de les refuser serait une deuxieme instruction infaisable. */
  assert.match(nu, /Math\.min\(g\.blocks\.length, VIE_PAR_PASSE\)/,
    'le libelle n est plus plafonne : il promettrait plus que ce que la passe tente');
});

v('⛔⛔ le bouton couvre le groupe qu on voit VRAIMENT a l ecran', () => {
  /* ⛔⛔ MESURE A L EXECUTION QUI A CORRIGE MON PREMIER CORRECTIF : page chargee en local le
   *     2026-09-26, `NON_LU` et `PRIX_NON_LU` etaient VIDES et le seul groupe affiche etait
   *     `PAS_REGARDE` — 360 blocks. Un bouton cable sur les deux groupes vides n aurait touche
   *     aucun ecran, et ma garde aurait verdi. */
  assert.match(nu, /const RELISIBLES = new Set\(\['NON_LU', 'PRIX_NON_LU', 'PAS_REGARDE'\]\);/,
    'PAS_REGARDE est sorti des groupes relisibles : c est celui qui contient la grande majorite');
  /* ⛔ ET LE VERBE SUIT L ETAT. `stades.js` a ete corrige le 2026-09-25 precisement pour separer
   *   « on a tente et rate » de « on n a jamais regarde » ; un « Re-read » sur le second reintroduit
   *   la confusion que cette separation a coute. */
  assert.match(nu, /g\.cle === 'PAS_REGARDE' \? 'Read ' : 'Re-read '/,
    'le verbe ne distingue plus « jamais regarde » de « tente et rate »');
  /* ⛔ ET LE TITRE NE DEMANDE PLUS UN GESTE A REPETER 360 FOIS. */
  const stades = depouiller(readFileSync(new URL('./stades.js', import.meta.url), 'utf8'));
  assert.ok(!/open one to read its market/.test(stades),
    'le titre demande encore d ouvrir les blocks un par un — 360 fois, sur la mesure du 2026-09-26');
  assert.match(stades, /Not looked at yet — the rolling read has not reached them/,
    'le titre ne dit plus l etat du groupe');
  /* ⛔ ET LES GROUPES OU RELIRE NE CHANGERAIT RIEN N EN SONT PAS. Un bouton sans effet est la meme
   *   faute que la phrase qu on vient de retirer. */
  assert.ok(!/RELISIBLES = new Set\(\[[^\]]*'SANS_MARCHE'/.test(nu),
    'SANS_MARCHE est devenu relisible : relire n y change rien, le bouton mentirait');
});

v('⛔⛔ une passe ciblee ne fait pas avancer le curseur du tour', () => {
  const corps = corpsDe(nu, 'async function lireLaVie(');
  assert.ok(corps, 'lireLaVie() est introuvable');
  assert.match(corps, /const cible = filePrioritaire\.length/,
    'la file prioritaire ne commande plus le lot : le bouton relirait les 30 suivants du curseur, '
    + 'pas les non-lus');
  assert.match(corps, /filePrioritaire = \[\];/,
    'la file n est plus videe : une passe qui rate rejouerait la meme demande en boucle');
  const iSi = corps.indexOf('if (cible) {');
  const iCurseur = corps.indexOf('vieCurseur += VIE_PAR_PASSE;');
  const iSinon = corps.indexOf('} else {', iSi);
  assert.ok(iSi > 0 && iSinon > iSi && iCurseur > iSinon,
    'l avancee du curseur n est plus enfermee dans la branche du tour normal ('
    + iSi + ' / ' + iSinon + ' / ' + iCurseur + ') : chaque clic ferait sauter 30 blocks');
  /* ⛔ ET LE LOT CIBLE RESTE PLAFONNE : sinon un clic lance 251 x 6 lectures d un coup. */
  assert.match(corps, /cible\.has\(String\(h\.adr\)\.toLowerCase\(\)\)\)\.slice\(0, VIE_PAR_PASSE\)/,
    'le lot cible n est plus plafonne a VIE_PAR_PASSE');
});

v('⛔ une passe ciblee ne raconte pas l avancee du tour', () => {
  const corps = corpsDe(nu, 'async function lireLaVie(');
  assert.ok(corps, 'lireLaVie() est introuvable');
  /* Le curseur n a pas bouge : « 30/181 so far » annoncerait une avancee qui n a pas eu lieu ET
   * cacherait ce qui vient d etre relu. Le message doit donc dependre de `cible`. */
  const iMsg = corps.indexOf('n.textContent = ');
  assert.ok(iMsg > 0, 'le message de fin de passe a disparu');
  const msg = corps.slice(iMsg, iMsg + 700);
  assert.match(msg, /cible\s*\n?\s*\?/,
    'le message de fin de passe ne distingue plus le tour normal du rattrapage');
  assert.match(msg, /retried /, 'le rattrapage ne dit plus ce qu il a relu');
  assert.match(msg, /so far, still going/, 'le tour normal a perdu sa phrase d avancement');
});

v('⛔ le bouton est recable apres chaque peinture', () => {
  const corps = corpsDe(nu, 'function peindreStades(');
  assert.ok(corps, 'peindreStades() est introuvable');
  const iPeint = corps.indexOf("$('#stades').innerHTML");
  const iCable = corps.indexOf("querySelectorAll('[data-relire]')");
  assert.ok(iPeint > 0 && iCable > iPeint,
    'le cablage ne suit plus la peinture : `innerHTML` detruit le bouton, un handler pose avant '
    + 'viserait un element qui n existe plus (' + iPeint + ' / ' + iCable + ')');
  /* ⛔⛔ ET LE BOUTON N EST PAS GARDE PAR `lectureVieEnCours` A LA PEINTURE. Mesure du 2026-09-26 :
   *     le groupe est passe de 361 a 344 pendant que je regardais, ~6 s par block — une passe de 30
   *     depasse donc l intervalle de 90 s, la lecture tourne EN CONTINU, et une telle garde aurait
   *     rendu ce bouton mort en permanence. J aurais remplace une instruction morte par un bouton
   *     mort, et ma propre garde aurait verdi dessus.
   *   ⇒ Le bouton MET EN FILE ; la file est honorable dans les deux etats. */
  assert.ok(!/RELISIBLES\.has\(g\.cle\) && !lectureVieEnCours/.test(corps),
    'le bouton est redevenu conditionne a « aucune passe en cours » : la lecture tourne en continu, '
    + 'il serait invisible en permanence');
  assert.match(corps, /filePrioritaire = adrs\.slice\(0, VIE_PAR_PASSE\)/,
    'le clic ne remplit plus la file : il tenterait de lutter contre la passe en cours');
  assert.match(corps, /Queued — the pass running now finishes first/,
    'le bouton ne dit plus le delai : « Reading… » pendant une autre passe serait faux');
  /* ⛔ ET IL DIT QU IL A PRIS LE CLIC. Une passe de 30 blocks depasse la minute ;
   *   un bouton muet pendant ce temps se fait recliquer — c est litteralement ce qui a produit
   *   25 taps sur la puce de connexion le 2026-09-26. */
  assert.match(corps, /Queued — reading these next/,
    'le bouton ne dit plus qu il a pris le clic : une minute de silence se fait recliquer');
  assert.match(corps, /b\.disabled = true/, 'le bouton reste cliquable pendant sa propre passe');
});

v('⛔⛔ le compteur du bouton est accepte par le serveur', () => {
  /* ⛔ `/api/etape` rend 204 pour un nom INCONNU comme pour un nom connu : le code HTTP ne prouve
   *   rien, et un compteur hors liste blanche disparait en silence. Mesure du 2026-09-25. */
  assert.match(serveur, /'stades_relire'/,
    'stades_relire n est pas dans ETAPES_ENTONNOIR : le beacon repondrait 204 sans rien enregistrer');
  /* ⛔ ET IL NE RECYCLE PAS UN NOM EXISTANT. `marche_rescan_ok` est la relecture d UN block depuis
   *   sa fiche ; les fondre reproduirait le defaut de `wallet_no_provider` — un seul nom pour neuf
   *   chemins, donc aucune origine tracable. */
  const corpsApp = corpsDe(nu, 'function peindreStades(');
  assert.ok(corpsApp && corpsApp.includes("etape('stades_relire')"),
    'le bouton ne compte pas, ou compte sous un autre nom : on ne saura pas s il sert');
  assert.ok(!corpsApp.includes("etape('marche_rescan_ok')"),
    'le bouton recycle le compteur de la fiche : les deux gestes deviendraient indistinguables');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok stades-bouton-relit-vraiment — ' + n + ' cas.');
console.log('   Le panneau ne nomme plus un geste absent ; le bouton relit les NON-LUS par tranches,');
console.log('   sans voler le tour, et son compteur porte un nom a lui.');
console.log('⚠️ NE PROUVE PAS que le noeud repondra, ni que quelqu un clique : ca se lira dans');
console.log('   `stades_relire` sur /api/entonnoir.');
