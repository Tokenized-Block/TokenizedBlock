/* test-matrice-une-fois-par-swap.mjs — TOUTES LES COMBINAISONS DE ROUTES A 2 SAUTS, jugees par un ORACLE.
 *
 * Regle de Phil (2026-10-02) : « une fois par swap ». a6cf est paye UNE fois : par un hook qui le verse deja
 * dans une devise VENDABLE, sinon par le routeur. Jamais deux fois, jamais zero, jamais en block.
 *
 * ⛔ L ORACLE N APPELLE PAS hookPaieEnDeviseVendable (la fonction jugee). Il part de la liste mesuree
 *   (hookPaieDejaA6cf) et de la devise mesuree du hook (deviseFraisHook), puis applique UNE regle ecrite ici :
 *   une jambe paie ⟺ son hook est dans la liste pour ce sens ET la devise prelevee n est PAS un block.
 * ⛔ Invariants, sur chaque plan non refuse :
 *   A. frais routeur = 0 ⟺ au moins une jambe paie (selon l oracle)   — ni double frais, ni zero frais ;
 *   B. frais routeur > 0 ⇒ sa devise n est pas un block ;
 *   C. (2026-10-02, Zero 1 : R5a/R5c KO sur la chaine, matrice verte) LES FRAIS DE HOOK COMPTENT AUSSI : chaque jambe
 *      dont le hook verse a6cf (liste mesuree), DANS N IMPORTE QUELLE DEVISE, est un frais. Total routeur + hooks = 1
 *      exactement, et aucun frais de hook en block.
 * ⛔ TEMOIN NEGATIF : la meme matrice tourne sur une COPIE du depot ou les gardes R4 du 2026-10-02 sont retirees
 *   (jeu de jetons [entree, sortie], pas de refus du block intermediaire ni des deux hooks) : elle DOIT y voir R5a/R5c.
 * ⚠️ NE PROUVE PAS : que ces pools existent, ni le montant reel verse par le hook (quoter simule, 1e18
 *   partout). Il garde la DECISION du planificateur sur la forme de la route, combinaison par combinaison.
 *   Non modelise : HOOK_PREVU a l ACHAT preleve du block sur la chaine (hors liste). */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const T = await import(pathToFileURL(path.join(ICI, 'tokenomics.js')).href);
const { USDC_BASE } = await import(pathToFileURL(path.join(ICI, 'frais-creation.js')).href);
const { ACTIONS_COINBASE } = await import(pathToFileURL(path.join(ICI, 'paires.js')).href);

const ETH = '0x' + '0'.repeat(40);
const USDC = USDC_BASE.toLowerCase();
const ACT = ACTIONS_COINBASE[0].adr.toLowerCase(); /* une action reelle du depot */
const BLOC_BAS = '0xb200000000000000000000000000000000000001';  /* trie AVANT l action : block = currency0 */
const BLOC_HAUT = '0xb2ffffffffffffffffffffffffffffffffffff01'; /* trie APRES tout */
const BLOCS = new Set([BLOC_BAS, BLOC_HAUT]);
const INCONNU = '0x' + '1'.repeat(36) + '00cc';
const HOOKS = { sans: ETH, V8: T.HOOK_V8, V2: T.HOOK_V2, PREVU: T.HOOK_PREVU, inconnu: INCONNU };

const q = '0x' + (10n ** 18n).toString(16).padStart(64, '0') + '0'.repeat(64);
const rpc = async (m) => (m === 'eth_call' ? q : m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64));
const compte = '0x' + '4'.repeat(40);
const bas = (a) => String(a).toLowerCase();
const cle = (a, b, hooks) => {
  const [c0, c1] = bas(a) < bas(b) ? [bas(a), bas(b)] : [bas(b), bas(a)];
  return hooks === ETH ? { currency0: c0, currency1: c1, fee: 500, tickSpacing: 10, hooks }
    : { currency0: c0, currency1: c1, fee: 0, tickSpacing: 200, hooks };
};
/* le sens d une jambe, meme convention que le planificateur (zeroForOne -> ACHAT) */
const jambe = (de, vers, hooks) => { const c = cle(de, vers, hooks); return { cle: c, zeroForOne: bas(de) === c.currency0 }; };

