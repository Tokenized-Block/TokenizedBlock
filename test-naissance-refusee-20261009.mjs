/* test-naissance-refusee-20261009.mjs — UNE FENETRE REFUSEE ARRETE LA RECHERCHE DE NAISSANCE : ELLE N EST JAMAIS SAUTEE.
 *
 * Audit du 2026-10-09 (budget du noeud d archive) : `naissanceDuJeton` (soldes-jeton.js) faisait `continue` sur une fenetre
 * refusee et rendait le premier mint trouve APRES elle. Si la fenetre sautee portait la vraie naissance, un mint POSTERIEUR
 * devenait la naissance : `reconstruireHolders` (serveur-web.js) rejouait depuis la, ecrivait l entree dans holders-cache.json,
 * et ne cherchait plus jamais la naissance (elle ne se cherche que tant qu elle vaut null). Et `holdersCorps` publiait cette
 * fausse naissance. Une fenetre refusee n est pas une fenetre vide.
 * Les gardes, EXECUTEES :
 *   A. soldes-jeton.js importe : trois etats (LUE / ABSENTE / NON_LUE) ; le balayage S ARRETE a la fenetre refusee (aucune
 *      lecture apres elle) ; `naissanceDuJeton` ne rend plus un mint posterieur a une fenetre non lue.
 *   B. reconstruireHolders + holdersCorps + ecrireHolders EXTRAITS du fichier livre et executes contre un RPC simule (l ecriture
 *      du fichier est captee, pas faite) : naissance non lue -> rien de rejoue, rien d ecrit, et la route le NOMME ; relecture
 *      propre -> la vraie naissance, soldes justes ; absente -> nommee ; la passe propre d un AUTRE jeton reecrit le fichier
 *      sans lui ; le refus du REJEU garde son traitement d avant (temoin).
 * ⛔ TEMOINS (A6, B5) : ils doivent etre VERTS sur le code d avant aussi -- ils gardent ce qui ne devait pas changer.
 * ⛔ BORNE : aucun noeud reel n est appele ; le budget reel du noeud CDP n est pas exerce ici. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as S from './soldes-jeton.js';
import { partsHolders } from './parts-holders.js';

const { TOPIC_TRANSFER, ADRESSE_ZERO } = S;
let n = 0;
const rates = [];
/* ⛔ chaque cas tourne meme si le precedent echoue : la preuve « rouge avant » doit montrer CHAQUE assertion qui tombe */
const cas = async (titre, f) => { n++; try { await f(); console.log('  ok  ' + titre); } catch (e) { rates.push(titre); console.error('  ✗ ' + titre + '\n      ' + String(e && e.message).split('\n')[0]); } };

const JETON = '0xb20000000000000000000016d09cd53724fc0601';
const JETON2 = '0xb20' + '0'.repeat(33) + 'beef';
const A = '0x' + 'a1'.repeat(20);
const B = '0x' + 'b2'.repeat(20);
const mot = (a) => '0x' + a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const log = (bloc, de, vers, v, adr = JETON) => ({ adr, blockNumber: '0x' + bloc.toString(16),
  topics: [TOPIC_TRANSFER, mot(de), mot(vers)], data: '0x' + BigInt(v).toString(16).padStart(64, '0') });

/* La chaine simulee : naissance VRAIE au bloc 3500, un transfert A->B dans la meme fenetre, et un SECOND mint au bloc 7500.
 * Avec PREMIER = 1000 et le pas par defaut (2000), les fenetres sont 1000-2999, 3000-4999, 5000-6999, 7000-8999, 9000-9999. */
const PREMIER = 1000, FIN = 9999;
const LOGS = [log(3500, ADRESSE_ZERO, A, 1000n), log(4000, A, B, 300n), log(7500, ADRESSE_ZERO, A, 50n)];
const SUPPLY = 1050n;

