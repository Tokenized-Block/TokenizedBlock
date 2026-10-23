/* test-slots-ev-20261023.mjs — L ESPERANCE DE LA MACHINE A SOUS EST EXACTE, ET C EST LA MEME DES DEUX COTES.
 * AFFIRME : (1) la distribution des points calculee ICI depuis les listes de l app (slots-plan.js distributionExacte : bandeTeinte sur
 *   les 65 536 valeurs de 2 octets, % 10 / 19 / 9 / 8 sur un octet) = la constante de contracts/src/BlockSlots.sol distribution(), case par
 *   case ; elle somme a 2^144 ; 14 points a une probabilite nulle ; (2) une ENUMERATION directe, sans la formule (les 6^3 x 10^3 x ... par
 *   trait, comptees triplet par triplet), rend la meme loi par trait ; (3) l esperance de la table de contracts/slots-parametres.json =
 *   127 862 brut (0,127862 USDC ; v2 2026-10-23, table plafonnee a 5 USDC) = celle que forge lit sur le contrat (test_EsperanceDeLaTable)
 *   = esperanceBrut de la fiche ; la loi par face ne change pas avec trois blocs (chaque face reste lue dans une graine keccak distincte) ; elle est
 *   STRICTEMENT sous la part du pot (0,25) ; (4) refusTable a le MEME bord que le constructeur (lim admis, lim + 1 refuse) ; (5) un
 *   ECHANTILLON de 6 000 spins (faces calculees comme le contrat, hashes au hasard) tombe dans 5 ecarts-types de la loi exacte pour 0..4
 *   points ; (6) MUTANTS (copies a cote de la source, effacees) : une paire comptee 2, une facette modulo 18 -> l egalite au contrat ROUGIT.
 * Hypothese DITE : les octets d un keccak sont uniformes et independants (modele de tout tirage sur hash). NE PROUVE PAS Base. */
import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as S from './slots-plan.js';
import { SLOTS_DEPLOIEMENT as D } from './slots-deploiement.js';
import { bandeTeinte, BANDES } from './face-du-jour.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const sol = readFileSync(new URL('./contracts/src/BlockSlots.sol', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const P = JSON.parse(readFileSync(new URL('./contracts/slots-parametres.json', import.meta.url), 'utf8'));

