/* test-entonnoir-achat-visible.mjs — LES DEUX CHEMINS QUI NOUS PAIENT DOIVENT SE COMPTER.
 *
 * ⛔⛔ LE DEFAUT, MESURE LE 2026-09-29 SUR `/api/entonnoir` EN PRODUCTION, PAS DEDUIT :
 *     384 visites en 11 jours, 99 etapes declarees cote serveur, 63 jamais vues. Parmi les 63 :
 *     `achat_ok`, `achat_sign_propos`, `achat_sign_refus`, et TOUTE la famille `echange_refus_*`.
 *     Or `acheterAvecUsdc` n emettait AUCUNE etape, et le handler ETH une seule sur tout son
 *     parcours. Les deux ecrans qui portent notre frais de 0,1 % etaient donc INVISIBLES :
 *     « zero achat sur ce chemin » n etait pas une mesure, c etait une cecite — et le travail de
 *     conversion livre le meme jour aurait ete impossible a juger.
 *
 * ⛔⛔⛔ LA GARDE LA PLUS UTILE DE CE FICHIER N EST PAS CELLE DE MES AJOUTS : c est celle qui verifie
 *      que TOUT nom d etape emis par la page existe dans la liste blanche du serveur. `/api/etape`
 *      JETTE EN SILENCE tout nom absent — 34 noms sur 48 avaient ete perdus ainsi, et chacun valait
 *      0 pour toujours, indiscernable d un « personne n y arrive ». Un nom mal orthographie ne casse
 *      rien, ne leve aucune erreur, et rend une mesure fausse pour des mois.
 *
 * ⚠️ BORNE : ce fichier lit du TEXTE. Il prouve que les appels sont ECRITS, aux bons endroits, avec
 *    des noms que le serveur accepte. Il ne prouve NI qu un visiteur les declenche, NI que le beacon
 *    parte, NI que le serveur les compte. Seul `/api/entonnoir` le dira, et pas avant du trafic.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';


const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const serveur = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');

let n = 0;
const cas = (titre, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

/* ── la liste blanche, extraite du serveur, jamais recopiee ──────────────────────────────────── */
const bloc = /const ETAPES_ENTONNOIR = \[([\s\S]*?)\];/.exec(serveur);
assert.ok(bloc, 'ETAPES_ENTONNOIR introuvable dans serveur-web.js : ce test ne garde plus rien');
const BLANCHE = new Set([...bloc[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
assert.ok(BLANCHE.size >= 50, 'liste blanche suspecte : ' + BLANCHE.size + ' noms');

/* ── tous les noms EMIS par la page ──────────────────────────────────────────────────────────── */
/* ⛔⛔ MA PREMIERE EXTRACTION A RENDU UN FAUX POSITIF, ET IL M A APPRIS QUELQUE CHOSE. Elle accusait
 *     `vie_ko_etape`, qui n existe pas dans la liste blanche — mais le code ecrit
 *     `etape('vie_ko_etape' + Math.min(4, atteinte))` : c est un PREFIXE, et `vie_ko_etape1` a
 *     `vie_ko_etape4` sont tous les quatre acceptes. Un nom construit se verifie par prefixe.
 *   ⛔ ET ON NE LES EXEMPTE PAS EN SILENCE : les noms dynamiques sont COMPTES et IMPRIMES, et chacun
 *     doit avoir au moins un nom accepte qui commence par lui. Sinon `etape('achat_' + x)` passerait
 *     sans qu aucune de ses valeurs ne soit jamais enregistree. */
const bruts = [...html.matchAll(/\betape\(\s*'([^']+)'(\s*\+)?/g)];
const EMIS = [...new Set(bruts.filter((m) => !m[2]).map((m) => m[1]))];
const PREFIXES = [...new Set(bruts.filter((m) => m[2]).map((m) => m[1]))];
assert.ok(EMIS.length >= 30, 'extraction des emissions suspecte : ' + EMIS.length);

cas('⛔⛔⛔ AUCUN NOM EMIS N EST HORS DE LA LISTE BLANCHE (sinon il est jete EN SILENCE)', () => {
  const orphelins = EMIS.filter((e) => !BLANCHE.has(e));
  assert.deepEqual(orphelins, [],
    'ces noms sont emis par app.html et REFUSES par /api/etape : ils valent 0 pour toujours, sans '
    + 'aucune erreur visible, et un zero d etape est indiscernable d un « personne n y arrive ». '
    + 'Noms perdus : ' + orphelins.join(', '));
  const prefOrphelins = PREFIXES.filter((p) => ![...BLANCHE].some((b) => b.startsWith(p)));
  assert.deepEqual(prefOrphelins, [],
    'ces noms sont CONSTRUITS et aucun nom accepte ne commence par eux : toutes leurs valeurs seront '
    + 'jetees. Prefixes perdus : ' + prefOrphelins.join(', '));
  console.log('   ' + EMIS.length + ' noms litteraux + ' + PREFIXES.length + ' prefixe(s) dynamique(s) ('
    + PREFIXES.join(', ') + '), ' + BLANCHE.size + ' noms acceptes, 0 orphelin.');
});

cas('⛔⛔ TEMOIN : la garde ci-dessus DETECTE vraiment un orphelin', () => {
  /* ⛔ SANS CE CAS, la garde serait verte meme si mon extraction ne trouvait rien. On lui donne un
   *   faux nom et on exige qu il soit vu comme orphelin. */
  const faux = 'achat_nom_qui_n_existe_pas';
  assert.equal(BLANCHE.has(faux), false, 'le nom temoin existe vraiment : il faut en changer');
  const simule = [...EMIS, faux].filter((e) => !BLANCHE.has(e));
  assert.deepEqual(simule, [faux], 'la detection d orphelin ne fonctionne pas');
});

/* ── les deux chemins d achat, isoles ────────────────────────────────────────────────────────── */
function tranche(debut, fin, quoi) {
  const d = html.indexOf(debut);
  assert.ok(d > 0, quoi + ' : debut introuvable (' + debut + ')');
  const f = html.indexOf(fin, d);
  assert.ok(f > d, quoi + ' : fin introuvable (' + fin + ')');
  const t = html.slice(d, f);
  assert.ok(t.length > 1500, quoi + ' : tranche suspecte, ' + t.length + ' caracteres');
  return t;
}
const USDC = tranche('async function acheterAvecUsdc(', "$('#fAcheterUsdc').addEventListener", 'chemin USDC');
const ETH = tranche("$('#fAcheterEth').addEventListener", '/* ══', 'chemin ETH');

/* ⛔⛔ `achat_prepare` N EST PAS DANS CETTE LISTE, ET C EST DELIBERE. `test-achat-clic-vs-prepare.mjs`
 *     exige UN SEUL site pour ce nom, parce qu en production il a deja compte deux sens opposes
 *     (`achat_prepare: 1` et `echange_refus_wallet: 1` le meme jour, impossibles ensemble). Ma
 *     premiere version l ajoutait sur les deux chemins : le test existant a rougi, a juste titre, et
 *     c est lui qui avait raison. `achat_sign_propos` porte la meme information sans casser un
 *     compteur qui a deja coute une correction. */
const ATTENDUES = ['achat_clic', 'achat_sign_propos', 'achat', 'achat_ok',
  'achat_sign_refus', 'echange_refus_wallet', 'echange_refus_pas_de_pool',
  'echange_refus_marche_illisible', 'echange_refus_plan'];

for (const [nom, t] of [['USDC', USDC], ['ETH', ETH]]) {
  cas('⛔⛔ LE CHEMIN ' + nom + ' EMET LES ' + ATTENDUES.length + ' ETAPES DE SON PARCOURS', () => {
    const manquantes = ATTENDUES.filter((e) => !new RegExp("etape\\('" + e + "'").test(t));
    assert.deepEqual(manquantes, [],
      'le chemin ' + nom + ' reste AVEUGLE sur : ' + manquantes.join(', ') + '. Chacune de ces lignes '
      + 'absente rend une cause de perte indiscernable d un « personne ne passe ».');
  });
}

cas('⛔⛔ LES DEUX CHEMINS UTILISENT LE MEME VOCABULAIRE, sinon ils sont incomparables', () => {
  /* ⛔ UN JUMEAU QUI DIVERGE : si un ecran compte `achat` et l autre seulement `achat_ok`, on ne peut
   *   pas dire lequel convertit. C est le motif `single-and-batch-twins-diverge`. */
  const deU = new Set([...USDC.matchAll(/etape\('(achat[a-z_]*)'/g)].map((m) => m[1]));
  const deE = new Set([...ETH.matchAll(/etape\('(achat[a-z_]*)'/g)].map((m) => m[1]));
  assert.deepEqual([...deU].sort(), [...deE].sort(),
    'les deux ecrans d achat ne comptent pas les memes etapes — USDC: ' + [...deU].sort().join(',')
    + '  ETH: ' + [...deE].sort().join(','));
});

cas('⛔ `achat_clic` NE COMPTE PAS LE RAPPEL APRES APPROBATION', () => {
  /* ⛔ La fonction USDC se rappelle elle-meme apres l approbation : compter ce rappel doublerait le
   *   haut de l entonnoir, et le taux de conversion en serait divise par deux SANS RAISON. */
  const i = USDC.indexOf("etape('achat_clic')");
  assert.ok(i > 0, 'achat_clic absent du chemin USDC');
  const avant = USDC.slice(0, i);
  assert.match(avant, /if \(!apresApprobation\)\s*\{[^}]*$/,
    'achat_clic n est pas garde par `!apresApprobation` : le rappel apres approbation le recompte');
});

cas('⛔⛔ DANS LE CHEMIN ETH, `achat` N EST EMIS QUE SUR LE DERNIER APPEL', () => {
  /* ⛔ La boucle parcourt `r.appels`. Un `achat` par tour compterait N achats pour un seul le jour ou
   *   la liste regrandirait — et `appelsHeritage` existe deja avec trois appels. */
  const i = ETH.indexOf("etape('achat')");
  assert.ok(i > 0, 'achat absent du chemin ETH');
  const avant = ETH.slice(Math.max(0, i - 400), i);
  assert.match(avant, /i === r\.appels\.length - 1/,
    "le chemin ETH emet `achat` sans borner l index : une liste de N appels compterait N achats");
});

cas('⛔⛔ LES ETAPES QUI PEUVENT SE REPETER DANS UNE SESSION SONT DEDUPLIQUEES', () => {
  /* ⛔⛔ MESURE DU 2026-09-29 : `wallet_base_pret` a compte 79 fois pour 14 `visite` — 564 %. Ces
   *     deux etapes, ajoutees par moi la veille, n avaient pas `uneFois` alors que `visite` l a
   *     toujours eu. Un compteur qu on ne peut pas diviser par les visites n est pas une etape
   *     d entonnoir : c est du bruit qui fait paraitre la journee active. */
  for (const e of ['visite', 'wallet_base_pret', 'wallet_session_reprise']) {
    assert.match(html, new RegExp("etape\\('" + e + "',\\s*true\\)"),
      "`" + e + "` est emis sans `uneFois: true` : il comptera plusieurs fois par visiteur et son "
      + 'taux depassera 100 %');
  }
});

cas('⛔⛔ POUVOIR DE DETECTION PROUVE PAR MUTATION, pas par un HEAD qui bouge', () => {
  /* ⛔⛔ MA PREMIERE VERSION LISAIT `git show HEAD:app.html` POUR PROUVER LE ROUGE. C est une bombe a
   *     retardement : des que le correctif est commite, HEAD le contient et le cas rougit sur un
   *     code bon. Ce depot a deja retire deux epingles du meme genre. On mute donc le code COURANT.
   *   ⛔ ET CHAQUE MUTATION VERIFIE D ABORD QU ELLE A CHANGE QUELQUE CHOSE.
   *   ⛔⛔ ON MUTE DU CODE DEPOUILLE DE SES COMMENTAIRES, et j ai paye ce detail TROIS FOIS
   *      aujourd hui. Mon commentaire de `app.html` contient la phrase `i === r.appels.length - 1`
   *      pour expliquer la garde ; `String.replace` remplacait donc le COMMENTAIRE, le code restait
   *      intact, et la mutation paraissait « non detectee » sur une garde parfaitement bonne. Un
   *      controle textuel qui ne distingue pas le code de sa documentation accuse la documentation. */
  const nu = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const USDCnu = nu(USDC), ETHnu = nu(ETH), htmlNu = nu(html);
  for (const [q, a, b] of [['USDC', USDC, USDCnu], ['ETH', ETH, ETHnu], ['html', html, htmlNu]]) {
    assert.ok(b.length < a.length - 300, 'le depouillement de ' + q + ' n a presque rien retire ('
      + a.length + ' -> ' + b.length + ') : il ne fonctionne pas, donc les mutations ci-dessous ne '
      + 'prouvent rien');
  }
  const mutations = [
    ['un nom d etape devient inconnu du serveur',
      () => [...EMIS, 'achat_faux_nom_jamais_declare'],
      (noms) => noms.filter((e) => !BLANCHE.has(e)).length > 0],
    ['le chemin USDC perd son `achat_clic`',
      () => USDCnu.replace("etape('achat_clic')", "etape('rien')"),
      (s) => !/etape\('achat_clic'/.test(s)],
    ['le chemin ETH perd son `achat_ok`',
      () => ETHnu.replace("etape('achat_ok')", "etape('rien')"),
      (s) => !/etape\('achat_ok'/.test(s)],
    ['`achat` du chemin ETH n est plus borne au dernier appel',
      () => ETHnu.replace('i === r.appels.length - 1', 'true'),
      (s) => !/i === r\.appels\.length - 1/.test(s)],
    ['`wallet_base_pret` reperd sa deduplication',
      () => htmlNu.replace("etape('wallet_base_pret', true)", "etape('wallet_base_pret')"),
      (s) => !/etape\('wallet_base_pret',\s*true\)/.test(s)],
  ];
  let attrapees = 0;
  for (const [quoi, muter, detecte] of mutations) {
    const m = muter();
    assert.equal(detecte(m), true,
      'la mutation « ' + quoi + ' » N EST PAS DETECTEE : la garde correspondante est decorative');
    attrapees += 1;
  }
  /* ⛔ ET LES MUTATIONS SUR DU TEXTE DOIVENT AVOIR CHANGE LE TEXTE : sinon le motif remplace n existe
   *   plus et on aurait « prouve » la detection sur une chaine intacte. */
  assert.notEqual(USDCnu.replace("etape('achat_clic')", "etape('rien')"), USDCnu, 'mutation USDC sans effet');
  assert.notEqual(ETHnu.replace("etape('achat_ok')", "etape('rien')"), ETHnu, 'mutation ETH sans effet');
  assert.notEqual(ETHnu.replace('i === r.appels.length - 1', 'true'), ETHnu, 'mutation borne sans effet');
  assert.notEqual(htmlNu.replace("etape('wallet_base_pret', true)", "etape('wallet_base_pret')"), htmlNu,
    'mutation deduplication sans effet');
  assert.equal(attrapees, mutations.length);
  console.log('   ✓ ' + attrapees + '/' + mutations.length + ' mutations detectees, sans lire l historique.');
});

console.log('✓ test-entonnoir-achat-visible : ' + n + ' cas');
console.log('   Les deux chemins d achat comptent les memes ' + ATTENDUES.length + ' etapes, tous les noms emis');
console.log('   sont acceptes par le serveur, et les etapes repetables sont dedupliquees.');
console.log('   ⚠️ NE PROUVE PAS qu un visiteur les declenche : c est du texte lu, pas du trafic.');