/** RPC simule. `refuse(de, a, mintSeul, adresse)` decide quelles fenetres getLogs sont refusees ; il peut changer entre deux passes. */
function rpcChaine({ logs = LOGS, refuse = () => false, supply = SUPPLY, fin = FIN, nonListe = () => false } = {}) {
  const appels = [];
  const f = async (methode, params) => {
    if (methode === 'eth_blockNumber') return '0x' + fin.toString(16);
    if (methode === 'eth_call') return '0x' + supply.toString(16).padStart(64, '0');
    if (methode !== 'eth_getLogs') throw new Error('appel non simule : ' + methode);
    const p = params[0];
    const de = parseInt(p.fromBlock, 16), a = parseInt(p.toBlock, 16);
    const mintSeul = (p.topics || []).length > 1;
    appels.push({ de, a, mintSeul, adresse: p.address });
    if (f.refuse(de, a, mintSeul, p.address)) throw new Error('request limit reached');
    if (nonListe(de, a, mintSeul)) return { pasUneListe: true };
    return logs.filter((l) => {
      const b = parseInt(l.blockNumber, 16);
      if (l.adr !== p.address || b < de || b > a) return false;
      return mintSeul ? l.topics[1] === mot(ADRESSE_ZERO) : true;
    });
  };
  f.refuse = refuse;
  f.appels = appels;
  return f;
}
const chevauche = (x, y) => (de, a) => de <= y && a >= x;

