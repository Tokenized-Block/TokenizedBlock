/* test-mood-marche-lu-ailleurs.mjs — LE MOOD NE DIT JAMAIS « MARKET UNREAD » QUAND LE MARCHE EST LU.
 *
 * ⛔⛔⛔ LE DEFAUT (handoff Claude 2026-10-01 §5.2, decision de Raksha le meme soir). Le cerveau ne
 *      recevait que la lecture de chaine faite DEPUIS LE NAVIGATEUR. Un noeud public la refuse
 *      (429 / 500), `vie` arrive `null`, `cerveau.js` conclut `NON_LU` et l ecran affiche
 *      « market unread » — a cote d un panneau qui dit « Its market IS read: uniswap, $10M » a
 *      partir de `marcheParAdr` (lu par le serveur). Un echec de NOTRE lecture presente comme un
 *      fait sur le block.
 *
 * ⛔ CE FICHIER EXECUTE LE VRAI CODE : `vieServeurPourCerveau` + `entreesCerveau` extraits de
 *   app.html (depouille), puis le VRAI `pas()` de cerveau.js, puis le VRAI `nomHumeur`.
 *
 * ⛔⛔ SES TEMOINS NEGATIFS :
 *   T1 — l ANCIEN code (eaebb04 : app.html ET le libelle de cerveau.js) avec les MEMES entrees
 *        DOIT produire « market unread » : sinon ce test ne sait pas dire NON ;
 *   T2 — mutation `if (vs !== null) {` -> `if (false) {` (appliquee, comptee) DOIT retomber en NON_LU ;
 *   T3 — sans AUCUNE donnee de marche, le cerveau DOIT rester NON_LU : le repli n invente rien.
 * ⛔ Les libelles attendus sont des LITTERAUX du test, pas lus dans NOMS_HUMEUR.
 * ⚠️ NE PROUVE PAS ce que voit un navigateur : `marcheParAdr` doit avoir ete rempli (soleils) pour
 *   que le repli serve. Ca se mesure en production.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sansCommentaires } from './outils-test.js';
import { etatInitial, pas, nomHumeur } from './cerveau.js';

let n = 0;
const cas = (t, f) => { n += 1; try { f(); console.log('  ok  ' + t); } catch (e) { console.error('✗ ' + t); throw e; } };
const ACTUEL = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const git = (chemin) => execFileSync('git', ['show', 'eaebb04:' + chemin],
  { cwd: new URL('./', import.meta.url), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const ADR = '0x' + 'ab'.repeat(20);
/* La ligne serveur, forme de /api/trending (NVDAc mesure le 2026-10-01 : ~10 M$). */
const LIGNE_SERVEUR = { adr: ADR, sym: 'NVDAc', prixUsd: 160.5, fdvUsd: 10_515_845, liquiditeUsd: 2_309_929, dex: 'uniswap' };

function entrees(html, { marche = new Map(), vie = null, vieAvant = null, etatVie = 'NON_LUE' } = {}) {
  const nu = sansCommentaires(html, { minRetire: 5000 });
  const debut = nu.includes('function vieServeurPourCerveau(') ? 'function vieServeurPourCerveau(' : 'function entreesCerveau(';
  const d = nu.indexOf(debut);
  const f = nu.indexOf('function echangesDe(h)', d);
  assert.ok(d > 0 && f > d, 'tranche entreesCerveau introuvable');
  const fab = new Function('marcheParAdr', 'echangesDe', 'roleDe', 'rpcTete', nu.slice(d, f) + '\nreturn entreesCerveau;');
  const entreesCerveau = fab(marche, () => ({}), () => null, { n: 52_000_000 });
  return entreesCerveau(vie, vieAvant, null, etatVie, null, { adr: ADR });
}
function phaseApres(e, battements = 3) {
  let etat = etatInitial(ADR), vu = null;
  for (let i = 0; i < battements; i++) { const r = pas(etat, e); etat = r.etat; vu = r.vu; }
  return vu.phase;
}
const avecServeur = () => new Map([[ADR, LIGNE_SERVEUR]]);
const ditUnread = (libelle) => /unread/i.test(libelle);

