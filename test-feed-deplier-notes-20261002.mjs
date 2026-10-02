/* test-feed-deplier-notes-20261002.mjs — UNE LIGNE GROUPEE DU FEED SE DEPLIE, ET SES NOTES SONT CELLES QU ELLE A COMPTEES.
 *
 * ⛔⛔ QA PROD DU 2026-10-02 (11:44) :
 *     · « 📝 NVDAc got 4 notes » (blocs 52,071,384–52,072,345) ouvrait le profil, qui relisait les 30
 *       derniers transferts — une AUTRE source — et disait « 0 messages ».
 *     · « ➡️ GOOGLc sent · 257× » et « 🔴 SPROUT killed · 2 sells » ouvraient le profil : les
 *       transactions comptees n etaient visibles nulle part, `peindreLive` ne gardait qu un compte.
 * ⛔ CE TEST EXECUTE LE CODE LIVRE : le module, et trois morceaux EXTRAITS de app.html (le
 *   regroupement de `peindreLive`, `enfantsDuFil`, le gestionnaire de clic du Feed). Chaque garde a
 *   son TEMOIN NEGATIF par mutation : le code mute DOIT faire rougir la meme verification.
 * ⛔ FINS DE LIGNE : toute ancre d extraction tolere `\r?\n` (checkout Windows).
 * ⚠️ NE PROUVE PAS le rendu reel dans un navigateur : la verification sans tete le fait (captures).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { ENFANTS_PAS, estDepliable, cleGroupe, lireNotes, resumeNotes, phraseNotes, libelleNotes, AVERT_SPAM, compteProfil } from './notes-du-fil.js';
import { lireMemo, encodeTransferAvecMemo } from './messages.js';
import { FEE_WALLET } from './frais-creation.js';

let n = 0;
const CAS = [];
const cas = (nom, fn) => CAS.push([nom, fn]);
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

/* extraction par equilibrage d accolades, a partir d une ancre exacte */
function bloc(depuis, ancre) {
  const d = html.indexOf(ancre);
  assert.ok(d > 0, 'ancre introuvable : ' + ancre);
  let prof = 0, dansTexte = null;
  for (let i = html.indexOf('{', d + depuis); i < html.length; i++) {
    const c = html[i], p = html[i - 1];
    if (dansTexte) { if (c === dansTexte && p !== '\\') dansTexte = null; continue; }
    if (c === '"' || c === "'" || c === '`') { dansTexte = c; continue; }
    if (c === '{') prof++; else if (c === '}') { prof--; if (!prof) return html.slice(d, i + 1); }
  }
  throw new Error('accolades desequilibrees apres ' + ancre);
}
/* tranche entre deux ancres regex (tolerantes a \r?\n) */
function tranche(reDebut, reFin) {
  const a = reDebut.exec(html); assert.ok(a, 'debut introuvable ' + reDebut);
  const g = new RegExp(reFin.source, 'g'); g.lastIndex = a.index;
  const b = g.exec(html); assert.ok(b, 'fin introuvable ' + reFin);
  return html.slice(a.index, b.index);
}

/* ── evenements de laboratoire : la forme exacte que rend fil-live.js ─────────────────────── */
const NVDA = '0xb200000000000000000000000000000000000001', GOOG = '0xb200000000000000000000000000000000000002';
const SPRT = '0xb200000000000000000000000000000000000003';
const tx = (k) => '0x' + String(k).padStart(64, '0');
const montres = [
  { type: 'VENTE', bloc: 52072600, jeton: SPRT, sym: 'SPROUT', tx: tx(1), logIndex: 1, confiance: 'HOOK', quantite: '10', eth: '0.01', devise: 'ETH' },
  { type: 'VENTE', bloc: 52072596, jeton: SPRT, sym: 'SPROUT', tx: tx(2), logIndex: 1, confiance: 'HOOK', quantite: '20', eth: '0.02', devise: 'ETH' },
  { type: 'NOTE', bloc: 52072345, jeton: NVDA, sym: 'NVDAc', tx: tx(10), logIndex: 3, de: '0x1111111111111111111111111111111111111111', a: '0x2222222222222222222222222222222222222222' },
  { type: 'ACHAT', bloc: 52072300, jeton: SPRT, sym: 'SPROUT', tx: tx(3), logIndex: 1, confiance: 'HOOK', quantite: '5', eth: '0.005', devise: 'ETH' },
  { type: 'NOTE', bloc: 52072000, jeton: NVDA, sym: 'NVDAc', tx: tx(11), logIndex: 4, de: '0x3333333333333333333333333333333333333333', a: FEE_WALLET },
  { type: 'NOTE', bloc: 52071500, jeton: NVDA, sym: 'NVDAc', tx: tx(12), logIndex: 5, de: '0x1111111111111111111111111111111111111111', a: '0x2222222222222222222222222222222222222222' },
  { type: 'NOTE', bloc: 52071384, jeton: NVDA, sym: 'NVDAc', tx: tx(13), logIndex: 6, de: '0x1111111111111111111111111111111111111111', a: '0x2222222222222222222222222222222222222222' },
  ...Array.from({ length: 257 }, (_, i) => ({ type: 'GM', bloc: 52071000 - i, jeton: GOOG, sym: 'GOOGLc', tx: tx(1000 + i), logIndex: 0,
    de: '0x4444444444444444444444444444444444444444', a: '0x5555555555555555555555555555555555555555', quantite: null })),
];

