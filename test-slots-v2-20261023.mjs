/* test-slots-v2-20261023.mjs — LES CORRECTIONS DU VERDICT ADVERSE (D1, D2, R2) ET LES DECISIONS DU PROPRIETAIRE (Phil 2026-10-23).
 * AFFIRME :
 *   (a) TROIS BLOCS : la face r vient du hash du bloc cible + r (r = 0, 1, 2), graine_r = keccak256(abi.encode(hash_r, spinId, r)) ;
 *       changer le hash d UN bloc ne change QUE sa face ; le reglement commence a cible + 3 (les trois hashes existent) et finit a
 *       cible + 256 (la fenetre du PREMIER) ; un echantillon de 6 000 spins a trois hashes suit la loi exacte (5 sigma, 0..4 points) ;
 *   (b) PLAFOND 5 USDC : refusTable refuse un prix > 5 USDC ; la table des parametres ne depasse pas 5 USDC ; paieMaintenant = min(prix, pot) ;
 *   (c) ESPERANCE EXACTE de la nouvelle table : numerateur et arrondi epingles, STRICTEMENT sous le prix (et sous la part du pot) ;
 *       = la fiche, = l epingle forge ;
 *   (d) les points cumules restent un compteur on-chain AFFICHE ; la page dit que le gain est PAR SPIN (0..5 USDC) ;
 *   D1 la tuile et la table montrent ce que le pot PEUT payer (min(prix, pot)), plus « up to » le prix brut de la table ;
 *   D2 la page ne dit plus « win something » pour un spin qui perd de l argent : elle donne la part des spins qui paient quelque chose
 *      ET celle qui rend au moins la mise ; la moyenne est dite AVANT le plafond du pot ;
 *   R2 le chemin Settle ne repeint PAS la carte (getLogs, blocs...) avant la signature : une lecture de la tete, puis l envoi ; un recu
 *      sans Settled relit le spin et dit « window closed » si la fenetre est passee.
 * Chaque verification de page est rejouee sur une copie MUTEE en memoire et doit alors rendre faux. NE PROUVE PAS : le rendu, Base. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as S from './slots-plan.js';
import { SLOTS_DEPLOIEMENT as D } from './slots-deploiement.js';
import { keccak256Hex } from './keccak.js';
import { traitsDepuisHash } from './blockrolls-plan.js';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const P = JSON.parse(lire('contracts/slots-parametres.json'));
const H = (s) => keccak256Hex(new TextEncoder().encode(s));
const w = (x) => BigInt(x).toString(16).padStart(64, '0');

/* ---------------------------------------------------------------- (a) trois blocs */
const h0 = H('bloc t'), h1 = H('bloc t+1'), h2 = H('bloc t+2'), h2b = H('autre bloc t+2');
const f = S.facesDuSpin([h0, h1, h2], 7);
vu(Array.isArray(f) && f.length === 3, 'facesDuSpin prend TROIS hashes');
const attendu = [h0, h1, h2].map((h, r) => traitsDepuisHash(keccak256Hex(Uint8Array.from(Buffer.from(h.slice(2) + w(7) + w(r), 'hex')))));
vu(JSON.stringify(f) === JSON.stringify(attendu), 'face r = traitsDepuisHash(keccak256(abi.encode(hash du bloc t + r, id, r)))');
const g = S.facesDuSpin([h0, h1, h2b], 7);
vu(JSON.stringify(g[0]) === JSON.stringify(f[0]) && JSON.stringify(g[1]) === JSON.stringify(f[1]) && JSON.stringify(g[2]) !== JSON.stringify(f[2]), 'changer le hash du bloc t+2 ne change QUE la face 3');
vu(S.facesDuSpin(h0, 7) === null && S.facesDuSpin([h0, h1], 7) === null && S.facesDuSpin([h0, h1, '0x12'], 7) === null, 'un seul hash, deux hashes, ou un hash illisible : null');
vu(JSON.stringify(S.blocsDesFaces(1002)) === JSON.stringify([1002, 1003, 1004]), 'les blocs des faces : cible, cible + 1, cible + 2');
vu(S.etatReglement(1002, 1004).etat === 'TROP_TOT' && S.etatReglement(1002, 1004).blocsAvant === 1 && S.etatReglement(1002, 1002).blocsAvant === 3, 'cible + 2 : trop tot (le hash du 3e bloc n existe pas encore dans un bloc suivant)');
vu(S.etatReglement(1002, 1005).etat === 'REGLABLE' && S.etatReglement(1002, 1005).blocsRestants === 253, 'cible + 3 : reglable, 253 blocs restants');
vu(S.etatReglement(1002, 1258).etat === 'REGLABLE' && S.etatReglement(1002, 1259).etat === 'PERDU', 'fenetre du PREMIER bloc : cible + 256 reglable, cible + 257 perdu');
vu(/three faces from blocks 2, 3 and 4 blocks from now/.test(S.planSpin({ contrat: '0x' + 'cc'.repeat(20), usdc: '0x' + '83'.repeat(20), spinPrice: 500000n }).appels[1].quoi), 'le plan de spin dit les trois blocs');
{
  const { num, den } = S.distributionExacte();
  const N = 6000, c = new Array(16).fill(0);
  for (let i = 0; i < N; i++) { const hs = [0, 1, 2].map(() => '0x' + randomBytes(32).toString('hex')); c[S.points(S.facesDuSpin(hs, i + 1))] += 1; }
  for (let k = 0; k <= 4; k++) {
    const p = Number((num[k] * 1000000n) / den) / 1e6, s = Math.sqrt(N * p * (1 - p));
    vu(Math.abs(c[k] - N * p) < 5 * s, 'trois hashes : ' + k + ' point(s) ' + c[k] + ' observes, ' + (N * p).toFixed(0) + ' attendus (5 sigma ' + (5 * s).toFixed(0) + ')');
  }
}