cas('⛔⛔⛔ LECTURE NAVIGATEUR RATEE + MARCHE LU PAR LE SERVEUR : PAS DE « MARKET UNREAD »', () => {
  const e = entrees(ACTUEL, { marche: avecServeur(), vie: null, etatVie: 'NON_LUE' });
  const ph = phaseApres(e);
  assert.notEqual(ph, 'NON_LU', 'le cerveau conclut NON_LU sur un marche que l app a lu');
  assert.equal(ditUnread(nomHumeur(ph)), false, 'le mood dit « ' + nomHumeur(ph) + ' »');
  assert.equal(e.vie, 10_515_845, 'la taille ne vient pas de la meme ligne que le profil');
});

cas('⛔⛔ PAS ENCORE LU DANS LE NAVIGATEUR (etat undefined) + SERVEUR : MEME CHOSE', () => {
  const e = entrees(ACTUEL, { marche: avecServeur(), vie: null, etatVie: undefined });
  assert.notEqual(phaseApres(e), 'NON_LU');
});

cas('⛔⛔ LE REPLI COUPE `vieAvant` : pas de hausse inventee par un changement d unite (ETH -> $)', () => {
  const e = entrees(ACTUEL, { marche: avecServeur(), vie: null, vieAvant: 3000, etatVie: 'NON_LUE' });
  assert.equal(e.vieAvant, null);
  const ph = phaseApres(e);
  assert.ok(ph !== 'EXCITE' && ph !== 'INQUIET', 'phase ' + ph + ' : une variation a ete inventee');
});

cas('⛔ UNE LECTURE NAVIGATEUR REUSSIE PASSE TELLE QUELLE (le serveur ne la remplace pas)', () => {
  const e = entrees(ACTUEL, { marche: avecServeur(), vie: 3000, vieAvant: 2900, etatVie: 'LUE' });
  assert.equal(e.vie, 3000); assert.equal(e.vieAvant, 2900); assert.equal(e.etatVie, 'LUE');
});

cas('⛔ NON_TROUVEE N EST PAS TOUCHE (fait de chaine, pas echec de lecture)', () => {
  const e = entrees(ACTUEL, { marche: avecServeur(), vie: null, etatVie: 'NON_TROUVEE' });
  assert.equal(e.etatVie, 'NON_TROUVEE'); assert.equal(e.vie, null);
});

cas('TEMOIN T3 — AUCUNE DONNEE DE MARCHE : NON_LU, DIT « Mood not judged — our read failed »', () => {
  const e = entrees(ACTUEL, { marche: new Map(), vie: null, etatVie: 'NON_LUE' });
  const ph = phaseApres(e);
  assert.equal(ph, 'NON_LU', 'sans aucune donnee le cerveau juge quand meme : le repli invente');
  assert.equal(nomHumeur(ph), 'Mood not judged — our read failed');
  /* et une ligne serveur SANS prix ne compte pas (meme critere que « Its market IS read ») */
  const e2 = entrees(ACTUEL, { marche: new Map([[ADR, { adr: ADR, prixUsd: 0, fdvUsd: 5e6 }]]), etatVie: 'NON_LUE' });
  assert.equal(phaseApres(e2), 'NON_LU');
});

cas('TEMOIN T1 — L ANCIEN CODE (eaebb04) DIT « market unread » AVEC LES MEMES ENTREES', () => {
  const e = entrees(git('app.html'), { marche: avecServeur(), vie: null, etatVie: 'NON_LUE' });
  const ph = phaseApres(e);
  assert.equal(ph, 'NON_LU', 'l ancien code ne conclut plus NON_LU : ce temoin ne sait plus dire NON');
  const ancienLibelle = (/NON_LU: '([^']*)'/.exec(git('cerveau.js')) || [])[1];
  assert.equal(ancienLibelle, 'market unread', 'libelle ancien introuvable');
  assert.equal(ditUnread(ancienLibelle), true);
});

cas('TEMOIN T2 — REPLI COUPE PAR MUTATION : RETOMBE EN NON_LU', () => {
  const avant = 'if (vs !== null) {';
  const morceaux = ACTUEL.split(avant);
  assert.equal(morceaux.length, 2, 'mutation NON APPLIQUEE : un temoin qui ne mute rien ne prouve rien');
  const e = entrees(morceaux.join('if (false) {'), { marche: avecServeur(), vie: null, etatVie: 'NON_LUE' });
  assert.equal(phaseApres(e), 'NON_LU', 'la mutation n est pas vue : le test ne mesure pas le repli');
});

console.log('\n' + n + ' cas, 0 KO');
