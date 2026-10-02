/* test-feed-revue-20261002.mjs — REVUE DU 2026-10-02 13:32 SUR e468759, TROIS CORRECTIONS :
 *   1. « note » est RESERVE aux entrees qui portent un texte : sinon « N empty transfers (0 amount) »,
 *      l avertissement spam en tete du deplie, et au profil « No messages yet · N empty 0-amount transfers ».
 *   2. un groupe « sent » dit son TOTAL et son nombre de wallets distincts, pas le dernier envoi.
 *   3. mobile : le numero de block ne se repete pas d une entree a la suivante, ne se coupe pas, et
 *      « before this market's fee » n est dit qu UNE fois, dans l entete du groupe.
 * ⛔ Chaque verification a son TEMOIN NEGATIF par mutation (module ou code extrait de app.html). */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as M from './notes-du-fil.js';
import { FEE_WALLET } from './frais-creation.js';

let n = 0;
const CAS = [];
const cas = (nom, fn) => CAS.push([nom, fn]);
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srcModule = readFileSync(new URL('./notes-du-fil.js', import.meta.url), 'utf8');
const dossier = mkdtempSync(join(tmpdir(), 'revue-feed-'));
let kMut = 0;
async function moduleMute(de, vers) {
  const t = srcModule.replace(de, vers);
  assert.notEqual(t, srcModule, 'mutation sans effet : ' + de);
  const f = join(dossier, 'mut' + (kMut++) + '.mjs'); writeFileSync(f, t);
  return import(pathToFileURL(f).href);
}
/* extraction par equilibrage d accolades a partir d une ancre exacte (une ligne : sur \r?\n) */
function bloc(ancre, src = html) {
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
const r = (o) => ({ total: 0, avecTexte: 0, sansTexte: 0, illisibles: 0, nonLues: 0, enAttente: 0, ...o });
const sansMotNote = (t) => !/\bnotes?\b/i.test(t);

/* ── 1. le mot « note » ────────────────────────────────────────────────────────────────────── */
function verifierLibelles(m) {
  const vide = m.libelleNotes(r({ total: 8, sansTexte: 8 }));
  assert.equal(vide.texte, '8 empty transfers (0 amount)');
  assert.equal(vide.notes, false); assert.equal(vide.spam, true);
  const mixte = m.libelleNotes(r({ total: 8, avecTexte: 2, sansTexte: 6 }));
  assert.equal(mixte.texte, 'got 2 notes · 6 empty transfers (0 amount)', 'cas mixte : seules les entrees a texte sont des notes');
  assert.equal(mixte.notes, true); assert.ok(!mixte.spam);
  assert.equal(m.compteProfil(0, r({ total: 8, sansTexte: 8 })), 'No messages yet · 8 empty 0-amount transfers');
  assert.equal(m.compteProfil(2, r({ total: 8, avecTexte: 2, sansTexte: 6 })), '2 messages · 6 empty 0-amount transfers');
  for (const x of [vide.texte, m.compteProfil(0, r({ total: 8, sansTexte: 8 })), m.phraseNotes(r({ total: 8, sansTexte: 8 }), 1, 9)])
    assert.ok(sansMotNote(x), 'le mot « note » nomme des transferts vides : ' + x);
  const attente = m.libelleNotes(r({ total: 3, enAttente: 3 }));
  assert.ok(sansMotNote(attente.texte) && !/empty/.test(attente.texte), 'non lu ne doit se dire ni « note » ni « empty » : ' + attente.texte);
}
cas('⛔ 8 transferts vides : « 8 empty transfers (0 amount) », profil « No messages yet · … », jamais « notes »', () => verifierLibelles(M));
cas('TEMOIN NEGATIF : un libelle qui appelle « notes » tous les transferts rougit', async () => {
  const m = await moduleMute("if (r.avecTexte) bouts.push('got ' + pl(r.avecTexte, 'note', 'notes'));", "bouts.push('got ' + pl(r.total, 'note', 'notes'));");
  assert.throws(() => verifierLibelles(m));
});
cas('TEMOIN NEGATIF : un compte de profil « N notes · none with text » rougit', async () => {
  const m = await moduleMute("nMessages ? pl(nMessages, 'message', 'messages') : 'No messages yet'", "nMessages ? pl(nMessages, 'message', 'messages') : pl(r.total, 'note', 'notes')");
  assert.throws(() => verifierLibelles(m));
});

/* ── 2. le groupe « sent » : total exact et wallets distincts ───────────────────────────────── */
const A = '0x52a8000000000000000000000000000000000001', B = '0x52a8000000000000000000000000000000000002';
const envois = [
  ...Array.from({ length: 31 }, () => ({ type: 'GM', quantite: '6000.000000000000000001', a: A })),
  { type: 'GM', quantite: '5820.19', a: B.toUpperCase().replace('0X', '0x') }, { type: 'GM', quantite: '10000', a: FEE_WALLET },
];
function verifierEnvois(m) {
  const res = m.resumeEnvois(envois);
  assert.deepEqual({ n: res.n, wallets: res.wallets, sansMontant: res.sansMontant }, { n: 33, wallets: 3, sansMontant: 0 });
  assert.equal(res.total, '201820.190000000000000031', 'total inexact : ' + res.total);
  const t = m.titreEnvois(res, (x) => Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 }));
  assert.equal(t, 'sent 33 transfers · 201,820.19 · 3 wallets');
  const partiel = m.titreEnvois(m.resumeEnvois([{ quantite: '1.5', a: A }, { quantite: null, a: A }]), String);
  assert.equal(partiel, 'sent 2 transfers · 1.5 (+1 without a read amount) · 1 wallet');
}
cas('⛔ « sent 33 transfers · {total} · {n} wallets » : total EXACT (texte decimal, pas flottant), wallets distincts', () => verifierEnvois(M));
cas('TEMOIN NEGATIF : compter les destinataires sans dedoublonner rougit', async () => {
  const m = await moduleMute(".map((c) => String((c && c.a) || '').toLowerCase()).filter(Boolean));", ".map((c, i) => i).filter((x) => x >= 0));");
  assert.throws(() => verifierEnvois(m), /wallets|deepEqual|Expected/);
});
cas('TEMOIN NEGATIF : une somme en flottant perd les decimales et rougit', async () => {
  const m = await moduleMute('  return dec ? (s.slice', '  return String(textes.reduce((a, b) => a + Number(b), 0));\n  return dec ? (s.slice');
  assert.throws(() => verifierEnvois(m), /total inexact/);
});
cas('app.html : le titre d un groupe GM passe par titreEnvois(resumeEnvois(e.enfants)), plus « n× · dernier montant → dernier wallet »', () => {
  assert.match(html, /e\.type === 'GM' \? \(e\.n > 1 \? '➡️ <b>' \+ nom \+ '<\/b> ' \+ enTexte\(titreEnvois\(resumeEnvois\(e\.enfants\), lisible\)\)/);
  assert.doesNotMatch(html, /'<\/b> sent' \+ \(e\.n > 1 \? ' · ' \+ e\.n \+ '×'/, 'l ancien titre « sent · n× » est encore la');
  assert.match(html, /e\.type === 'NOTE' \? \(\(\) => \{ const l = libelleNotes\(resumeNotes\(e\.enfants, notesLues\)\);/);
});

/* ── 3. enfants : block non repete, insecable ; frais du marche une seule fois ─────────────── */
const srcEchange = bloc('function ligneEchange(e, nom, sansFrais) {');
const srcEnfants = bloc('function enfantsDuFil(e, cleG, nom) {');
const lisible = (x) => String(x);
const enTexte = (t) => String(t).replace(/</g, '&lt;');
function fabriquer(srcE, srcL) {
  const ligneEchange = new Function('enTexte', 'lisible', srcL + '\nreturn ligneEchange;')(enTexte, lisible);
  return new Function('liveDeplies', 'ENFANTS_PAS', 'notesLues', 'RESEAUX', 'CHAINE', 'enTexte', 'court', 'lisible', 'ligneEchange',
    'phraseNotes', 'resumeNotes', 'FEE_WALLET', 'libelleNotes', 'AVERT_SPAM', srcE + '\nreturn enfantsDuFil;')(
    new Map(), M.ENFANTS_PAS, notesVides, { 8453: { explorateur: 'https://basescan.org' } }, 8453, enTexte, (a) => a.slice(0, 6) + '…' + a.slice(-4),
    lisible, ligneEchange, M.phraseNotes, M.resumeNotes, FEE_WALLET, M.libelleNotes, M.AVERT_SPAM);
}
const tx = (k) => '0x' + String(k).padStart(64, '0');
const ventes = [52072505, 52072505, 52072505, 52072490].map((b, i) => ({ type: 'VENTE', bloc: b, tx: tx(i + 1), quantite: '10', eth: '0.01', devise: 'ETH', fraisMarche: true }));
const groupeVentes = { type: 'VENTE', n: 4, jeton: '0xb2', enfants: ventes };
const notesEnf = [1, 2, 3].map((i) => ({ type: 'NOTE', bloc: 52073000 + i, tx: tx(100 + i), de: '0x3cfc000000000000000000000000000000002b29' }));
const notesVides = new Map(notesEnf.map((c) => [c.tx, { etat: 'AUCUN', texte: null }]));
function verifierEnfants(f) {
  const h = f(groupeVentes, 'VENTE:0xb2', 'SPROUT');
  assert.equal((h.match(/block&nbsp;52,072,505/g) || []).length, 1, 'le block 52,072,505 se repete sur chaque entree');
  assert.equal((h.match(/block&nbsp;52,072,490/g) || []).length, 1);
  assert.doesNotMatch(h, /block 5/, 'espace secable entre « block » et le numero (coupure mobile)');
  assert.equal((h.match(/<span style="white-space:nowrap">/g) || []).length, 4, 'block · tx doit tenir sur une ligne');
  assert.equal((h.match(/before this market's fee/g) || []).length, 1, 'le frais du marche doit etre dit UNE fois');
  assert.match(h.split('<ul')[0], /amounts are before this market's fee/, 'le frais doit etre dans l entete');
  assert.equal((h.match(/\/tx\/0x/g) || []).length, 4, 'chaque entree garde son lien tx');
  const hn = f({ type: 'NOTE', n: 3, jeton: '0xb3', enfants: notesEnf, blocBas: 52073001, blocHaut: 52073003 }, 'NOTE:0xb3', 'NVDAc');
  assert.ok(hn.indexOf(M.AVERT_SPAM) > 0 && hn.indexOf(M.AVERT_SPAM) < hn.indexOf('data-fil-notes-resume'), 'l avertissement spam doit ouvrir le deplie');
  assert.ok(sansMotNote(hn.replace(/data-fil-notes-resume/g, '')), 'le deplie appelle « note » des transferts vides');
  assert.match(hn, /from <span style="white-space:nowrap">0x3cfc…2b29<\/span>/, 'une adresse abregee se coupe apres « … » (mobile)');
}
cas('⛔ ventes depliees : block non repete et insecable, « before this market\'s fee » une fois dans l entete ; notes vides : avertissement en tete', () => verifierEnfants(fabriquer(srcEnfants, srcEchange)));
cas('TEMOIN NEGATIF : sans le dedoublonnage du block, la verification rougit', () => {
  const mut = srcEnfants.replace("(memeBloc ? '' : ' · ' + bloc(c))", "(' · ' + bloc(c))"); assert.notEqual(mut, srcEnfants);
  assert.throws(() => verifierEnfants(fabriquer(mut, srcEchange)), /se repete/);
});
cas('TEMOIN NEGATIF : le frais repete sur chaque entree rougit', () => {
  const mut = srcEnfants.replace('ligneEchange({ ...c, n: 1 }, nom, true)', 'ligneEchange({ ...c, n: 1 }, nom)'); assert.notEqual(mut, srcEnfants);
  assert.throws(() => verifierEnfants(fabriquer(mut, srcEchange)), /UNE fois/);
});
cas('TEMOIN NEGATIF : sans l avertissement spam, la verification rougit', () => {
  const mut = srcEnfants.replace('libelleNotes(rN).spam ?', 'false ?'); assert.notEqual(mut, srcEnfants);
  assert.throws(() => verifierEnfants(fabriquer(mut, srcEchange)), /spam/);
});
cas('TEMOIN NEGATIF : une adresse abregee sans nowrap rougit', () => {
  const mut = srcEnfants.replace(`'<span style="white-space:nowrap">' + enTexte(court(String(a || '?'))) + '</span>'`, `enTexte(court(String(a || '?')))`); assert.notEqual(mut, srcEnfants);
  assert.throws(() => verifierEnfants(fabriquer(mut, srcEchange)), /se coupe/);
});
function verifierPlage(h) {
  assert.match(h, /&& e\.blocBas !== e\.blocHaut\r?\n\s*\? 'blocks '/, 'un groupe dans UN block dit « blocks N–N »');
  assert.match(h, /data-fil-profil="' \+ enTexte\(e\.jeton\) \+ '">profile&nbsp;›<\/a>/, '« profile › » peut se couper');
  const f = new Function('enTexte', 'lisible', srcEchange + '\nreturn ligneEchange;')(enTexte, lisible);
  assert.match(f({ ...ventes[0], n: 1 }, 'SPROUT'), /for 0\.01&nbsp;ETH/, '« 0.01 ETH » peut se couper');
}
cas('⛔ « blocks N–N » devient « block N » ; « profile › » et « 0.01 ETH » insecables', () => verifierPlage(html));
cas('TEMOIN NEGATIF : sans la garde blocBas !== blocHaut, la verification rougit', () => {
  const mut = html.replace(' && e.blocBas !== e.blocHaut\n', '\n').replace(' && e.blocBas !== e.blocHaut\r\n', '\r\n'); assert.notEqual(mut, html);
  assert.throws(() => verifierPlage(mut), /blocks N–N/);
});
cas('une vente seule (hors groupe) dit toujours le frais du marche', () => {
  const f = new Function('enTexte', 'lisible', srcEchange + '\nreturn ligneEchange;')(enTexte, lisible);
  assert.match(f({ ...ventes[0], n: 1 }, 'SPROUT'), /before this market's fee/);
});

for (const [nom, fn] of CAS) { await fn(); n++; }
console.log('ok feed-revue-20261002 — ' + n + ' cas, 9 temoins negatifs par mutation (module et code extrait de app.html)');
console.log('⚠️ NE PROUVE PAS le rendu navigateur : voir les captures 390 px et bureau.');