/* ---------------------------------------------------------------- (b) plafond 5 USDC */
vu(S.PRIX_MAX === 5000000n, 'PRIX_MAX = 5 USDC brut');
vu(P.prizes.every((x) => BigInt(x) <= 5000000n) && BigInt(P.prizes[15]) === 5000000n, 'la table des parametres plafonne a 5 USDC');
vu(S.refusTable({ table: P.prizes.map((x, k) => (k === 15 ? '5000001' : x)), spinPrice: P.spinPrice, potShareBps: P.potShareBps }).some((r) => /0\.\.5 USDC/.test(r)), 'un prix de 5,000001 USDC est refuse');
vu(S.refusTable({ table: P.prizes, spinPrice: P.spinPrice, potShareBps: P.potShareBps }).length === 0, 'la table des parametres est admise');
vu(S.paieMaintenant(5000000n, 1200000n) === 1200000n && S.paieMaintenant(250000n, 9000000n) === 250000n && S.paieMaintenant(5000000n, null) === null, 'paieMaintenant = min(prix, pot) ; pot non lu -> null');

/* ---------------------------------------------------------------- (c) esperance exacte */
const ev = S.esperance(P.prizes, P.spinPrice);
vu(ev.num === 2851431899393758353960392096738004388806656000000n && ev.den === 1n << 144n && ev.brut === 127862n, 'esperance EXACTE : 2851431899393758353960392096738004388806656000000 / 2^144 = 127 862 brut (0,127862 USDC)');
vu(ev.num < BigInt(P.spinPrice) * ev.den, 'esperance STRICTEMENT sous le prix du spin');
vu(ev.num < S.partsDuSpin(P.spinPrice, P.potShareBps).toPot * ev.den, 'et strictement sous ce qui entre au pot (regle du constructeur v3)');
/* v3 (2e verdict) : ARRONDIS au plus proche — 21,0562 % et 7,4689 % (la v2 tronquait en 21,05 / 7,46) */
vu(ev.probGainBps === 2106 && ev.probMiseBps === 747, '21,06 % des spins paient quelque chose, 7,47 % rendent au moins la mise');
vu(D.esperanceBrut === '127862' && JSON.stringify(D.constructeur.prizes) === JSON.stringify(P.prizes), 'la fiche porte la nouvelle table et la meme esperance');
vu(/assertEq\(bs\.expectedPayout\(\), 127_862\);/.test(lire('contracts/test/BlockSlots.t.sol')), 'forge epingle la meme esperance sur le contrat compile');