/* ── A. soldes-jeton.js, importe ───────────────────────────────────────────────────────────────── */
await cas('A1 naissanceDuJeton : fenetre de naissance refusee + mint posterieur -> null, JAMAIS le mint posterieur', async () => {
  const rpc = rpcChaine({ refuse: chevauche(3000, 4999) });
  const r = await S.naissanceDuJeton({ rpc, jeton: JETON, depuis: PREMIER, jusqua: FIN });
  assert.equal(r, null, 'la naissance rendue est ' + r + ' : un mint POSTERIEUR a une fenetre non lue (la vraie est 3500)');
});
await cas('A2 lireNaissance : NON_LUE nomme, avec la fenetre refusee et le prefixe lu', async () => {
  assert.equal(typeof S.lireNaissance, 'function', 'soldes-jeton.js n exporte pas lireNaissance');
  const rpc = rpcChaine({ refuse: chevauche(3000, 4999) });
  const r = await S.lireNaissance({ rpc, jeton: JETON, depuis: PREMIER, jusqua: FIN });
  assert.equal(r.etat, 'NON_LUE');
  assert.equal(r.bloc, null);
  assert.deepEqual(r.refusee, { de: 3000, a: 4999 });
  assert.equal(r.luJusqua, 2999, 'le prefixe CONTIGU lu sans mint finit avant la fenetre refusee');
  assert.match(r.pourquoi, /request limit reached/, 'la cause du noeud voyage avec l etat');
});
await cas('A3 le balayage S ARRETE a la fenetre refusee : aucune lecture apres elle (rien n est saute)', async () => {
  const rpc = rpcChaine({ refuse: chevauche(3000, 4999) });
  await S.naissanceDuJeton({ rpc, jeton: JETON, depuis: PREMIER, jusqua: FIN });
  assert.deepEqual(rpc.appels.map((x) => x.de), [1000, 3000], 'fenetres lues : ' + rpc.appels.map((x) => x.de).join(','));
});
await cas('A4 une fenetre refusee AVANT la fenetre de naissance arrete aussi : on ne sait pas qu elle etait vide', async () => {
  const r = await S.naissanceDuJeton({ rpc: rpcChaine({ refuse: chevauche(1000, 2999) }), jeton: JETON, depuis: PREMIER, jusqua: FIN });
  assert.equal(r, null, 'naissance rendue : ' + r + ' alors que la fenetre 1000-2999 n a pas ete lue');
  const l = await S.lireNaissance({ rpc: rpcChaine({ refuse: chevauche(1000, 2999) }), jeton: JETON, depuis: PREMIER, jusqua: FIN });
  assert.equal(l.etat, 'NON_LUE'); assert.equal(l.luJusqua, PREMIER - 1, 'rien n a ete lu');
});
await cas('A5 un resultat qui n est pas une liste est NON_LUE, pas une fenetre vide', async () => {
  const rpc = rpcChaine({ nonListe: chevauche(3000, 4999) });
  const r = await S.naissanceDuJeton({ rpc, jeton: JETON, depuis: PREMIER, jusqua: FIN });
  assert.equal(r, null, 'naissance rendue : ' + r + ' apres une reponse qui n etait pas une liste');
  const l = await S.lireNaissance({ rpc: rpcChaine({ nonListe: chevauche(3000, 4999) }), jeton: JETON, depuis: PREMIER, jusqua: FIN });
  assert.equal(l.etat, 'NON_LUE'); assert.deepEqual(l.refusee, { de: 3000, a: 4999 });
});
await cas('A6 TEMOIN naissanceDuJeton : tout lu -> 3500 ; aucun mint -> null ; un refus APRES la naissance ne change rien', async () => {
  assert.equal(await S.naissanceDuJeton({ rpc: rpcChaine(), jeton: JETON, depuis: PREMIER, jusqua: FIN }), 3500);
  assert.equal(await S.naissanceDuJeton({ rpc: rpcChaine({ logs: [] }), jeton: JETON, depuis: PREMIER, jusqua: FIN }), null);
  const apres = rpcChaine({ refuse: chevauche(7000, 8999) });
  assert.equal(await S.naissanceDuJeton({ rpc: apres, jeton: JETON, depuis: PREMIER, jusqua: FIN }), 3500);
  assert.deepEqual(apres.appels.map((x) => x.de), [1000, 3000], 'la recherche s arrete au premier mint, avant la fenetre refusee');
});
await cas('A7 lireNaissance : LUE (tout lu avant le mint) et ABSENTE (tout lu, aucun mint, luJusqua = la fin)', async () => {
  assert.equal(typeof S.lireNaissance, 'function', 'soldes-jeton.js n exporte pas lireNaissance');
  const lue = await S.lireNaissance({ rpc: rpcChaine(), jeton: JETON, depuis: PREMIER, jusqua: FIN });
  assert.equal(lue.etat, 'LUE'); assert.equal(lue.bloc, 3500);
  const absente = await S.lireNaissance({ rpc: rpcChaine({ logs: [] }), jeton: JETON, depuis: PREMIER, jusqua: FIN });
  assert.equal(absente.etat, 'ABSENTE'); assert.equal(absente.bloc, null); assert.equal(absente.luJusqua, FIN);
  const apres = await S.lireNaissance({ rpc: rpcChaine({ refuse: chevauche(7000, 8999) }), jeton: JETON, depuis: PREMIER, jusqua: FIN });
  assert.equal(apres.etat, 'LUE'); assert.equal(apres.bloc, 3500, 'la naissance precede la fenetre refusee : elle est lue');
});

/* ── B. reconstruireHolders + holdersCorps + ecrireHolders, extraits du fichier livre et EXECUTES ── */
const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const extraire = (debut) => {
  const i = src.indexOf(debut); assert.ok(i > 0, debut + ' introuvable');
  const f = /\r?\n\}\r?\n/.exec(src.slice(i)); assert.ok(f, 'fin de ' + debut + ' introuvable');
  return src.slice(i, i + f.index + f[0].length);
};
const corpsReconstruire = extraire('async function reconstruireHolders(jeton) {');
const corpsHolders = extraire('async function holdersCorps(jeton) {');
const corpsEcrire = extraire('function ecrireHolders() {');