/* ── 1. le regroupement REEL de peindreLive garde ses enfants ──────────────────────────────── */
const srcGroupe = tranche(/  const lignes = \[\];\r?\n  const gmParJeton/, /  \/\* keep chronological/);
assert.ok(/enfants/.test(srcGroupe), 'le regroupement extrait ne parle pas d enfants');
const grouper = (src) => new Function('montres', src + '\nreturn lignes;');
function verifierGroupes(lignes) {
  const note = lignes.find((l) => l.type === 'NOTE');
  const gm = lignes.find((l) => l.type === 'GM');
  const ventes = lignes.find((l) => l.type === 'VENTE');
  assert.equal(note.n, 4, 'le Feed doit compter 4 notes');
  assert.equal((note.enfants || []).length, note.n, 'la ligne NOTE ne garde pas les notes qu elle compte');
  assert.equal(Math.min(...note.enfants.map((e) => e.bloc)), note.blocBas, 'plage basse ≠ enfants');
  assert.equal(Math.max(...note.enfants.map((e) => e.bloc)), note.blocHaut, 'plage haute ≠ enfants');
  assert.equal((gm.enfants || []).length, 257, 'GOOGLc 257× ne garde pas ses 257 envois');
  assert.equal(ventes.n, 2); assert.equal((ventes.enfants || []).length, 2, 'SPROUT 2 sells ne garde pas ses 2 ventes');
  return { note, gm, ventes, lignes };
}
let G;
cas('⛔⛔ regroupement : chaque ligne garde EXACTEMENT les evenements qu elle compte', () => { G = verifierGroupes(grouper(srcGroupe)(montres)); });
cas('TEMOIN NEGATIF : sans `g.enfants.push(e)`, la verification rougit', () => {
  const mutant = srcGroupe.replace('g.enfants.push(e);', '');
  assert.notEqual(mutant, srcGroupe, 'mutation sans effet');
  assert.throws(() => verifierGroupes(grouper(mutant)(montres)), /ne garde pas/);
});
cas('depliable : groupes et notes oui, un echange seul non', () => {
  assert.equal(estDepliable(G.note), true); assert.equal(estDepliable(G.gm), true); assert.equal(estDepliable(G.ventes), true);
  const seul = G.lignes.find((l) => l.type === 'ACHAT');
  assert.equal(estDepliable(seul), false, 'un achat seul doit garder « tap to open »');
});
cas('cle stable : une ligne GM/NOTE par jeton, un groupe d echanges par son plus ancien', () => {
  assert.equal(cleGroupe(G.note), 'NOTE:' + NVDA);
  assert.equal(cleGroupe(G.ventes), 'VENTE:' + SPRT + ':' + tx(2) + ':1');
});