/* ---------------------------------------------------------------- la page */
const APP = lire('app.html'), DEP = lire('deployer-slots.html');
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const bloc = (t) => entre(t, '/* ══ LES SLOTS (Phil 2026-10-23', '/* ══ EARN (Phil 19:40)');
const sansCom = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
/* v3/v4 : le chemin Settle / Accept (v4 : plus de Refund) ; son COMPORTEMENT (une seule lecture avant le wallet, le recu relu) est execute par test-slots-v3 */
const regler = (t) => entre(bloc(t), "/* SETTLE / ACCEPT (R2", "const r = await envoyerAppels(plan.appels, c);");
const PLAN = lire('slots-plan.js');
const checks = {
  /* D1 */
  tuilePlafonnee: (t) => { const b = sansCom(bloc(t)); return !/'three faces · up to ' \+ usdcTexte\(table\[15\]\)/.test(b) && /jb\('jbSlotsTxt', 'three faces · up to ' \+ usdcTexte\(Slots\.paieMaintenant\(haut, pot\)\)/.test(b); },
  tablePaieMaintenant: (t) => /<th>Pays now<\/th>/.test(t) && /Slots\.paieMaintenant\(BigInt\(j\.prizes\[k\]\), pot\)/.test(sansCom(bloc(t))),
  /* D2 */
  pasDeGainFaux: (t) => !/win something/.test(sansCom(bloc(t))) && /pay back at least the/.test(bloc(t)) && /Slots\.pourcentTexte\(ev\.probMiseBps\)/.test(sansCom(bloc(t))),
  moyenneAvantPlafond: (t) => /while the pot holds less than/.test(bloc(t)),
  /* (d) */
  pointsCompteur: (t) => /a running total kept on chain/.test(bloc(t)) && /prizes are paid per spin/.test(bloc(t)),
  troisBlocs: (t) => /the blocks 2, 3 and 4 blocks later give one face each/.test(bloc(t)) && /Slots\.blocsDesFaces\(t\)/.test(bloc(t)),
  /* R2 */
  settleLeger: (t) => { const r = sansCom(regler(t)); return r.length > 50 && !/peindreSlots\(/.test(r) && !/eth_getLogs|eth_getBlockByNumber|eth_call/.test(r) && /rpc\('eth_blockNumber', \[\]\)/.test(r) && /Slots\.planReglement\(\{ \.\.\.vue, tete \}\)/.test(r); },
  recuSansSettled: (t) => /window closed before your settle was included/.test(PLAN) && /bilan\.map\(\(b\) => Slots\.phraseApres\(b\)\)/.test(bloc(t)),
};
for (const [k, c] of Object.entries(checks)) vu(c(APP) === true, 'app.html : ' + k);
const mutants = [
  ['tuilePlafonnee', "jb('jbSlotsTxt', 'three faces · up to ' + usdcTexte(Slots.paieMaintenant(haut, pot))", "jb('jbSlotsTxt', 'three faces · up to ' + usdcTexte(table[15])"],
  ['tablePaieMaintenant', 'Slots.paieMaintenant(BigInt(j.prizes[k]), pot)', 'BigInt(j.prizes[k])'],
  ['pasDeGainFaux', "pay back at least the", "win something; at least the"],
  ['moyenneAvantPlafond', 'while the pot holds less than', 'whatever the pot holds'],
  ['pointsCompteur', 'prizes are paid per spin', 'points pay a bonus'],
  ['troisBlocs', 'the blocks 2, 3 and 4 blocks later give one face each', 'the block 2 blocks later gives three faces'],
  ['settleLeger', "const tete = parseInt(await rpc('eth_blockNumber', []), 16);\n      const p = Slots.planReglement", "await peindreSlots(true); const tete = parseInt(await rpc('eth_blockNumber', []), 16);\n      const p = Slots.planReglement"],
  ['recuSansSettled', 'bilan.map((b) => Slots.phraseApres(b))', "bilan.map((b) => 'Sent.')"],
];
for (const [k, de, vers] of mutants) {
  const b = bloc(APP);
  vu(b.split(de).length === 2, 'mutant ' + k + ' : motif unique dans le bloc des slots');
  vu(checks[k](APP.replace(b, () => b.replace(de, () => vers))) === false, 'MUTANT ' + k + ' : la verification ROUGIT');
}
/* la page de deploiement : memes corrections */
const depOk = (t) => !/win something/.test(t) && /data-k="pMise"/.test(t) && /pMise: \(ev\.probMiseBps \/ 100\)\.toFixed\(2\)/.test(t) && /capped by the pot/.test(t) && /three different blocks/.test(t) && /paid per spin/.test(t);
vu(depOk(DEP), 'deployer-slots.html : pas de « win something », part qui rend la mise, plafond du pot, trois blocs, gain par spin');
vu(!depOk(DEP.replace('data-k="pMise"', 'data-k="pWin"')), 'MUTANT deployer-slots : la verification ROUGIT');
/* ---------------------------------------------------------------- mutants de slots-plan.js (COPIES a cote de la source, effacees) */
{
  const { writeFileSync, unlinkSync } = await import('node:fs');
  const src = lire('slots-plan.js');
  const muter = async (nom, de, vers, rougit) => {
    vu(src.split(de).length === 2, 'mutant plan ' + nom + ' : ancre unique');
    const url = new URL('./slots-plan.mutant-v2-' + process.pid + '-' + n + '.js', import.meta.url);
    writeFileSync(url, src.replace(de, () => vers));
    try { const M = await import(url.href); vu(rougit(M) === true, 'MUTANT plan ' + nom + ' : la verification ROUGIT'); }
    finally { try { unlinkSync(url); } catch (_) {} }
  };
  await muter('reglable des cible + 1', 'dernier = t + BigInt(REELS - 1);', 'dernier = t;', (M) => M.etatReglement(1002, 1004).etat !== 'TROP_TOT');
  await muter('trois faces sur le seul premier hash', 'const g = hashes.map((h, r) => graine(h, spinId, r));', 'const g = hashes.map((h, r) => graine(hashes[0], spinId, r));',
    (M) => JSON.stringify(M.facesDuSpin([h0, h1, h2b], 7)[2]) === JSON.stringify(M.facesDuSpin([h0, h1, h2], 7)[2]));
  await muter('plafond 1000 USDC', 'export const PRIX_MAX = 5000000n;', 'export const PRIX_MAX = 1000000000n;',
    (M) => M.refusTable({ table: P.prizes.map((x, k) => (k === 15 ? '5000001' : x)), spinPrice: P.spinPrice, potShareBps: P.potShareBps }).length === 0);
  await muter('D2 : rendre la mise = payer quelque chose', '(t[k] > 0n && t[k] >= m ? v : 0n)', '(t[k] > 0n ? v : 0n)', (M) => M.esperance(P.prizes, P.spinPrice).probMiseBps !== 747);
  await muter('D1 : paieMaintenant sans le pot', 'return p < q ? p : q;', 'return p;', (M) => M.paieMaintenant(5000000n, 1200000n) !== 1200000n);
}
console.log('ok slots-v2 - ' + n + ' assertions ; NE PROUVE PAS le rendu ni Base');
