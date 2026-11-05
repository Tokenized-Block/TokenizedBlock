// test-denim-pot-20261105.mjs — LE POT DES PERIODES : DUREE (24 h) ET MARGE DE SIGNATURE (10 min) AU TEMPS DE BLOC MESURE (Denim).
// AVANT : keeper-pot.js MARGE_SIGNATURE = 300 et DUREE_PERIODE = 43200 (blocs a 2 s), texte (marge*2)/60 min ; pot.html blocsRestants * 2
//   / 3600 et « about 24 h » en dur. Apres Denim : 300 blocs = 1 min pour signer (le debut passe avant la signature -> revert apres gas
//   paye), et des periodes de 2,4 h.
// AFFIRME (EXECUTION de prochaineAction, et des fonctions de pot.html extraites) : 2 s -> 300 / 43 200 blocs (inchange) ; 0,2 s -> 3 000 /
//   432 000 ; non mesure -> OUVRIR REFUSE (ATTENDRE / ANCRER restent possibles : temoins) ; config explicite honoree ; textes de pot.html
//   au temps mesure, en blocs sinon. MUTANTS (anciennes constantes, refus retire, ancien texte) TUES.
// NE PROUVE PAS : une periode reelle ouverte sur mainnet ; ni que pot.html lit /api/temps-de-bloc en production (route executee par
//   test-denim-serveur-20261105.mjs).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { secondesPour, dureeTexte } from './temps-de-bloc.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n++; };
const BLOC = 60_000_000;
const SNAP = { complet: true, racine: '0x' + 'ca'.repeat(32), graine: '0x' + 'ab'.repeat(32), total: 100n, depose: 100n, jeton: '0x' + 'b2'.repeat(20) };

function bancKeeper(K) {
  const rates = [];
  const ok = (c, m) => { if (!c) rates.push(m); };
  const P = (o) => { try { return K.prochaineAction({ periodes: [], blocCourant: BLOC, ...o }); } catch (e) { return { action: 'THROW', pourquoi: e.message }; } };
  const a2 = P({ sParBloc: 2 });
  ok(a2.action === 'OUVRIR' && a2.debut === BLOC + 300 && a2.fin - a2.debut === 43200, '2 s : marge 300, duree 43 200 (lu ' + a2.action + ' ' + (a2.debut - BLOC) + ' / ' + (a2.fin - a2.debut) + ')');
  ok(/environ 10 min/.test(a2.resume || ''), '2 s : « environ 10 min » (lu ' + a2.resume + ')');
  const a02 = P({ sParBloc: 0.2 });
  ok(a02.action === 'OUVRIR' && a02.debut === BLOC + 3000 && a02.fin - a02.debut === 432000, '0,2 s : marge 3 000, duree 432 000 (lu ' + a02.action + ' ' + (a02.debut - BLOC) + ' / ' + (a02.fin - a02.debut) + ')');
  ok(/environ 10 min/.test(a02.resume || '') && a02.valideJusqua === a02.debut, '0,2 s : « environ 10 min », date limite = debut');
  for (const s of [null, undefined, 0, NaN, 1e6]) {
    const r = P({ sParBloc: s });
    ok(r.action === 'REFUS' && /not measured/.test(r.pourquoi || '') && !r.calldata, 'non mesure (' + String(s) + ') : OUVRIR refuse, aucun calldata (lu ' + r.action + ')');
  }
  const cfg = P({ config: { marge: 300, duree: 43200 } });
  ok(cfg.action === 'OUVRIR' && cfg.debut === BLOC + 300 && /300 blocs/.test(cfg.resume), 'config explicite sans temps mesure : honoree, texte en blocs (lu ' + cfg.resume + ')');
  /* temoins : ce qui ne depend pas du temps marche sans mesure */
  const att = K.prochaineAction({ periodes: [{ id: 0, debut: BLOC - 10, fin: BLOC + 500, ancreeLe: 0 }], blocCourant: BLOC });
  ok(att.action === 'ATTENDRE' && att.blocsRestants === 500, 'temoin : ATTENDRE sans mesure');
  const anc = K.prochaineAction({ periodes: [{ id: 0, debut: BLOC - 900, fin: BLOC - 10, ancreeLe: 0 }], blocCourant: BLOC, snapshot: SNAP });
  ok(anc.action === 'ANCRER', 'temoin : ANCRER sans mesure');
  return rates;
}

const SOURCE = path.join(ICI, 'keeper-pot.js');
const src = readFileSync(SOURCE, 'utf8');
const r0 = bancKeeper(await import(pathToFileURL(SOURCE).href));
vu(r0.length === 0, 'keeper-pot vert : ' + r0.join(' | '));

/* boucle-pot passe le temps de bloc au keeper (source) */
const BP = readFileSync(path.join(ICI, 'boucle-pot.js'), 'utf8');
vu(/prochaineAction\(\{ periodes, blocCourant, snapshot, config, sParBloc \}\)/.test(BP) && /config = \{\}, sParBloc = null \}\)/.test(BP), 'boucle-pot : tour({ sParBloc }) -> prochaineAction');