/* ⛔ LE SENS EST RELATIF AU BLOCK : ACHAT = le block SORT de cette jambe. La convention « zeroForOne = ACHAT »
 *   n est vraie que si ETH (ou la devise) est currency0 ; avec un block en currency0 elle s inverse. */
function sensJambe(s) {
  const c0 = bas(s.cle.currency0), c1 = bas(s.cle.currency1);
  const blocEn = BLOCS.has(c0) ? c0 : BLOCS.has(c1) ? c1 : null;
  if (!blocEn) return s.zeroForOne ? 'ACHAT' : 'VENTE';
  const sortie = s.zeroForOne ? c1 : c0;
  return sortie === blocEn ? 'ACHAT' : 'VENTE';
}
function oraclePaie(s) {
  const sens = sensJambe(s);
  if (!T.hookPaieDejaA6cf(s.cle.hooks, sens)) return false;
  const d = T.deviseFraisHook(s.cle, sens, s.zeroForOne);
  return !!d && !BLOCS.has(bas(d));
}
/* C : la devise de CHAQUE frais de hook verse a6cf (block compris) — null si la jambe ne verse rien */
function oracleFraisHook(s) {
  const sens = sensJambe(s);
  if (!T.hookPaieDejaA6cf(s.cle.hooks, sens)) return null;
  return T.deviseFraisHook(s.cle, sens, s.zeroForOne) || null;
}
function juger(nom, sauts, p, ko) {
  const frais = BigInt((p.resume && p.resume.frais) || 0);
  const paie = sauts.some(oraclePaie);
  if (paie && frais !== 0n) ko.push(nom + ' : DOUBLE FRAIS — une jambe paie deja a6cf, routeur ' + frais);
  if (!paie && frais === 0n) ko.push(nom + ' : ZERO FRAIS (ou seul un frais EN BLOCK) — routeur 0');
  if (frais > 0n) {
    const dev = bas((p.resume && (p.resume.fraisDevise === 'pair' ? p.resume.devise : p.resume.fraisDevise)) || '');
    if (BLOCS.has(dev)) ko.push(nom + ' : FRAIS EN BLOCK');
  }
  const hooks = sauts.map(oracleFraisHook).filter(Boolean);
  const total = (frais > 0n ? 1 : 0) + hooks.length;
  if (total !== 1) ko.push(nom + ' : ' + total + ' FRAIS au total (routeur ' + frais + ', hooks ' + hooks.length + ')');
  if (hooks.some((d) => BLOCS.has(bas(d)))) ko.push(nom + ' : FRAIS DE HOOK EN BLOCK');
}