function monter(rpc) {
  const cache = new Map();
  const passes = [];
  /* `fichier` = ce que le VRAI ecrireHolders aurait pose sur le volume (ecriture captee, rien n est ecrit sur disque) */
  const m = { cache, ecritures: 0, rpc, fichier: null };
  const tmp = new Map();
  const ecrireVrai = new Function('holdersCache', 'FICHIER_HOLDERS', 'HOLDERS_FICHIER_MAX_OCTETS', 'writeFileSync', 'renameSync',
    'let holdersEcritureEnCours = false;\n' + corpsEcrire + '\n; return ecrireHolders;')(
    cache, 'holders-cache.json', 4 * 1024 * 1024,
    (p, payload) => { tmp.set(p, payload); }, (de) => { m.fichier = JSON.parse(tmp.get(de)); });
  /* ⛔ les DEUX noms sont fournis : le code d avant appelle naissanceDuJeton, le code corrige lireNaissance. */
  const reconstruire = new Function('holdersCache', 'HOLDERS_MAX', 'rpcServeur', 'naissanceDuJeton', 'lireNaissance',
    'PREMIER_BLOCK_TB', 'passeIncrementale', 'ecrireHolders', corpsReconstruire + '\n; return reconstruireHolders;')(
    cache, 200, rpc, S.naissanceDuJeton, S.lireNaissance, PREMIER, S.passeIncrementale, () => { m.ecritures++; ecrireVrai(); });
  const suivi = (j) => { const p = reconstruire(j); passes.push(p); return p; };
  const corps = new Function('holdersCache', 'reconstruireHolders', 'rpcServeur', 'verifierSomme', 'soldesNegatifs',
    'partsHolders', 'POT_FICTIF', corpsHolders + '\n; return holdersCorps;')(
    cache, suivi, rpc, S.verifierSomme, S.soldesNegatifs, partsHolders, 10n ** 18n);
  m.passe = async (j = JETON) => { await suivi(j); await Promise.all(passes.splice(0)); return cache.get(j); };
  /* la route relance une passe en fond : on l attend, pour que le cas suivant parte d un etat stable */
  m.route = async (j = JETON) => { const t = await corps(j); await Promise.all(passes.splice(0)); return JSON.parse(t); };
  m.dansLeFichier = (j) => (m.fichier || []).find(([k]) => k === j) || null;
  return m;
}

