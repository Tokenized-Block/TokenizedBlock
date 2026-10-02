/* test-feed-etrangeres-20261002.mjs — LIGNES « born on another launchpad » COMPACTES (fondateur, 2026-10-02 13:39).
 *   Avant : chaque ligne repetait « block N · tx · Buy here — we read every pool of this block and route the
 *   cheapest · Open a market on TB · 0.001 ETH · Open profile ».
 *   Apres : « 🧱 ARMY · born on another launchpad · Buy · Open on TB 0.001 ETH · profile › » ; block et tx
 *   dans le deplie seulement ; l explication UNE fois au-dessus de la liste (#sfLiveRoute), jamais par ligne.
 * ⛔ Chaque verification a son TEMOIN NEGATIF par mutation. Extraction tolerante a \r?\n. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from './notes-du-fil.js';
import { FEE_WALLET } from './frais-creation.js';

let n = 0;
const CAS = [];
const cas = (nom, fn) => CAS.push([nom, fn]);
const HTML = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
function bloc(ancre, src) {
  const d = src.indexOf(ancre); assert.ok(d > 0, 'ancre introuvable : ' + ancre);
  let prof = 0, dansTexte = null;
  for (let i = src.indexOf('{', d); i < src.length; i++) {
    const c = src[i], p = src[i - 1];
    if (dansTexte) { if (c === dansTexte && p !== '\\') dansTexte = null; continue; }
    if (c === '"' || c === "'" || c === '`') { dansTexte = c; continue; }
    if (c === '{') prof++; else if (c === '}') { prof--; if (!prof) return src.slice(d, i + 1); }
  }
  throw new Error('accolades desequilibrees apres ' + ancre);
}
const enTexte = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const actions = (src) => new Function('enTexte', bloc('function actionsEtrangeres(jeton) {', src) + '\nreturn actionsEtrangeres;')(enTexte);
const EXPLI = /we read every pool|route the cheapest/gi; /* l entete dit « route your buy to the cheapest » : 1 seule occurrence */

