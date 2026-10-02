/* test-feed-montants-20261002.mjs — FEED EN DIRECT (fondateur, 2026-10-02 14:12) :
 *   (a) « before this market's fee » sur CHAQUE vente/achat, meme seul : plus jamais par ligne, une fois en tete de section ;
 *   (b) « 4.91e-9 ETH » : jamais de notation scientifique — « < 0.000001 » sous ce seuil ;
 *   (c) « killed · for 0.0023 ETH » : le montant du block, ou « amount not read » — jamais un trou.
 * Code REEL extrait de app.html (lisible, ligneEchange, peindreLive). TEMOIN NEGATIF par mutation. Tolerant a \r?\n. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
const enTexte = (t) => String(t).replace(/</g, '&lt;');
const fab = (html) => {
  const lisible = new Function(bloc('function lisible(texte) {', html) + '\nreturn lisible;')();
  const ligneEchange = new Function('enTexte', 'lisible', bloc('function ligneEchange(e, nom) {', html) + '\nreturn ligneEchange;')(enTexte, lisible);
  return { lisible, ligneEchange };
};
const SCI = /\d(\.\d+)?e[-+]?\d/i;

/* (b) ─────────────────────────────────────────────────────────────────────────────────────── */
const VALEURS = ['4.91e-9', '0.00000000491', '0.0000004', '0.000001', '0.0000495', '0.00232', '0.5', '1', '22146.665951691321294165', '1e21', '0'];
function verifierNotation({ lisible }) {
  for (const v of VALEURS) assert.doesNotMatch(lisible(v), SCI, 'notation scientifique : lisible(' + v + ') = ' + lisible(v));
  assert.equal(lisible('4.91e-9'), '< 0.000001');
  assert.equal(lisible('0.0000004'), '< 0.000001');
  assert.equal(lisible('0.0000495'), '0.0000495');
  assert.equal(lisible('0.00232'), '0.00232');
  assert.equal(lisible('22146.665951691321294165'), '22,146.67');
}
cas('⛔ jamais de « e-9 » : « < 0.000001 » sous le seuil, decimal au-dessus', () => verifierNotation(fab(HTML)));
cas('TEMOIN NEGATIF : l ancien lisible (toPrecision -> String) rougit', () => {
  const mut = HTML.replace("  if (x !== 0 && Math.abs(x) < 0.000001) return '< 0.000001';\n", '').replace("  if (x !== 0 && Math.abs(x) < 0.000001) return '< 0.000001';\r\n", '')
    .replace("return x.toLocaleString('en-US', { maximumSignificantDigits: 3 });", 'return String(Number(x.toPrecision(3)));');
  assert.notEqual(mut, HTML); assert.throws(() => verifierNotation(fab(mut)), /notation scientifique/);
});

/* (a) + (c) ───────────────────────────────────────────────────────────────────────────────── */
const vente = { type: 'VENTE', n: 1, fraisMarche: true, quantite: '1433763.74', eth: '0.00232', devise: 'ETH' };
function verifierLignes({ ligneEchange }) {
  const lignes = [ligneEchange(vente, 'Fastlane'), ligneEchange({ ...vente, type: 'ACHAT' }, 'Fastlane'),
    ligneEchange({ ...vente, quantite: null }, 'Fastlane'), ligneEchange({ ...vente, eth: '4.91e-9' }, 'Fastlane'),
    ligneEchange({ ...vente, quantite: null, eth: null }, 'Fastlane')];
  for (const l of lignes) {
    assert.doesNotMatch(l, /fee/i, 'phrase de frais PAR LIGNE : ' + l);
    assert.doesNotMatch(l, /killed · for|fed · for|·\s+·|·\s*$/, 'un trou a la place du montant : ' + l);
    assert.doesNotMatch(l, SCI, 'notation scientifique : ' + l);
  }
  assert.equal(lignes[0], '🔴 <b>Fastlane</b> killed · 1,433,763.74 sold for 0.00232&nbsp;ETH');
  assert.equal(lignes[2], '🔴 <b>Fastlane</b> killed · amount not read · for 0.00232&nbsp;ETH');
  assert.equal(lignes[3], '🔴 <b>Fastlane</b> killed · 1,433,763.74 sold for &lt; 0.000001&nbsp;ETH');
  assert.equal(lignes[4], '🔴 <b>Fastlane</b> killed · amount not read');
}
cas('⛔ vente/achat seuls : aucun « before this market\'s fee », le montant ou « amount not read »', () => verifierLignes(fab(HTML)));
cas('TEMOIN NEGATIF : la phrase de frais remise par ligne rougit', () => {
  const mut = HTML.replace("  return tete + ' · ' + qte + prix;", "  return tete + ' · ' + qte + prix + (e.fraisMarche ? ' · before this market\\'s fee' : '');");
  assert.notEqual(mut, HTML); assert.throws(() => verifierLignes(fab(mut)), /PAR LIGNE/);
});
cas('TEMOIN NEGATIF : sans « amount not read », le trou revient et rougit', () => {
  const mut = HTML.replace(": 'amount not read';\n", ": '';\n").replace(": 'amount not read';\r\n", ": '';\r\n");
  assert.notEqual(mut, HTML); assert.throws(() => verifierLignes(fab(mut)), /trou/);
});

/* (a) l en-tete de section : une fois, et seulement s il y a un montant d avant-frais a l ecran ─── */
function verifierEntete(html) {
  const visible = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  const n = (visible.match(/before (this market\\?'s|that) fee/g) || []).length;
  assert.equal(n, 1, 'la phrase de frais apparait ' + n + ' fois dans la page (attendu : 1, en tete de section)');
  assert.match(visible, /<p class="note" id="sfLiveFrais" hidden>On markets with their own fee, buy and sell amounts are shown before that fee\.<\/p>/);
  assert.match(bloc('function peindreLive() {', html), /\$\('#sfLiveFrais'\)\.hidden = !lignes\.slice\(0, liveAffiches\)\.some\(\(l\) => \(l\.enfants \|\| \[l\]\)\.some\(\(c\) => c\.fraisMarche && \(c\.quantite \|\| c\.eth\)\)\);/, 'l en-tete ne suit pas les lignes affichees');
}
cas('⛔ « before that fee » : UNE fois, en tete de section, visible seulement si une ligne le concerne', () => verifierEntete(HTML));
cas('TEMOIN NEGATIF : la phrase remise dans le deplie d un groupe rougit', () => {
  const mut = HTML.replace("in this row, newest first</p>';", "in this row, newest first · amounts are before this market\\'s fee</p>';");
  assert.notEqual(mut, HTML); assert.throws(() => verifierEntete(mut), /fois dans la page/);
});

for (const [, fn] of CAS) { await fn(); n++; }
console.log('ok feed-montants-20261002 — ' + n + ' cas, 4 temoins negatifs par mutation');
