/* OUSD COMME DEVISE DE PAIRE — ce qui est vrai, et ce qui ne l est pas.
 *
 * Ajoute le 2026-09-30. Ce test existe pour deux raisons opposees :
 *   · qu il ne DISPARAISSE pas d une liste ou il a sa place (marche mesure a 10 M$) ;
 *   · qu il ne soit pas TRAITE COMME PLUS QUE CE QU IL EST — son volume est minuscule et sa
 *     pool contre ETH est vide.
 */
import { DEVISES_BASE, qualifierPaire, proposableEnEchange, pairesProposees } from './paires.js';
import { symboleTrompeur } from './symbole-trompeur.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}
const OUSD = DEVISES_BASE.find((d) => d.symbole === 'OUSD');

console.log('OUSD est dans la liste, et bien forme');
ok('present dans DEVISES_BASE', !!OUSD);
/* ⛔ L ADRESSE EST LE SEUL ELEMENT QUI NE SE DEVINE PAS. Copiee de l annonce de l emetteur,
 *   elle est figee ici : une faute d un caractere enverrait les paires vers le vide. */
ok('adresse EXACTE de l emetteur',
  OUSD.adr === '0xB2000000000000000000002fEb517dFeC7415344', OUSD.adr);
ok('elle porte le prefixe 0xB2', OUSD.adr.toLowerCase().startsWith('0xb2'));
ok('type STABLE', OUSD.type === 'STABLE');
ok('declare sur Base seulement', OUSD.chaines.length === 1 && OUSD.chaines[0] === 8453);

console.log('il est utilisable comme paire, SANS exception');
const q = qualifierPaire(OUSD.adr, 8453);
ok('qualifierPaire -> OK', q.etat === 'OK', q);
/* ⛔⛔ LE POINT QUI COMPTE : il est CONNU, donc il ne passe pas par la porte « prouve 0xef ».
 *    C est ce qui le distingue d un ERC-20 quelconque, que la regle « no ERC-20 sprawl » refuse. */
ok('il est VERIFIE, donc pas soumis a la preuve 0xef a chaque saisie',
  q.paire.verifiee === true && !q.paire.besoinB20, q.paire);
ok('il est PROPOSE en echange', proposableEnEchange(OUSD) === true);
ok('il apparait dans les paires proposees sur Base',
  pairesProposees(8453).some((p) => p.symbole === 'OUSD'));

console.log('il ne casse rien de ce qui existait');
/* ⛔ TEMOIN DE NON-REGRESSION : les devises d avant sont toujours la, et toujours proposees. */
for (const s of ['ETH', 'USDC', 'cbBTC', 'TOSHI']) {
  ok(s + ' est toujours propose', pairesProposees(8453).some((p) => p.symbole === s));
}
ok('TBLOCK reste NON propose (decision du 2026-09-24)',
  !pairesProposees(8453).some((p) => p.symbole === 'TBLOCK')
  || proposableEnEchange(DEVISES_BASE.find((d) => d.symbole === 'TBLOCK')) === false);
ok('aucun doublon d adresse dans la liste', (() => {
  const v = DEVISES_BASE.map((d) => d.adr.toLowerCase());
  return new Set(v).size === v.length;
})(), DEVISES_BASE.map((d) => d.adr));
ok('aucun doublon de symbole', (() => {
  const v = DEVISES_BASE.map((d) => d.symbole);
  return new Set(v).size === v.length;
})());

console.log('et la garde anti-sosie le protege desormais');
/* ⛔ En entrant dans DEVISES_BASE, OUSD devient un nom qu on protege : un block qui se
 *   reclamerait « OUSD » sans etre celui-la doit etre marque. C est le meme mecanisme qui
 *   protege deja USDC et TBLOCK. */
const AUTRE = '0xb200000000000000000000945f82034201b39901';
ok('un block qui se dit OUSD est marque TROMPEUR',
  symboleTrompeur('OUSD', AUTRE, DEVISES_BASE).verdict === 'TROMPEUR',
  symboleTrompeur('OUSD', AUTRE, DEVISES_BASE));
ok('le VRAI OUSD n est PAS marque',
  symboleTrompeur('OUSD', OUSD.adr, DEVISES_BASE).verdict === 'LIBRE');

console.log('⚠️ les reserves sont ECRITES, pas seulement sues');
/* ⛔⛔ CE TEST TIENT UN COMMENTAIRE, ET C EST VOLONTAIRE. Les deux reserves ci-dessous sont ce
 *    qui separe « on a ajoute une devise » de « on a ajoute un marche ». Les effacer du fichier
 *    ferait disparaitre la seule trace que le volume est minuscule et que la pool ETH est vide —
 *    et quelqu un router ait un jour ETH -> OUSD dans 289 $ de liquidite. */
import { readFileSync } from 'node:fs';
const src = readFileSync('./paires.js', 'utf8');
ok('le fichier garde la mesure de liquidite OUSD/USDC', /9 999 561/.test(src));
ok('le fichier garde l avertissement sur la pool ETH vide', /OUSD\/ETH[^\n]*289/.test(src));
ok('le fichier dit que le volume est minuscule', /volume est minuscule|VOLUME EST MINUSCULE/i.test(src));
/* ⛔ ET QUE LES « REWARDS » NE SONT PAS UN REVENU : sans cette ligne, quelqu un les compterait. */
ok('le fichier dit que les rewards sont une PISTE, pas un revenu',
  /PISTE de revenu, pas un revenu/i.test(src));
ok('le fichier dit que la parente avec nos blocks N EST PAS verifiee',
  /pas la parente|prouve le FORMAT/i.test(src));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
