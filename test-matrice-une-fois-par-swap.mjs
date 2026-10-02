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
 *   B. frais routeur > 0 ⇒ sa devise n est pas un block.
 * ⚠️ NE PROUVE PAS : que ces pools existent, ni le montant reel verse par le hook (quoter simule, 1e18
 *   partout). Il garde la DECISION du planificateur sur la forme de la route, combinaison par combinaison. */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const E = await import(pathToFileURL(path.join(ICI, 'echange.js')).href);
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
          const paie = sauts.some(oraclePaie);
          const frais = BigInt((p.resume && p.resume.frais) || 0);
          if (paie && frais !== 0n) ko.push(nom + ' : DOUBLE FRAIS — une jambe paie deja a6cf, routeur ' + frais);
          if (!paie && frais === 0n) ko.push(nom + ' : ZERO FRAIS — aucune jambe ne paie (oracle), routeur 0');
          if (frais > 0n) {
            const dev = bas((p.resume && (p.resume.fraisDevise === 'pair' ? p.resume.devise : p.resume.fraisDevise)) || '');
            if (BLOCS.has(dev)) ko.push(nom + ' : FRAIS EN BLOCK');
          }
        }
      }
    }
  }
}
/* ── BLOCK INTERMEDIAIRE (paires block/B20, voulues par Phil) : X -> block -> Y ──
 * ⛔ Le garde « frais du hook en block » (echange.js) ne regarde que l ENTREE et la SORTIE. Un block au milieu
 *   n y passe pas : c est ici que le court-circuit V8 de hookPaieEnDeviseVendable pourrait compter comme
 *   « payee » une jambe dont le hook verse a6cf EN BLOCK. */
let nMilieu = 0;
const construits = new Set();
/* ⛔ UN REFUS NE FAIT ECHOUER AUCUN INVARIANT : ces routes DOIVENT donner un plan. Le hook V8 y verse a6cf en
 *   ACTION (ACT = currency0 face a blocHaut), et l action est l entree ou la sortie. Le garde « frais en block »
 *   les refusait en prenant toute adresse 0xb2… pour un block (actions comprises). */
const DOIT_PASSER = ['MILIEU ACT>blocHaut>ETH [V8,V8]', 'MILIEU ACT>blocHaut>USDC [V8,V8]', 'MILIEU ETH>blocHaut>ACT [V8,V8]'];
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
        const paie = sauts.some(oraclePaie);
        const frais = BigInt((p.resume && p.resume.frais) || 0);
        if (paie && frais !== 0n) ko.push(nom + ' : DOUBLE FRAIS — routeur ' + frais);
        if (!paie && frais === 0n) ko.push(nom + ' : ZERO FRAIS (ou seul un frais EN BLOCK) — routeur 0');
        if (frais > 0n) {
          const dev = bas((p.resume && (p.resume.fraisDevise === 'pair' ? p.resume.devise : p.resume.fraisDevise)) || '');
          if (BLOCS.has(dev)) ko.push(nom + ' : FRAIS EN BLOCK');
        }
      }
    }
  }
}
console.log('block intermediaire : ' + nMilieu + ' plans construits');
for (const nom of DOIT_PASSER) if (!construits.has(nom)) ko.push(nom + ' : REFUSE alors que le hook paie en action vendable');

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
        const paie = oraclePaie({ cle: c, zeroForOne: zf });
        const frais = BigInt((p.resume && p.resume.frais) || 0);
        if (paie && frais !== 0n) ko.push(nom + ' : DOUBLE FRAIS — routeur ' + frais);
        if (!paie && frais === 0n) ko.push(nom + ' : ZERO FRAIS (ou seul un frais EN BLOCK) — routeur 0');
        if (frais > 0n) {
          const dev = bas((p.resume && (p.resume.fraisDevise === 'pair' ? p.resume.devise : p.resume.fraisDevise)) || '');
          if (BLOCS.has(dev)) ko.push(nom + ' : FRAIS EN BLOCK');
        }
      }
    }
  }
}
console.log('swap simple : ' + nSimple + ' plans construits');
console.log(n + ' combinaisons · ' + nPlans + ' plans · ' + nRefus + ' refus · ' + ko.length + ' violations');
for (const k of ko.slice(0, 40)) console.log('  KO  ' + k);
if (nPlans === 0) { console.log('⛔ aucun plan construit : la matrice ne juge rien'); process.exit(1); }
process.exit(ko.length ? 1 : 0);