/* ── 2. les notes : memes transactions que le compte, et un echec reste dans le total ──────── */
const avecTexte = (txt) => {
  const data = encodeTransferAvecMemo('0x2222222222222222222222222222222222222222', 0n, txt);
  return typeof data === 'string' ? data : data.data;
};
const rpcLabo = async (m, [h]) => {
  assert.equal(m, 'eth_getTransactionByHash');
  if (h === tx(10)) return { input: avecTexte('gm from NVDA'), from: '0x1111111111111111111111111111111111111111' };
  if (h === tx(11)) return { input: '0xa9059cbb' + '0'.repeat(128), from: '0x3333333333333333333333333333333333333333' };
  if (h === tx(12)) throw new Error('HTTP 429');
  return null;
};
let cache;
cas('⛔⛔ 4 notes comptees = 4 notes listees : 1 texte, 1 sans texte, 2 non lues (jamais « 0 »)', async () => {
  cache = await lireNotes({ rpc: rpcLabo, notes: G.note.enfants, lireMemo });
  const r = resumeNotes(G.note.enfants, cache);
  assert.deepEqual(r, { total: 4, avecTexte: 1, sansTexte: 1, illisibles: 0, nonLues: 2, enAttente: 0 });
  assert.equal(cache.get(tx(10)).texte, 'gm from NVDA');
  const phrase = phraseNotes(r, G.note.blocBas, G.note.blocHaut);
  assert.match(phrase, /^4 0-amount transfers counted by the Feed in chain blocks 52,071,384–52,072,345 · 1 note with readable text/);
  assert.match(phrase, /2 could not be read right now — not empty/);
  assert.doesNotMatch(phrase, /\b0 messages?\b/);
});
cas('TEMOIN NEGATIF : un resume qui oublie les non-lues ne dit plus « not empty »', async () => {
  const brut = readFileSync(new URL('./notes-du-fil.js', import.meta.url), 'utf8');
  const mutant = await import('data:text/javascript,' + encodeURIComponent(brut.replace('else r.nonLues++;', 'else r.total--;')));
  const r = mutant.resumeNotes(G.note.enfants, cache);
  assert.notEqual(r.total, 4, 'la mutation n a rien change : test aveugle');
  assert.doesNotMatch(mutant.phraseNotes(r, 1, 2), /not empty/);
});
cas('une note NON_LUE se relit au toucher suivant ; une note lue, jamais deux fois', async () => {
  const vus = [];
  await lireNotes({ rpc: async (m, [h]) => { vus.push(h); return { input: '0x', from: null }; }, notes: G.note.enfants, lireMemo, cache });
  assert.deepEqual(vus.sort(), [tx(12), tx(13)].sort());
});

/* ── 3. enfantsDuFil REEL : plafond, « show more », pas d adresse du wallet de frais ──────── */
const srcEnfants = bloc(0, 'function enfantsDuFil(e, cleG, nom) {');
const fabriquerEnfants = (src, liveDeplies, notesLues) => new Function('liveDeplies', 'ENFANTS_PAS', 'notesLues', 'RESEAUX', 'CHAINE',
  'enTexte', 'court', 'lisible', 'ligneEchange', 'phraseNotes', 'resumeNotes', 'FEE_WALLET', 'libelleNotes', 'AVERT_SPAM', src + '\nreturn enfantsDuFil;')(
  liveDeplies, ENFANTS_PAS, notesLues, { 8453: { explorateur: 'https://basescan.org' } }, 8453,
  (t) => String(t).replace(/</g, '&lt;'), (a) => a.slice(0, 6) + '…' + a.slice(-4), (x) => String(x),
  (e) => (e.type === 'ACHAT' ? 'fed' : 'killed') + ' ' + e.quantite, phraseNotes, resumeNotes, FEE_WALLET, libelleNotes, AVERT_SPAM);