/* pot.html : les fonctions extraites et executees */
const POT = readFileSync(path.join(ICI, 'pot.html'), 'utf8').replace(/\r\n/g, '\n');
function bancPot(html) {
  const rates = [];
  const ok = (c, m) => { if (!c) rates.push(m); };
  const i = html.indexOf('let sParBlocPot = null;'), j = html.indexOf('async function lire() {');
  if (!(i > 0 && j > i)) return ['tranche pot.html introuvable'];
  const monter = (servi) => new Function('fetch', 'secondesPour', 'dureeTexte', 'AbortSignal', html.slice(i, j) + '\nreturn { lireTempsDeBloc, enClair };')(
    async () => ({ json: async () => (servi === 'panne' ? (() => { throw new Error('down'); })() : { ok: true, tempsDeBloc: { sParBloc: servi } }) }), secondesPour, dureeTexte, { timeout: () => undefined });
  const ouvrir = { action: 'OUVRIR', debut: BLOC + 3000, fin: BLOC + 3000 + 432000, valideJusqua: BLOC + 3000, blocCourant: BLOC };
  const attendre = { action: 'ATTENDRE', periode: 4, blocCourant: BLOC, blocsRestants: 18000 };
  return (async () => {
    const p02 = monter(0.2); await p02.lireTempsDeBloc();
    ok(/\(about 24 h\)/.test(p02.enClair(ouvrir)) && /about 10 min from now/.test(p02.enClair(ouvrir)), '0,2 s : OUVRIR dit 24 h et 10 min (lu ' + p02.enClair(ouvrir) + ')');
    ok(/about 60 min left/.test(p02.enClair(attendre)), '0,2 s : 18 000 blocs restants = about 60 min (lu ' + p02.enClair(attendre) + ')');
    const p2 = monter(2); await p2.lireTempsDeBloc();
    ok(/about 10 h left/.test(p2.enClair(attendre)), '2 s : 18 000 blocs = about 10 h (lu ' + p2.enClair(attendre) + ')');
    for (const servi of [null, 'panne']) {
      const pn = monter(servi); await pn.lireTempsDeBloc();
      ok(/18,000 blocks left/.test(pn.enClair(attendre)) && !/ h\b/.test(pn.enClair(attendre)) && /432,000 blocks/.test(pn.enClair(ouvrir)), 'non mesure (' + servi + ') : en blocs, aucune heure (lu ' + pn.enClair(attendre) + ')');
    }
    ok(!/\* 2 \/ 3600|about 24 h\)/.test(html.replace(/\/\*[\s\S]*?\*\//g, '')), 'pot.html : plus de blocs * 2 / 3600 ni « about 24 h » en dur');
    ok(/await lireTempsDeBloc\(\);\n\s*try \{ t = await tour\(\{[^\n]*sParBloc: sParBlocPot \}\)/.test(html), 'pot.html : le temps lu passe a tour()');
    return rates;
  })();
}
const p0 = await bancPot(POT);
vu(p0.length === 0, 'pot.html vert : ' + p0.join(' | '));

/* mutants */
let tues = 0;
const mutK = [
  ['DUREE_PERIODE (43 200) remise par defaut', 'blocsPour(DUREE_PERIODE_S, sParBloc)', 'DUREE_PERIODE'],
  ['MARGE_SIGNATURE (300) remise par defaut', 'blocsPour(MARGE_SIGNATURE_S, sParBloc)', 'MARGE_SIGNATURE'],
  ['refus non mesure retire (repli 2 s)', 'if (duree === null || marge === null) {', 'if (duree === null || marge === null) { return prochaineAction({ periodes, blocCourant, snapshot, config, sParBloc: 2 }); } if (false) {'],
];
for (const [nom, de, vers] of mutK) {
  assert.ok(src.includes(de), 'ancre : ' + nom);
  const f = path.join(ICI, '.mutant-denim-pot-' + tues + '-' + Date.now() + '.mjs');
  writeFileSync(f, src.replace(de, vers));
  try { const r = bancKeeper(await import(pathToFileURL(f).href)); vu(r.length > 0, 'mutant TUE — ' + nom + ' (' + r[0] + ')'); tues += 1; }
  finally { unlinkSync(f); }
}
const mutP = [
  ['pot.html : ancien texte blocs * 2 / 3600', "+ ' — ' + dureeBlocs(t.blocsRestants || 0) + ' left.", "+ ' — about ' + Math.round((t.blocsRestants || 0) * 2 / 3600) + ' h left."],
  ['pot.html : « about 24 h » en dur', "+ ' (' + dureeBlocs(t.fin - t.debut) + ').", "+ ' (about 24 h)."],
];
for (const [nom, de, vers] of mutP) {
  assert.ok(POT.includes(de), 'ancre : ' + nom);
  const r = await bancPot(POT.replace(de, vers));
  vu(r.length > 0, 'mutant TUE — ' + nom + ' (' + r[0] + ')'); tues += 1;
}
console.log('ok denim-pot — ' + n + ' assertions, ' + tues + '/' + (mutK.length + mutP.length) + ' mutants tues ; NE PROUVE PAS une periode reelle sur mainnet');
