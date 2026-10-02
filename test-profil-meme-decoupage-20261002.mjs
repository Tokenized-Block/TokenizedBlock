/* test-profil-meme-decoupage-20261002.mjs — LE PROFIL DIT LE MEME DECOUPAGE QUE LE FEED, AU MEME INSTANT.
 * ⛔ REVUE 2026-10-02 14:00 : Feed « 16 … 10 empty · 6 not checked yet », profil « 15 empty 0-amount transfers »
 *    (le profil lisait TOUTES les notes, a un autre moment, sur une fenetre qui avait grandi).
 *  ⇒ Execute le VRAI code de app.html (peindreMessagesProfil + lireMessagesDuBlock) avec le vrai lireNotes :
 *    le profil lit la meme page que le Feed, son compte reprend les morceaux du titre du Feed, et il se
 *    repeint quand le Feed grandit. TEMOINS NEGATIFS par mutation. Extraction tolerante a \r?\n. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from './notes-du-fil.js';
import { lireMemo } from './messages.js';

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
const morceau = (html) => { const d = html.indexOf('var pmsgLu = null;'); assert.ok(d > 0, 'pmsgLu introuvable');
  const fin = bloc('async function lireMessagesDuBlock() {', html); return html.slice(d, html.indexOf(fin) + fin.length); };

const ADR = '0xb20000000000000000000078ee7ce2fe4908108c';
const tx = (k) => '0x' + String(k).padStart(64, '0');
const vide = '0xa9059cbb' + '0'.repeat(24) + '22'.repeat(20) + '0'.repeat(64); /* transfer(to, 0) sans octet de texte */
const note = (i) => ({ type: 'NOTE', bloc: 52076184 - i * 37, jeton: ADR, sym: 'NVDAc', tx: tx(500 + i), de: '0x3cfc', a: '0x2222' });

function monter(html) {
  const el = { '#profil': { hidden: false, dataset: { block: ADR } }, '#pmsgLire': {}, '#pmsgNote': {}, '#pmsgFil': {}, '#pmsgCompte': {} };
  const liveEvts = Array.from({ length: 16 }, (_, i) => note(i));
  const notesLues = new Map();
  const lus = [];
  let peintFeed = 0;
  const rpc = async (m, [h]) => { lus.push(h); return { input: vide, from: '0x3cfc' }; };
  const api = new Function('$', 'listerTransfers', 'rpc', 'MSG_TX_MAX', 'dormir', 'lireMemo', 'liveEvts', 'lireNotes', 'liveDeplies', 'cleGroupe',
    'ENFANTS_PAS', 'notesLues', 'peindreLive', 'resumeNotes', 'phraseNotes', 'compteProfil', 'symProfil', 'enTexte', 'court', 'RESEAUX', 'CHAINE',
    'let msgEnCours = false, profilEnLecture = false;\n' + morceau(html) + '\nreturn { lire: lireMessagesDuBlock, peindre: peindreMessagesProfil };')(
    (s) => el[s], async () => ({ transfers: [] }), rpc, 30, async () => {}, lireMemo, liveEvts, M.lireNotes, new Map(), M.cleGroupe,
    M.ENFANTS_PAS, notesLues, () => { peintFeed++; }, M.resumeNotes, M.phraseNotes, M.compteProfil, 'NVDAc', String, String, { 8453: { explorateur: 'x' } }, 8453);
  /* le titre du Feed, calcule comme peindreLive le calcule : ligne NOTE = toutes les NOTE du jeton */
  const titreFeed = () => M.libelleNotes(M.resumeNotes(liveEvts.filter((e) => e.type === 'NOTE'), notesLues)).texte;
  return { el, liveEvts, notesLues, lus, api, titreFeed, peints: () => peintFeed };
}
const chiffres = (t, re) => { const m = re.exec(t); return m ? Number(m[1]) : 0; };
async function verifier(html) {
  const T = monter(html);
  await T.api.lire();
  const feed = T.titreFeed(), profil = T.el['#pmsgCompte'].textContent;
  assert.equal(feed, '10 empty transfers (0 amount) · 6 not checked yet');
  assert.equal(profil, 'No messages yet · 10 empty · 6 not checked yet', 'le profil ne reprend pas le decoupage du Feed : ' + profil);
  assert.equal(chiffres(feed, /(\d+) empty/), chiffres(profil, /(\d+) empty/));
  assert.equal(chiffres(feed, /(\d+) not checked/), chiffres(profil, /(\d+) not checked/));
  assert.equal(T.lus.length, M.ENFANTS_PAS, 'le profil a lu ' + T.lus.length + ' transactions, le Feed en lit ' + M.ENFANTS_PAS);
  assert.ok(T.peints() >= 1, 'le Feed n est pas repeint apres la lecture du profil');
  assert.match(T.el['#pmsgNote'].textContent, /16 0-amount transfers counted by the Feed in chain blocks 52,075,629–52,076,184 · 10 empty \(no text attached\) · 6 not checked yet/);
  /* le Feed grandit (nouvelle note au bloc suivant) : au rendu suivant, le profil suit — meme fenetre */
  T.liveEvts.unshift(note(-1));
  T.api.peindre();
  assert.equal(T.el['#pmsgCompte'].textContent, 'No messages yet · 10 empty · 7 not checked yet', 'le profil ne suit pas le Feed qui grandit');
  assert.match(T.el['#pmsgNote'].textContent, /17 0-amount transfers counted by the Feed in chain blocks 52,075,629–52,076,221/);
  assert.equal(T.titreFeed(), '10 empty transfers (0 amount) · 7 not checked yet');
  /* et peindreLive appelle bien ce rendu */
  assert.match(bloc('function peindreLive() {', html), /\n\s*peindreMessagesProfil\(\);/, 'peindreLive ne repeint pas le compte du profil');
}
cas('⛔ Feed et profil : « 10 empty · 6 not checked yet » des deux cotes, meme fenetre, et ensemble quand le Feed grandit', () => verifier(HTML));
cas('TEMOIN NEGATIF : un profil qui relit TOUTES les notes (l ancien code) rougit', async () => {
  const mut = HTML.replace('notes: duFil.slice(0, liveDeplies.get(cleGroupe({ type: \'NOTE\', jeton: adr })) || ENFANTS_PAS)', 'notes: duFil');
  assert.notEqual(mut, HTML); await assert.rejects(() => verifier(mut), /16 empty|decoupage du Feed|a lu 16/);
});
cas('TEMOIN NEGATIF : sans le repeint depuis peindreLive, la verification rougit', async () => {
  const mut = HTML.replace('  peindreMessagesProfil(); /* ⛔ REVUE 14:00', '  /* retire */ /* ⛔ REVUE 14:00');
  assert.notEqual(mut, HTML); await assert.rejects(() => verifier(mut), /ne repeint pas/);
});
cas('TEMOIN NEGATIF : un compte qui range les non-verifies parmi les vides rougit', async () => {
  const mut = HTML.replace('$(\'#pmsgCompte\').textContent = compteProfil(avec.length, rFil);', '$(\'#pmsgCompte\').textContent = \'No messages yet · \' + (rFil.total - rFil.avecTexte) + \' empty 0-amount transfers\';');
  assert.notEqual(mut, HTML); await assert.rejects(() => verifier(mut), /decoupage du Feed/);
});

for (const [nom, fn] of CAS) { await fn(); n++; }
console.log('ok profil-meme-decoupage-20261002 — ' + n + ' cas, code de app.html execute, 3 temoins negatifs par mutation');