async function matrice(E) {
let n = 0, nRefus = 0, nPlans = 0;
const ko = [];
for (const bloc of [BLOC_BAS, BLOC_HAUT]) {
  for (const [mid, fin] of [[USDC, ETH], [ETH, USDC], [ACT, ETH], [ACT, USDC], [USDC, ACT], [ETH, ACT]]) {
    for (const h1 of Object.keys(HOOKS)) {
      for (const h2 of Object.keys(HOOKS)) {
        for (const sensRoute of ['VENTE', 'ACHAT']) {
          const noeuds = sensRoute === 'VENTE' ? [bloc, mid, fin] : [fin, mid, bloc];
          const hs = sensRoute === 'VENTE' ? [h1, h2] : [h2, h1];
          const sauts = [jambe(noeuds[0], noeuds[1], HOOKS[hs[0]]), jambe(noeuds[1], noeuds[2], HOOKS[hs[1]])];
          const nom = noeuds.map((x) => (BLOCS.has(x) ? (x === BLOC_BAS ? 'blocBas' : 'blocHaut') : x === ETH ? 'ETH' : x === USDC ? 'USDC' : 'ACT')).join('>')
            + ' [' + hs.join(',') + ']';
          n += 1;
          let p;
          try {
            p = await E.planEchangeMultiSauts({ rpc, chaine: 8453, compte, sauts, entree: noeuds[0], sortie: noeuds[2],
              montant: 10n ** 21n, decimalesEntree: 18, prixUsdEntree: null, fraisDevisesOk: new Set([ACT]) });
          } catch (e) { ko.push(nom + ' : EXCEPTION ' + e.message); continue; }
          if (p.etat === 'REFUSE') { nRefus += 1; continue; }
          nPlans += 1;
          juger(nom, sauts, p, ko);
        }
      }
    }
  }
}
/* ── BLOCK INTERMEDIAIRE (paires block/B20, voulues par Phil) : X -> block -> Y ──
 * ⛔ 2026-10-02 (fix R4, Zero 1) : un block INTERMEDIAIRE est desormais REFUSE, quelle que soit la combinaison de
 *   hooks — sur la chaine, ces routes payaient 2 a 3 frais, dont un en block (R4a-g, R5a/R5c). Les trois routes
 *   « DOIT_PASSER » d avant (V8,V8 en action) payaient DEUX frais de hook : elles sont refusees elles aussi. */
let nMilieu = 0;
const construits = new Set();
for (const bloc of [BLOC_BAS, BLOC_HAUT]) {
  for (const [a, z] of [[ACT, ETH], [ACT, USDC], [ETH, ACT], [USDC, ACT], [ETH, USDC], [USDC, ETH]]) {
    for (const h1 of Object.keys(HOOKS)) {
      for (const h2 of Object.keys(HOOKS)) {
        const noeuds = [a, bloc, z];
        const sauts = [jambe(a, bloc, HOOKS[h1]), jambe(bloc, z, HOOKS[h2])];
        const nom = 'MILIEU ' + noeuds.map((x) => (BLOCS.has(x) ? (x === BLOC_BAS ? 'blocBas' : 'blocHaut') : x === ETH ? 'ETH' : x === USDC ? 'USDC' : 'ACT')).join('>') + ' [' + h1 + ',' + h2 + ']';
        n += 1;
        let p;
        try {
          p = await E.planEchangeMultiSauts({ rpc, chaine: 8453, compte, sauts, entree: a, sortie: z,
            montant: 10n ** 21n, decimalesEntree: 18, prixUsdEntree: null, fraisDevisesOk: new Set([ACT]) });
        } catch (e) { ko.push(nom + ' : EXCEPTION ' + e.message); continue; }
        if (p.etat === 'REFUSE') { nRefus += 1; continue; }
        nPlans += 1; nMilieu += 1; construits.add(nom);
        juger(nom, sauts, p, ko);
        ko.push(nom + ' : BLOCK INTERMEDIAIRE non refuse');
      }
    }
  }
}
/* ── R5c (Zero 1) : 3 sauts, ETH -> USDC (sans hook) -> block (sans hook) -> action (V8, block = currency0) ── */
for (const [h2, h3] of [['sans', 'V8'], ['sans', 'inconnu'], ['V8', 'V8']]) {
  const noeuds = [ETH, USDC, BLOC_BAS, ACT];
  const sauts = [jambe(ETH, USDC, HOOKS.sans), jambe(USDC, BLOC_BAS, HOOKS[h2]), jambe(BLOC_BAS, ACT, HOOKS[h3])];
  const nom = 'R5c ETH>USDC>blocBas>ACT [sans,' + h2 + ',' + h3 + ']';
  n += 1;
  let p;
  try {
    p = await E.planEchangeMultiSauts({ rpc, chaine: 8453, compte, sauts, entree: ETH, sortie: ACT,
      montant: 10n ** 21n, decimalesEntree: 18, prixUsdEntree: null, fraisDevisesOk: new Set([ACT]) });
  } catch (e) { ko.push(nom + ' : EXCEPTION ' + e.message); continue; }
  if (p.etat === 'REFUSE') { nRefus += 1; continue; }
  nPlans += 1; nMilieu += 1;
  juger(nom, sauts, p, ko);
  ko.push(nom + ' : BLOCK INTERMEDIAIRE non refuse');
}
console.log('block intermediaire : ' + nMilieu + ' plans construits (attendu 0)');

/* ── SWAP SIMPLE (planEchange) : block contre ETH / USDC / action, chaque hook, chaque sens, block bas ou haut ── */
let nSimple = 0;
for (const bloc of [BLOC_BAS, BLOC_HAUT]) {
  for (const autre of [ETH, USDC, ACT]) {
    for (const h of Object.keys(HOOKS)) {
      for (const sens of ['ACHAT', 'VENTE']) {
        const c = cle(bloc, autre, HOOKS[h]);
        const zf = sens === 'ACHAT' ? c.currency0 !== bloc : c.currency0 === bloc;
        const nom = 'SIMPLE ' + sens + ' ' + (bloc === BLOC_BAS ? 'blocBas' : 'blocHaut') + '/' + (autre === ETH ? 'ETH' : autre === USDC ? 'USDC' : 'ACT') + ' [' + h + ']';
        n += 1;
        let p;
        try {
          p = await E.planEchange({ rpc, chaine: 8453, jeton: bloc, compte, sens, montant: 10n ** 15n, fraisDevisesOk: new Set([ACT]),
            marcheLu: { etat: 'LUE', cle: c, paire: autre === ETH ? 'ETH' : autre === USDC ? 'USDC' : 'ACT' } });
        } catch (e) { ko.push(nom + ' : EXCEPTION ' + e.message); continue; }
        if (p.etat === 'REFUSE' || p.etat === 'NON_MESURE') { nRefus += 1; continue; }
        nPlans += 1; nSimple += 1;
        juger(nom, [{ cle: c, zeroForOne: zf }], p, ko);
      }
    }
  }
}
console.log('swap simple : ' + nSimple + ' plans construits');
return { n, nPlans, nRefus, ko };
}