const items = (h) => (h.match(/<li /g) || []).length;
function verifierPlafond(f) {
  const h = f(G.gm, cleGroupe(G.gm), 'GOOGLc');
  assert.equal(items(h), ENFANTS_PAS, 'le plafond n est pas ENFANTS_PAS : ' + items(h));
  assert.match(h, /data-fil-plus="GM:[^"]+">show 10 more · 247 left</);
  assert.equal((h.match(/\/tx\/0x/g) || []).length, ENFANTS_PAS, 'chaque enfant doit porter son lien tx');
  return h;
}
cas('⛔ 257 envois : 10 montres, « show 10 more · 247 left », un lien tx chacun', () => {
  verifierPlafond(fabriquerEnfants(srcEnfants, new Map([[cleGroupe(G.gm), ENFANTS_PAS]]), new Map()));
});
cas('« show more » : 20 apres un clic', () => {
  const h = fabriquerEnfants(srcEnfants, new Map([[cleGroupe(G.gm), 20]]), new Map())(G.gm, cleGroupe(G.gm), 'GOOGLc');
  assert.equal(items(h), 20); assert.match(h, /237 left/);
});
cas('TEMOIN NEGATIF : sans le plafond, la verification rougit', () => {
  const mutant = srcEnfants.replace('e.enfants.slice(0, montres)', 'e.enfants.slice(0)');
  assert.notEqual(mutant, srcEnfants);
  assert.throws(() => verifierPlafond(fabriquerEnfants(mutant, new Map(), new Map())), /plafond/);
});
cas('⛔ notes depliees : texte lisible, expediteur court, lien tx — et jamais le wallet de frais', async () => {
  const frais = await lireNotes({ rpc: rpcLabo, notes: G.note.enfants, lireMemo });
  const h = fabriquerEnfants(srcEnfants, new Map(), frais)(G.note, cleGroupe(G.note), 'NVDAc');
  assert.match(h, /“gm from NVDA”/);
  assert.match(h, /from <span style="white-space:nowrap">0x1111…1111<\/span>/);
  assert.match(h, /empty transfer \(0 amount\)/);
  assert.match(h, /not read right now — not empty/);
  assert.match(h, /4 0-amount transfers counted by the Feed in chain blocks 52,071,384–52,072,345/);
  assert.ok(!h.toLowerCase().includes(FEE_WALLET.slice(0, 6).toLowerCase() + '…'), 'le wallet de frais s affiche abrege');
  assert.ok(!/Fees for Dev/i.test(h));
});
cas('⛔ un envoi VERS le wallet de frais ne l affiche pas, meme abrege (et le temoin le verrait)', () => {
  const ligne = { ...G.gm, enfants: [{ ...G.gm.enfants[0], a: FEE_WALLET }, G.gm.enfants[1]] };
  const h = fabriquerEnfants(srcEnfants, new Map(), new Map())(ligne, cleGroupe(ligne), 'GOOGLc');
  const abrege = FEE_WALLET.slice(0, 6) + '…' + FEE_WALLET.slice(-4);
  assert.ok(!h.includes(abrege), 'le wallet de frais s affiche : ' + abrege);
  assert.match(h, /→ a TB wallet/);
  /* TEMOIN NEGATIF : sans le masque, le meme rendu l afficherait */
  const mutant = srcEnfants.replace("String(a || '').toLowerCase() === String(FEE_WALLET).toLowerCase()", 'false');
  assert.notEqual(mutant, srcEnfants);
  assert.ok(fabriquerEnfants(mutant, new Map(), new Map())(ligne, cleGroupe(ligne), 'GOOGLc').includes(abrege), 'temoin aveugle');
});
cas('les ventes groupees montrent chaque vente avec son montant', () => {
  const h = fabriquerEnfants(srcEnfants, new Map(), new Map())(G.ventes, cleGroupe(G.ventes), 'SPROUT');
  assert.equal(items(h), 2); assert.match(h, /killed 10/); assert.match(h, /killed 20/);
});