await cas('B1 naissance refusee : AUCUNE naissance retenue, rien de rejoue, rien d ecrit sur le volume', async () => {
  const m = monter(rpcChaine({ refuse: chevauche(3000, 4999) }));
  const e = await m.passe();
  assert.equal(e.naissance, null, 'naissance retenue : ' + e.naissance + ' (la vraie est 3500, la fenetre 3000-4999 n a pas ete lue)');
  assert.equal(e.jusqua, null, 'un rejeu est parti d une naissance fausse : jusqua=' + e.jusqua);
  const f = m.dansLeFichier(JETON);
  assert.equal(f, null, 'holders-cache.json porte ce jeton avec naissance ' + (f && f[1].naissance) + ', posterieure a une fenetre non lue');
  assert.equal(m.ecritures, 0);
  assert.ok(e.rechercheNaissance && e.rechercheNaissance.etat === 'NON_LUE', 'l etat NON_LUE n est pas garde dans l entree');
  assert.ok(!m.rpc.appels.some((x) => !x.mintSeul), 'un getLogs de rejeu a ete fait sans naissance lue');
});
await cas('B2 la route NOMME la naissance non lue (avant : une fausse naissance publiee en INCOMPLET)', async () => {
  const m = monter(rpcChaine({ refuse: chevauche(3000, 4999) }));
  await m.passe();
  const j = await m.route();
  assert.equal(j.etat, 'NON_LU', 'etat rendu : ' + j.etat + ' — ' + j.pourquoi + ' — naissance publiee ' + j.naissance);
  assert.equal(j.naissance, null, 'une naissance est publiee : ' + j.naissance + ' — ' + j.pourquoi);
  assert.deepEqual(j.naissanceNonLue, { de: 3000, a: 4999 }, 'la fenetre non lue n est pas publiee — ' + j.pourquoi);
  assert.match(j.pourquoi, /birth of this block is not read/, 'raison rendue : ' + j.pourquoi);
  assert.match(j.pourquoi, /3000-4999 were refused by the node/);
});
await cas('B3 la fenetre servie a la passe suivante : la VRAIE naissance, des soldes justes, ecrite sur le volume', async () => {
  const m = monter(rpcChaine({ refuse: chevauche(3000, 4999) }));
  await m.passe();
  m.rpc.refuse = () => false;
  const e = await m.passe();
  assert.equal(e.naissance, 3500, 'naissance gardee : ' + e.naissance + ' -- la vraie (3500) n a jamais ete recherchee');
  assert.equal(e.rechercheNaissance, null, 'l etat NON_LUE survit a une naissance lue');
  assert.equal(e.jusqua, FIN); assert.equal(e.ratees, 0);
  assert.equal(e.soldes.get(A), 750n, 'A = 1000 - 300 + 50'); assert.equal(e.soldes.get(B), 300n);
  assert.equal(m.ecritures, 1);
  const f = m.dansLeFichier(JETON);
  assert.ok(f, 'la passe propre n a pas ete ecrite');
  assert.equal(f[1].naissance, 3500); assert.equal(f[1].jusqua, FIN);
  const j = await m.route();
  assert.equal(j.naissance, 3500);
  assert.ok(j.etat !== 'NON_LU' && j.etat !== 'INCOMPLET', 'etat rendu : ' + j.etat + ' — ' + j.pourquoi);
});
await cas('B4 ABSENTE est nommee : aucun mint lu jusqu a la tete, ce n est ni « pas lu » ni « un rejeu tourne »', async () => {
  const m = monter(rpcChaine({ logs: [] }));
  const e = await m.passe();
  assert.equal(e.naissance, null);
  const j = await m.route();
  assert.equal(j.etat, 'NON_LU');
  assert.match(j.pourquoi, /no mint found for this token up to block 9999/, 'raison rendue : ' + j.pourquoi);
  assert.ok(!('naissanceNonLue' in j), 'un etat ABSENT ne doit pas se dire « non lu »');
  assert.equal(e.rechercheNaissance && e.rechercheNaissance.etat, 'ABSENTE', 'l etat ABSENTE n est pas garde dans l entree');
});
await cas('B5 TEMOIN : le refus du REJEU garde son traitement d avant (compte, curseur immobile, rien d ecrit)', async () => {
  const m = monter(rpcChaine({ refuse: (de, a, mintSeul) => !mintSeul && de <= 6999 && a >= 5000 }));
  const e = await m.passe();
  assert.equal(e.naissance, 3500, 'la naissance, elle, est lue');
  assert.ok(e.ratees > 0); assert.equal(e.jusqua, null); assert.equal(m.ecritures, 0);
  const j = await m.route();
  assert.equal(j.etat, 'NON_LU');
  assert.match(j.pourquoi, /a replay is running but \d+ window\(s\) were refused by the node/, 'raison rendue : ' + j.pourquoi);
});
await cas('B6 la passe propre d un AUTRE jeton reecrit le fichier : le jeton a naissance non lue n y entre pas', async () => {
  const logs = [...LOGS, log(2000, ADRESSE_ZERO, A, 7n, JETON2)];
  const m = monter(rpcChaine({ logs, refuse: (de, a, mintSeul, adr) => adr === JETON && de <= 4999 && a >= 3000 }));
  await m.passe(JETON);
  const e2 = await m.passe(JETON2);
  assert.equal(e2.naissance, 2000); assert.equal(e2.jusqua, FIN);
  assert.ok(m.dansLeFichier(JETON2), 'le jeton propre n a pas ete ecrit');
  const f = m.dansLeFichier(JETON);
  assert.equal(f, null, 'holders-cache.json porte le jeton a naissance non lue, avec naissance ' + (f && f[1].naissance));
});

const ATTENDUS = 13;
if (n !== ATTENDUS) rates.push('compte de cas : ' + n + ' au lieu de ' + ATTENDUS);
if (rates.length) {
  console.error('✗ ' + rates.length + '/' + n + ' cas rouges : ' + rates.map((t) => t.split(' ')[0]).join(', '));
  process.exit(1);
}
console.log('✓ ' + n + ' cas — une fenetre refusee arrete la recherche de naissance ; rien n est saute, rien n est ecrit, et c est nomme');
