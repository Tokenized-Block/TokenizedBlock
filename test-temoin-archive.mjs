/* Les deux defauts que ce test tient, tous deux rencontres le 2026-09-30 :
 *   - une serie PLATE lue sur un noeud non-archive, qui se lit « stable » au lieu d « aveugle »
 *   - un chiffre ARRONDI compare a une valeur EXACTE : 295 wei d ecart, verdict inverse
 */
import {
  VERDICTS_ARCHIVE, verdictArchive, serieExploitable, memeChiffreArrondi, phraseArchive,
} from './temoin-archive.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu, (k, v) => (typeof v === 'bigint' ? String(v) : v))));
}

console.log('verdictArchive');
ok('serie vide -> INSUFFISANT', verdictArchive([]).verdict === 'INSUFFISANT');
ok('une seule valeur -> INSUFFISANT', verdictArchive([5n]).verdict === 'INSUFFISANT');
ok('non-tableau -> INSUFFISANT', verdictArchive(null).verdict === 'INSUFFISANT');
/* ⛔ LE DEFAUT N1 : toutes egales sur une adresse qui DOIT bouger. */
ok('toutes egales -> ETAT_COURANT_SEUL', verdictArchive([7n, 7n, 7n, 7n]).verdict === 'ETAT_COURANT_SEUL',
  verdictArchive([7n, 7n, 7n, 7n]));
ok('deux distinctes -> OK', verdictArchive([7n, 8n]).verdict === 'OK');
ok('les trous (null) ne comptent pas', (() => {
  const v = verdictArchive([null, 7n, null, 9n, null]);
  return v.verdict === 'OK' && v.lues === 2 && v.distincts === 2;
})(), verdictArchive([null, 7n, null, 9n, null]));
ok('un seul lu parmi des trous -> INSUFFISANT',
  verdictArchive([null, 7n, null]).verdict === 'INSUFFISANT');
ok('undefined traite comme un trou', verdictArchive([undefined, 7n, 8n]).lues === 2);
ok('les verdicts sont geles', Object.isFrozen(VERDICTS_ARCHIVE));

console.log('serieExploitable');
ok('OK -> exploitable', serieExploitable(verdictArchive([1n, 2n])) === true);
ok('ETAT_COURANT_SEUL -> PAS exploitable', serieExploitable(verdictArchive([1n, 1n])) === false);
ok('INSUFFISANT -> PAS exploitable', serieExploitable(verdictArchive([1n])) === false);
ok('null -> PAS exploitable', serieExploitable(null) === false);

console.log('memeChiffreArrondi');
/* ⛔ LE DEFAUT N2, avec les vraies valeurs du jour. */
const EXACT = 2293009705000000n;   /* 0,002293009705 ETH mesure */
const NOTE = 2293010000000000n;    /* 0,002293010    ETH note, arrondi a 9 decimales */
ok('a 9 decimales, le note EGALE l exact (le vrai cas)',
  memeChiffreArrondi(EXACT, NOTE, 9) === true, { EXACT, NOTE });
ok('a 18 decimales, ils DIFFERENT (295 wei)',
  memeChiffreArrondi(EXACT, NOTE, 18) === false);
ok('identiques -> vrai a toute precision',
  memeChiffreArrondi(EXACT, EXACT, 18) === true);
/* Un ecart franc ne doit PAS etre absorbe par la tolerance. */
ok('un facteur DIX n est pas absorbe', (() => {
  const dix = 230919705000000n;   /* 0,000230919705 ETH */
  return memeChiffreArrondi(EXACT, dix, 9) === false;
})());
ok('0 decimale : deux valeurs sous l unite sont egales',
  memeChiffreArrondi(1n, 2n, 0) === true);
console.log('memeChiffreArrondi — les refus');
ok('non-bigint -> false (jamais vrai par defaut)', memeChiffreArrondi(1, 1, 9) === false);
ok('une seule non-bigint -> false', memeChiffreArrondi(1n, 1, 9) === false);
ok('decimales negatives -> false', memeChiffreArrondi(1n, 1n, -1) === false);
ok('decimales > 18 -> false', memeChiffreArrondi(1n, 1n, 19) === false);
ok('decimales non entieres -> false', memeChiffreArrondi(1n, 1n, 1.5) === false);
ok('parUnite nulle -> false', memeChiffreArrondi(1n, 1n, 9, 0n) === false);
ok('parUnite negative -> false', memeChiffreArrondi(1n, 1n, 9, -1n) === false);

console.log('phraseArchive');
/* ⛔ UN VERDICT NON-OK DOIT PARLER. Un instrument aveugle qui se tait passe pour d accord. */
ok('null PARLE', phraseArchive(null).length > 0, phraseArchive(null));
ok('verdict inconnu PARLE', phraseArchive({ verdict: 'PIZZA' }).length > 0);
ok('INSUFFISANT PARLE et dit le nombre lu', (() => {
  const p = phraseArchive(verdictArchive([1n]));
  return /INCONCLUSIVE/.test(p) && /1/.test(p);
})(), phraseArchive(verdictArchive([1n])));
ok('ECHEC le dit ET dit que la serie est nulle', (() => {
  const p = phraseArchive(verdictArchive([9n, 9n, 9n]));
  return /FAILED/.test(p) && /void/i.test(p) && /CURRENT/.test(p);
})(), phraseArchive(verdictArchive([9n, 9n, 9n])));
ok('OK porte le nombre de valeurs distinctes', (() => {
  const p = phraseArchive(verdictArchive([1n, 2n, 3n]));
  return /OK/.test(p) && /3 distinct/.test(p);
})(), phraseArchive(verdictArchive([1n, 2n, 3n])));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