/* ── 4. le clic REEL : la ligne groupee se deplie, le profil a son propre lien ─────────────── */
const srcClic = bloc(0, "$('#sfLive').addEventListener('click', (ev) => {").replace(/^\$\('#sfLive'\)\.addEventListener\('click', /, '');
function fabriquerClic(src) {
  const journal = { profil: [], peint: 0, notes: [] };
  const liveDeplies = new Map();
  const h = new Function('garderTrusted', 'peindreLive', 'etape', 'poserIntent', 'allerA', 'eligibleNaissanceV8', '$', 'ouvrirProfil',
    'liveDeplies', 'ENFANTS_PAS', 'lireNotesDuGroupe', 'lancementLien',
    'return ' + src + ';')(() => {}, () => { journal.peint++; }, () => {}, () => {}, () => {}, async () => ({ ok: true }), () => null,
    async (a) => { journal.profil.push(a); }, liveDeplies, ENFANTS_PAS, async (k) => { journal.notes.push(k); }, null);
  return { h, journal, liveDeplies };
}
/* un faux DOM : `closest(sel)` rend l element du role demande, ou null */
const elt = (attrs) => ({ getAttribute: (k) => attrs[k] ?? null, closest: () => null });
const evt = (roles) => ({ preventDefault() {}, stopPropagation() {},
  target: { closest: (sel) => { for (const [motif, el] of roles) if (sel.includes(motif)) return el; return null; } } });
const liGroupe = elt({ 'data-block': NVDA, 'data-groupe': 'NOTE:' + NVDA, 'data-sym': 'NVDAc' });
const liSimple = elt({ 'data-block': SPRT, 'data-sym': 'SPROUT' });
function verifierDeplie(src) {
  const c = fabriquerClic(src);
  c.h(evt([['data-groupe', liGroupe], ['li.filL[data-block]', liGroupe]]));
  assert.deepEqual(c.journal.profil, [], 'toucher une ligne groupee ouvre encore le profil');
  assert.equal(c.liveDeplies.get('NOTE:' + NVDA), ENFANTS_PAS, 'la ligne ne s est pas depliee');
  assert.deepEqual(c.journal.notes, ['NOTE:' + NVDA], 'les notes ne sont pas lues a l ouverture');
  c.h(evt([['data-groupe', liGroupe], ['li.filL[data-block]', liGroupe]]));
  assert.equal(c.liveDeplies.has('NOTE:' + NVDA), false, 'un second toucher ne replie pas');
  return c;
}
cas('⛔⛔ toucher une ligne groupee la DEPLIE (et la replie), sans ouvrir le profil', () => { verifierDeplie(srcClic); });
cas('TEMOIN NEGATIF : sans la branche `data-groupe`, le toucher ouvre le profil (le defaut du 11:44)', () => {
  const mutant = srcClic.replace("const groupe = ev.target.closest('li.filL[data-groupe]');", 'const groupe = null;');
  assert.notEqual(mutant, srcClic);
  assert.throws(() => verifierDeplie(mutant), /ouvre encore le profil/);
});
cas('le petit lien « profile › » ouvre le profil du block', () => {
  const c = fabriquerClic(srcClic);
  c.h(evt([['data-fil-profil', elt({ 'data-fil-profil': NVDA })]]));
  assert.deepEqual(c.journal.profil, [NVDA]);
});
cas('« show more » ajoute ENFANTS_PAS et relit les notes visibles', () => {
  const c = fabriquerClic(srcClic); c.liveDeplies.set('GM:' + GOOG, 10);
  c.h(evt([['data-fil-plus', elt({ 'data-fil-plus': 'GM:' + GOOG })]]));
  assert.equal(c.liveDeplies.get('GM:' + GOOG), 20);
});
cas('un toucher DANS la liste depliee ne replie rien et n ouvre rien', () => {
  const c = fabriquerClic(srcClic); c.liveDeplies.set('NOTE:' + NVDA, 10);
  c.h(evt([['.filEnfants', elt({})], ['data-groupe', liGroupe], ['li.filL[data-block]', liGroupe]]));
  assert.equal(c.liveDeplies.get('NOTE:' + NVDA), 10); assert.deepEqual(c.journal.profil, []);
});
cas('une ligne SEULE ouvre toujours le profil (inchange)', () => {
  const c = fabriquerClic(srcClic);
  c.h(evt([['li.filL[data-block]', liSimple]]));
  assert.deepEqual(c.journal.profil, [SPRT]);
});

/* ── 5. le profil relit les notes du Feed et ne dit plus « 0 messages » quand il en a compte ── */
cas('⛔ le profil lit les notes du Feed, et son compte ne retombe pas a « 0 messages »', () => {
  const src = bloc(0, 'async function lireMessagesDuBlock() {');
  assert.match(src, /liveEvts\.filter\(\(x\) => x\.type === 'NOTE'/, 'le profil ne relit pas les notes du Feed');
  assert.match(src, /lireNotes\(\{ rpc, notes: duFil, lireMemo, cache: notesLues \}\)/);
  assert.match(src, /\$\('#pmsgCompte'\)\.textContent = compteProfil\(avec\.length, rFil\);/, 'le compte du profil ne passe plus par compteProfil');
});

for (const [nom, fn] of CAS) { try { await fn(); n++; } catch (e) { e.message = nom + ' — ' + e.message; throw e; } }
assert.equal(n, 20, 'compte de cas inattendu : ' + n);
console.log('ok feed-deplier-notes — ' + n + ' cas, code livre execute (regroupement, enfantsDuFil, clic), 5 temoins negatifs par mutation');
console.log('⚠️ NE PROUVE PAS le rendu navigateur : voir la verification sans tete (captures).');