/* (1) */
const corps = (/function distribution\(\)[\s\S]*?d = \[([\s\S]*?)\];/.exec(sol) || [])[1] || '';
/* le premier element porte le type (« uint256(…) ») : on retire le type avant de lire les nombres */
const duContrat = [...corps.replace(/uint256\(/g, '(').matchAll(/(\d+)/g)].map((m) => BigInt(m[1]));
vu(duContrat.length === 16, 'la constante du contrat a 16 cases (' + duContrat.length + ')');
const { num, den } = S.distributionExacte();
vu(den === 1n << 144n && /DIST_DENOM = 1 << 144;/.test(sol), 'denominateur 2^144 des deux cotes');
vu(num.every((v, k) => v === duContrat[k]), 'distribution app = distribution() du contrat, case par case');
vu(num.reduce((s, v) => s + v, 0n) === den, 'la loi somme a 1 exactement');
vu(num[14] === 0n && num[15] > 0n && num[13] > 0n, '14 points impossible (4 brelans + 1 paire = 13, 5 brelans = 15)');

/* (2) enumeration directe par trait, triplet par triplet (pas la formule c^3 / 3c^2(D-c)) */
const loiParTrait = (vals) => { /* vals = la valeur du trait pour chaque octet possible (ou couple d octets) */
  const c = new Map(); for (const v of vals) c.set(v, (c.get(v) || 0n) + 1n);
  const cles = [...c.keys()]; let trois = 0n, paire = 0n, rien = 0n;
  for (const x of cles) for (const y of cles) for (const z of cles) {
    const w = c.get(x) * c.get(y) * c.get(z);
    if (x === y && y === z) trois += w; else if (x === y || y === z || x === z) paire += w; else rien += w;
  }
  return [rien, paire, trois];
};
const bandes = Array.from({ length: 65536 }, (_, x) => BANDES.indexOf(bandeTeinte(x % 361)));
const parOctet = (m) => Array.from({ length: 256 }, (_, b) => b % m);
let conv = [1n];
for (const [r, p, t] of [loiParTrait(bandes), ...S.TAILLES.slice(1).map((m) => loiParTrait(parOctet(m)))]) {
  const s = new Array(conv.length + 3).fill(0n); conv.forEach((v, i) => { s[i] += v * r; s[i + 1] += v * p; s[i + 3] += v * t; }); conv = s;
}
vu(conv.slice(0, 16).every((v, k) => v === num[k]), 'enumeration triplet par triplet = la formule, pour les 16 cases');

/* (3) */
const ev = S.esperance(P.prizes);
vu(ev.brut === 127862n && ev.probGainBps === 2105, 'esperance de la table : 127 862 brut (0,127862 USDC), 21,05 % des spins paient quelque chose');
vu(/assertEq\(bs\.expectedPayout\(\), 127_862\);/.test(readFileSync(new URL('./contracts/test/BlockSlots.t.sol', import.meta.url), 'utf8')), 'forge lit la meme esperance sur le contrat compile (test_EsperanceDeLaTable)');
vu(D.esperanceBrut === '127862' && D.probGainBps === 2105 && JSON.stringify(D.constructeur.prizes) === JSON.stringify(P.prizes), 'la fiche porte la table des parametres et la meme esperance');
vu(ev.num * 10000n < BigInt(P.spinPrice) * BigInt(P.potShareBps) * den, 'esperance STRICTEMENT sous la part du pot (0,25 USDC) : le pot grossit en moyenne');
vu(S.refusTable({ table: P.prizes, spinPrice: P.spinPrice, potShareBps: P.potShareBps }).length === 0, 'la table des parametres est admise');

/* (4) le bord exact : table « x pour >= 3 points » */
const s3 = num.slice(3).reduce((s, v) => s + v, 0n);
const r = BigInt(P.spinPrice) * BigInt(P.potShareBps) * den;
const lim = (r - 1n) / (s3 * 10000n);
const t = (x) => Array.from({ length: 16 }, (_, k) => (k >= 3 ? x : 0n));
vu(S.refusTable({ table: t(lim), spinPrice: P.spinPrice, potShareBps: P.potShareBps }).length === 0, 'bord : lim (' + lim + ') admis');
vu(S.refusTable({ table: t(lim + 1n), spinPrice: P.spinPrice, potShareBps: P.potShareBps }).length === 1, 'bord : lim + 1 refuse (meme bord que le constructeur, test_EsperanceAuBordExact)');
vu(S.refusTable({ table: P.prizes.map((x, k) => (k === 4 ? '200000' : x)), spinPrice: P.spinPrice, potShareBps: P.potShareBps }).length > 0, 'table non croissante refusee');
vu(S.refusTable({ table: P.prizes, spinPrice: 0, potShareBps: P.potShareBps }).length > 0 && S.refusTable({ table: P.prizes, spinPrice: P.spinPrice, potShareBps: 10001 }).length > 0, 'prix nul / part > 100 % refuses');

/* (5) echantillon : 6 000 spins, hashes au hasard, faces calculees comme le contrat */
const N = 6000, compte = new Array(16).fill(0);
for (let i = 0; i < N; i++) { const hs = [0, 1, 2].map(() => '0x' + randomBytes(32).toString('hex')); compte[S.points(S.facesDuSpin(hs, i + 1))] += 1; }
for (let k = 0; k <= 4; k++) {
  const p = Number((num[k] * 1000000n) / den) / 1e6, sigma = Math.sqrt(N * p * (1 - p));
  vu(Math.abs(compte[k] - N * p) < 5 * sigma, k + ' point(s) : ' + compte[k] + ' observes, ' + (N * p).toFixed(0) + ' attendus (5 sigma = ' + (5 * sigma).toFixed(0) + ')');
}
vu(compte[14] === 0, 'aucun spin a 14 points dans l echantillon');

/* (6) mutants sur une COPIE de slots-plan.js, a cote de la source (memes imports relatifs), effacee apres */
const src = readFileSync(new URL('./slots-plan.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const muter = async (nom, de, vers) => {
  vu(src.split(de).length === 2, 'mutant ' + nom + ' : ancre unique');
  const url = new URL('./slots-plan.mutant-' + process.pid + '-' + n + '.js', import.meta.url);
  writeFileSync(url, src.replace(de, () => vers));
  try { const M = await import(url.href); const d = M.distributionExacte().num; vu(!d.every((v, k) => v === duContrat[k]), 'MUTANT ' + nom + ' : « distribution app = contrat » ROUGIT'); }
  finally { try { unlinkSync(url); } catch (_) {} }
};
await muter('paire comptee 2', 'suite[i + 1] += v * paire;', 'suite[i + 2] += v * paire;');
await muter('facette modulo 18', "const traits = [[bandes, 65536n], ...TAILLES.slice(1).map((m) => [parOctet(m), 256n])];", "const traits = [[bandes, 65536n], ...TAILLES.slice(1).map((m) => [parOctet(m === 19 ? 18 : m), 256n])];");
console.log('ok slots-ev - ' + n + ' assertions ; hypothese : octets de keccak uniformes ; NE PROUVE PAS Base');