const reel = await matrice(await import(pathToFileURL(path.join(ICI, 'echange.js')).href));
console.log('DEPOT : ' + reel.n + ' combinaisons · ' + reel.nPlans + ' plans · ' + reel.nRefus + ' refus · ' + reel.ko.length + ' violations');
for (const k of reel.ko.slice(0, 40)) console.log('  KO  ' + k);

/* ── TEMOIN NEGATIF : une copie du depot SANS les gardes R4 du 2026-10-02 doit etre rouge, et sur R5a/R5c ── */
const MUTANT = [
  ['echange.js', 'sauts.flatMap((x) => (x && x.cle ? [x.cle.currency0, x.cle.currency1] : []))', '[entree, sortie]'],
  ['echange.js', 'if (blocsRoute.some((b) => !bouts.has(b)))', 'if (false)'],
  ['echange.js', 'if (sauts.filter((x) => x && x.cle && !cleSansHook(x.cle)).length >= 2)', 'if (false)'],
];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-matrice-'));
let mut = null, erreurMutant = null;
try {
  for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) || f === 'package.json') fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
  for (const [f, de, vers] of MUTANT) {
    const p = path.join(dir, f); const src = fs.readFileSync(p, 'utf8');
    if (src.split(de).length - 1 !== 1) throw new Error('motif introuvable dans ' + f + ' : ' + de.slice(0, 50));
    fs.writeFileSync(p, src.replace(de, vers));
  }
  mut = await matrice(await import(pathToFileURL(path.join(dir, 'echange.js')).href));
} catch (e) { erreurMutant = e.message; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
const vuR5a = mut && mut.ko.some((k) => /^MILIEU USDC>blocBas>ACT \[sans,V8\]/.test(k));
const vuR5c = mut && mut.ko.some((k) => /^R5c ETH>USDC>blocBas>ACT \[sans,sans,V8\]/.test(k));
console.log('MUTANT (gardes R4 retirees) : ' + (mut ? mut.nPlans + ' plans · ' + mut.ko.length + ' violations · R5a vu=' + vuR5a + ' · R5c vu=' + vuR5c : 'NON EXECUTE ' + erreurMutant));
for (const k of (mut ? mut.ko : []).filter((x) => /^(MILIEU USDC>blocBas>ACT \[sans,V8\]|R5c ETH>USDC>blocBas>ACT \[sans,sans,V8\])/.test(x))) console.log('  (mutant) ' + k);

let echec = false;
if (reel.nPlans === 0) { console.log('⛔ aucun plan construit : la matrice ne juge rien'); echec = true; }
if (reel.ko.length) echec = true;
if (!mut || !mut.ko.length || !vuR5a || !vuR5c) { console.log('⛔ TEMOIN NEGATIF : la matrice ne voit pas R5a/R5c sans les gardes R4'); echec = true; }
process.exit(echec ? 1 : 0);