/* ── 1. l explication : au plus UNE fois par liste ──────────────────────────────────────────── */
function verifierExplication(html) {
  /* les commentaires du source qui CITENT l ancienne phrase ne s affichent pas : on compte ce qui s affiche */
  const tout = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').match(EXPLI) || [];
  assert.equal(tout.length, 1, 'l explication du routage apparait ' + tout.length + ' fois dans la page');
  assert.match(html, /<p class="note" id="sfLiveRoute" hidden>We read every pool of these blocks and route your buy to the cheapest\.<\/p>\r?\n\s*<ul class="fil" id="sfLive">/);
  const peindre = bloc('function peindreLive() {', html);
  assert.doesNotMatch(peindre.replace(/\/\*[\s\S]*?\*\//g, ''), EXPLI, 'l explication est encore produite PAR LIGNE');
  assert.match(peindre, /\$\('#sfLiveRoute'\)\.hidden = !lignes\.slice\(0, liveAffiches\)\.some\(estEtrangere\);/, 'l entete ne suit pas les lignes affichees');
  /* une liste de 6 lignes etrangeres : 6 jeux d actions, 0 explication, + 1 entete */
  const liste = Array.from({ length: 6 }, (_, i) => actions(html)('0xb2' + String(i).padStart(38, '0'))).join('');
  assert.equal((liste.match(EXPLI) || []).length, 0);
}
cas('⛔ l explication du routage : une fois, en entete de liste, jamais par ligne', () => verifierExplication(HTML));
cas('TEMOIN NEGATIF : l ancienne phrase par ligne remise dans peindreLive rougit', () => {
  const mut = HTML.replace("    const openHint = foreignCreate ? ''", "    const openHint = foreignCreate ? ' · <span class=\"filOpen\">Buy here — we read every pool of this block and route the cheapest</span>'");
  assert.notEqual(mut, HTML); assert.throws(() => verifierExplication(mut), /fois|PAR LIGNE/);
});
cas('TEMOIN NEGATIF : une infobulle « title » sur Buy (pas de survol sur mobile) rougit aussi', () => {
  const mut = HTML.replace('data-fil-profil="\' + j + \'">Buy</a>', 'data-fil-profil="\' + j + \'" title="we read every pool of this block">Buy</a>');
  assert.notEqual(mut, HTML); assert.throws(() => verifierExplication(mut), /fois/);
});

/* ── 2. la ligne : compacte, insecable, repli AVANT « Buy » ───────────────────────────────── */
function verifierActions(f) {
  const h = f('0xb200000000000000000000000000000000000abc');
  assert.ok(h.startsWith('<span class="filActs" style="white-space:nowrap">'), 'les actions doivent former UN morceau insecable, sans « · » devant (point de repli)');
  assert.match(h, />Buy<\/a> · <button type="button" class="puce" data-tf-act="instant-birth-tb">Open&nbsp;on&nbsp;TB&nbsp;0\.001&nbsp;ETH<\/button> · <a [^>]*data-fil-profil="0xb2[0-9a-f]+">profile&nbsp;›<\/a><\/span>$/);
  assert.doesNotMatch(h, /Open on|TB 0\.001|0\.001 ETH/, '« Open on TB 0.001 ETH » peut se couper');
  assert.doesNotMatch(h, /\bblock\b|\/tx\//, 'block / tx sur la ligne : ils vont dans le deplie');
  assert.ok(!h.toLowerCase().includes(String(FEE_WALLET).slice(2, 8).toLowerCase()));
}
cas('⛔ « Buy · Open on TB 0.001 ETH · profile › » : insecable, les deux actions ensemble, sans block ni tx', () => verifierActions(actions(HTML)));
cas('TEMOIN NEGATIF : des espaces ordinaires dans « Open on TB 0.001 ETH » rougissent', () => {
  const mut = HTML.replace('Open&nbsp;on&nbsp;TB&nbsp;0.001&nbsp;ETH', 'Open on TB 0.001 ETH');
  assert.notEqual(mut, HTML); assert.throws(() => verifierActions(actions(mut)), /couper|Buy/);
});
cas('TEMOIN NEGATIF : sans white-space:nowrap, les actions peuvent se separer — rougit', () => {
  const mut = HTML.replace('<span class="filActs" style="white-space:nowrap">', '<span class="filActs">');
  assert.notEqual(mut, HTML); assert.throws(() => verifierActions(actions(mut)), /point de repli/);
});

/* ── 2b. revue 14:00 : liens lisibles (comme « tx »), et aucun « · » orphelin au point de repli ─ */
function verifierRepli(html) {
  assert.match(html, /\.filS a\{color:var\(--accent2\)\}\r?\n/, 'la couleur des liens du Feed a change');
  assert.match(html, /\.filActs a\{color:var\(--accent2\)\}/, '« Buy » / « profile › » gardent le bleu par defaut du navigateur');
  assert.match(html, /\.filLigne\{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:1\.1em;overflow:hidden\}/, 'le cadre ne coupe pas le separateur de debut de ligne');
  assert.match(html, /\.filLigne>span\{margin-left:-1\.1em;min-width:0\}/);
  assert.match(html, /\.filLigne>span::before\{content:'·';display:inline-block;width:1\.1em;text-align:center\}/);
  const peindre = bloc('function peindreLive() {', html);
  assert.match(peindre, /\(foreignCreate \? '<span class="filLigne"><span>' \+ quoi \+ '<\/span>' \+ actionsEtrangeres\(e\.jeton\) \+ '<\/span>' : quoi\)/, 'le separateur entre titre et actions est un « · » ecrit en dur');
}
cas('⛔ liens « Buy » / « profile › » lavande comme « tx » ; le « · » du point de repli sort du cadre', () => verifierRepli(HTML));
cas('TEMOIN NEGATIF : sans la regle de couleur, la verification rougit', () => {
  const mut = HTML.replace('.filActs a{color:var(--accent2)}', ''); assert.notEqual(mut, HTML);
  assert.throws(() => verifierRepli(mut), /bleu par defaut/);
});
cas('TEMOIN NEGATIF : un « · » ecrit en dur avant les actions (orphelin en fin de ligne) rougit', () => {
  const mut = HTML.replace("'<span class=\"filLigne\"><span>' + quoi + '</span>' + actionsEtrangeres(e.jeton) + '</span>'", "quoi + ' · ' + actionsEtrangeres(e.jeton)"); assert.notEqual(mut, HTML);
  assert.throws(() => verifierRepli(mut), /ecrit en dur/);
});

/* ── 3. la ligne se deplie, et le deplie porte block + tx ─────────────────────────────────── */
function verifierLigne(html) {
  const peindre = bloc('function peindreLive() {', html);
  assert.match(peindre, /const depliable = estDepliable\(e\) \|\| etrangere;/, 'une ligne etrangere ne se deplie pas');
  assert.match(peindre, /\(foreignCreate \? \(trustHint \? '<p class="filS">' \+ trustHint\.replace\(\/\^ · \/, ''\) \+ '<\/p>' : ''\)\r?\n\s*: '<p class="filS">' \+ plage \+ lien/, 'la ligne etrangere affiche encore block · tx');
  assert.match(peindre, /'<\/b> · born on another launchpad'/);
  const f = new Function('liveDeplies', 'ENFANTS_PAS', 'notesLues', 'RESEAUX', 'CHAINE', 'enTexte', 'court', 'lisible', 'ligneEchange',
    'phraseNotes', 'resumeNotes', 'FEE_WALLET', 'libelleNotes', 'AVERT_SPAM', bloc('function enfantsDuFil(e, cleG, nom) {', html) + '\nreturn enfantsDuFil;')(
    new Map(), M.ENFANTS_PAS, new Map(), { 8453: { explorateur: 'https://basescan.org' } }, 8453, enTexte, (a) => a.slice(0, 6) + '…', String, () => '',
    M.phraseNotes, M.resumeNotes, FEE_WALLET, M.libelleNotes, M.AVERT_SPAM);
  const c = { type: 'CREATION', bloc: 52075000, tx: '0x' + 'ab'.repeat(32), jeton: '0xb2', paidCreate: false };
  const h = f({ ...c, n: 1, enfants: [c] }, 'CREATION:0xb2', 'ARMY');
  assert.match(h, /🧱 born on another launchpad<span style="white-space:nowrap"> · block&nbsp;52,075,000 · <a href="https:\/\/basescan\.org\/tx\/0x(ab){32}"/);
  assert.doesNotMatch(h, /transactions? in this row|traded/);
}
cas('⛔ ligne etrangere depliable ; block et tx dans le deplie seulement', () => verifierLigne(HTML));
cas('TEMOIN NEGATIF : une ligne etrangere qui garde « block N · tx » rougit', () => {
  const mut = HTML.replace("(foreignCreate ? (trustHint ? '<p class=\"filS\">' + trustHint.replace(/^ · /, '') + '</p>' : '')", "(false ? ''");
  assert.notEqual(mut, HTML); assert.throws(() => verifierLigne(mut), /block · tx/);
});

for (const [nom, fn] of CAS) { await fn(); n++; }
console.log('ok feed-etrangeres-20261002 — ' + n + ' cas, 7 temoins negatifs par mutation');
console.log('⚠️ NE PROUVE PAS le rendu (repli a 375 px) : voir les captures revue-375-*.png.');
