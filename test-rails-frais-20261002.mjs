// test-rails-frais-20261002.mjs — les 4 fuites du 2026-10-02, chacune avec son controle negatif.
// ⛔ 2026-10-02 (fix-2, item 7) : imports `import *` + garde typeof. Sur un arbre plus ancien (f319fc9) un export absent
//   devient une ASSERTION en echec, plus un crash au chargement (« estMarqueTb » manquait et masquait tout le reste).
import { readFileSync } from 'node:fs';
import * as OL from './openlaunch-launch.js';
import * as TK from './tokenomics.js';
import * as LP from './lancer-pool.js';
import * as C3 from './calldata-v3.js';
import * as FC from './frais-creation.js';
import * as PJ from './pools-du-jeton.js';
import * as PA from './paires.js';
let PSH = {};
try { PSH = await import('./pool-sans-hook.js'); } catch (_) { PSH = {}; }
const manquants = [];
const fnOu = (mod, nom) => {
  if (typeof mod[nom] === 'function') return mod[nom];
  manquants.push(nom);
  return () => { throw new Error('missing export: ' + nom); };
};
/* e93e9e2 (regle du fondateur 13:27) : estMarqueTb n existe plus */
const planLaunchOL = fnOu(OL, 'planLaunchOL');
const hookPaieDejaA6cf = fnOu(TK, 'hookPaieDejaA6cf'), estNotreHook = fnOu(TK, 'estNotreHook');
const { HOOK_V8, HOOK_PREVU, HOOK_V2, HOOK_V5 } = TK;
const mintLancementRecevable = fnOu(LP, 'mintLancementRecevable'), simulerSequenceLancement = fnOu(LP, 'simulerSequenceLancement');
const calldataV3ExactIn = fnOu(C3, 'calldataV3ExactIn');
const { FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR, FEE_WALLET } = FC;
const confianceDe = fnOu(PJ, 'confianceDe');
/* dependances de poolDecouvertPour (fix-2) ; absentes sur un arbre ancien, qui ne les appelle pas */
const poolSansHookInterdite = typeof PSH.poolSansHookInterdite === 'function' ? PSH.poolSansHookInterdite : () => false;
const choixBuyHere = typeof PA.choixBuyHere === 'function' ? PA.choixBuyHere : ({ meilleur }) => meilleur;
const v8BlockDevant = typeof PA.v8BlockDevant === 'function' ? PA.v8BlockDevant : () => false;

let n = 0, ko = 0;
const ok = (c, m) => { if (c) n++; else { ko++; console.error('KO  ' + m); } };
/* chaque verification est isolee : une exception = un KO nomme, jamais un arret du fichier */
const essai = async (m, f) => { try { ok(await f(), m); } catch (e) { ko++; console.error('KO  ' + m + ' — ' + String(e && e.message || e).slice(0, 120)); } };
const L = '0x1111111111111111111111111111111111111111';
const SALT = '0x' + '11'.repeat(32);
/* \r?\n : le depot peut etre extrait en CRLF */
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function extraire(nom) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + nom + '\\s*\\(').exec(html);
  if (!m) return 'function ' + nom + '() { throw new Error("fonction absente: ' + nom + '"); }';
  let i = html.indexOf('{', m.index), d = 0, j = i;
  for (; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}') { d--; if (d === 0) break; } }
  return html.slice(m.index, j + 1);
}

/* 1 — REGLE DU FONDATEUR (2026-10-02 13:27) : plus AUCUN refus de « marque » sur la carte OpenLaunch */
const base = { lanceur: L, startTick: 196200, lpFee: 30000, salt: SALT };
for (const [nom, symbole] of [['TokenizedBlock', 'TBLOCK'], ['Tokenized Block', 'XYZ'], ['Gas', 'TBGAS'], ['x', 'TB']]) {
  await essai('plus de refus de marque : ' + nom + '/' + symbole, async () => planLaunchOL({ ...base, nom, symbole }).etat === 'OK');
}
/* controle negatif : la carte refuse toujours ce qui est INVALIDE (la garde n a pas ete arrachee en bloc) */
await essai('symbole invalide toujours refuse', async () => planLaunchOL({ ...base, nom: 'My token', symbole: 'MY-TKN' }).etat === 'REFUSE');
await essai('nom ordinaire accepte', async () => planLaunchOL({ ...base, nom: 'My token', symbole: 'MYTKN' }).etat === 'OK');

/* 2 — un frais par jambe : table mesuree sur fork */
await essai('V8 paie dans les deux sens', async () => hookPaieDejaA6cf(HOOK_V8, 'ACHAT') && hookPaieDejaA6cf(HOOK_V8, 'VENTE'));
await essai('V1/V2 paient a la vente', async () => hookPaieDejaA6cf(HOOK_PREVU, 'VENTE') && hookPaieDejaA6cf(HOOK_V2, 'VENTE'));
/* controles negatifs */
await essai('V1/V2 achat : routeur garde son frais', async () => !hookPaieDejaA6cf(HOOK_PREVU, 'ACHAT') && !hookPaieDejaA6cf(HOOK_V2, 'ACHAT'));
await essai('hook etranger / V5 : non', async () => !hookPaieDejaA6cf(HOOK_V5, 'VENTE') && !hookPaieDejaA6cf('0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc', 'ACHAT'));
await essai('entrees invalides : non', async () => !hookPaieDejaA6cf(HOOK_V8, 'AUTRE') && !hookPaieDejaA6cf(null, 'ACHAT'));
const ech = readFileSync(new URL('./echange.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
await essai('planEchange : bps 0 si le hook paie', async () => /const bps = \(estWalletDeFrais\(compte\) \|\| hookPaie\) \? 0n : FRAIS_INTERFACE_BPS;/.test(ech));
await essai('garde : double frais refuse', async () => /if \(hookPaie\) \{\n\s+if \(bps !== 0n\) return 'double fee/.test(ech));

/* 3 — 0x753d : naissance sans apport recevable ; refus avant paiement */
const tx0 = { to: L, data: '0x01', value: '0x0' };
await essai('sans apport : recevable', async () => mintLancementRecevable({ naissance: true, p: { sansApport: true }, tx: tx0, ethRequis: 0n }));
await essai('avec seed : recevable', async () => mintLancementRecevable({ naissance: true, p: {}, tx: { ...tx0, value: '0x10' }, ethRequis: 16n }));
/* controle negatif : une naissance AVEC apport attendu mais mint a 0 reste refusee */
await essai('mint a 0 sans sansApport : refuse', async () => !mintLancementRecevable({ naissance: true, p: {}, tx: tx0, ethRequis: 0n }));
await essai('pas de plan : refuse', async () => !mintLancementRecevable(null));
const appels = [{ to: L, data: '0x', value: '0x1' }, { to: L, data: '0x', value: '0x0' }];
const rep = (statuts) => async () => [{ calls: statuts.map((s) => ({ status: s })) }];
await essai('sequence acceptee', async () => (await simulerSequenceLancement({ rpc: rep(['0x1', '0x1']), compte: L, appels })).etat === 'ACCEPTE');
await essai('mint qui revert : refuse', async () => (await simulerSequenceLancement({ rpc: rep(['0x1', '0x0']), compte: L, appels })).etat === 'REFUSE');
await essai('reponse incomplete : non mesure', async () => (await simulerSequenceLancement({ rpc: rep(['0x1']), compte: L, appels })).etat === 'NON_MESURE');
await essai('noeud muet : non mesure', async () => (await simulerSequenceLancement({ rpc: async () => { throw new Error('x'); }, compte: L, appels })).etat === 'NON_MESURE');
const sig = extraire('signerEtapeLancement'), ref = extraire('refuserAvantPaiementLancement');
await essai('refus AVANT le wallet', async () => sig.indexOf('refuserAvantPaiementLancement') > 0 && sig.indexOf('refuserAvantPaiementLancement') < sig.indexOf('envoyerDepuisWallet'));
await essai('refus : predicat + sequence, sur inscrire seulement', async () => /simulerSequenceLancement/.test(ref) && /mintLancementRecevable\(pl\)/.test(ref) && /0xbb920fed/.test(ref));
await essai('garde du mint = meme predicat', async () => /if \(naissance && !mintLancementRecevable\(planCourant\)\)/.test(extraire('lancerMarcheBlock')));

/* 3b — v3 : frais sur l ENTREE */
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', BLK = '0xb200000000000000000000fd2f87532b90095211';
const v3 = (fe) => calldataV3ExactIn({ sauts: [{ de: USDC, vers: BLK, fee: 10000 }], recipient: L, amountIn: 5000000n,
  amountOutMinimum: 1n, deadline: 2000000000n, payerIsUser: true, fraisEntree: fe, beneficiaireFrais: fe ? FEE_WALLET : null });
const a = v3(5000n), b = v3(0n);
await essai('v3 : swap sur le net, frais 5000', async () => a.etat === 'PRET' && a.champs.amountIn === '4995000' && a.fraisEntree === '5000');
await essai('v3 : commandes 0x02 0x00, a6cf present', async () => a.data.toLowerCase().includes(FEE_WALLET.slice(2).toLowerCase()) && a.data.includes('0200' + '0'.repeat(60)));
/* controle negatif : sans frais, une seule commande et aucun a6cf */
await essai('v3 sans frais : inchange', async () => b.etat === 'PRET' && !b.data.toLowerCase().includes(FEE_WALLET.slice(2).toLowerCase()) && b.champs.amountIn === '5000000');
await essai('frais sans beneficiaire : refuse', async () => calldataV3ExactIn({ sauts: [{ de: USDC, vers: BLK, fee: 10000 }], recipient: L, amountIn: 5000000n, amountOutMinimum: 1n,
  deadline: 2000000000n, payerIsUser: true, fraisEntree: 5000n }).etat === 'REFUSE');

/* 4 — « Open a market on TB · 0.001 ETH » : createPaid + inscrire = 0,001 exactement */
const valeurCreation = new Function('utiliseCreateRouter', 'FRAIS_OUVERTURE_WEI', 'CREATE_FEE_WEI_FLOOR',
  extraire('valeurCreation') + '\nreturn valeurCreation;')(() => true, FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR);
await essai('createPaid + plancher inscrire = 0,001', async () => BigInt(valeurCreation(null)) + CREATE_FEE_WEI_FLOOR === FRAIS_OUVERTURE_WEI);
await essai('appel IB direct : 0,0007', async () => BigInt(valeurCreation(FRAIS_OUVERTURE_WEI)) === FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR);
await essai('au-dessus du plancher CreateRouter', async () => BigInt(valeurCreation(null)) >= CREATE_FEE_WEI_FLOOR);
/* controle negatif : un total plus grand (dollar > 0,001) n est pas rabote sous ce total */
await essai('total plus grand garde', async () => BigInt(valeurCreation(2000000000000000n)) + CREATE_FEE_WEI_FLOOR === 2000000000000000n);
await essai('prepaye relu a 0,0007', async () => /if \(val < FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR\) return null;/.test(extraire('recupererPrepayeCreateRouter')));

/* 4b — « Buy here » : la route la moins chere doit etre une route praticable (ETH ou notre hook) */
const ETH0 = '0x0000000000000000000000000000000000000000', TOK = '0xb200000000000000000000784d2c42a395452405';
const mk = (c0, fee, hooks) => { const cle = { currency0: c0, currency1: TOK, fee, tickSpacing: 60, hooks }; return { cle, jeton: TOK, confiance: confianceDe(cle) }; };
const pdp = (pools) => new Function('poolsLive', 'estNotreHook', 'confianceDe', 'poolSansHookInterdite', 'choixBuyHere', 'v8BlockDevant', 'HOOK_V8', 'ROUTE_VIA_TBLOCK', 'cleTouchTblock', 'const FRAIS_DYNAMIQUE_V4 = 0x800000;\n'
  + extraire('fraisEstDynamique') + '\n' + extraire('poolDecouvertPour') + '\nreturn poolDecouvertPour;')(new Map(pools.map((p, i) => [String(i), p])), estNotreHook, confianceDe, poolSansHookInterdite, choixBuyHere, v8BlockDevant, HOOK_V8, PSH.ROUTE_VIA_TBLOCK === true, typeof PSH.cleTouchTblock === 'function' ? PSH.cleTouchTblock : () => false);
const sprout = pdp([mk(ETH0, 3000, '0x01f6c61223f89ad07f0d712be4804b66efc380cc'), mk('0x4fc59c42653e052c7ab5c8381f839e2d70504131', 0, '0xc847d9d4db9d70b713e4c0ff19f7119f2ee328c0')])(TOK);
await essai('SPROUT : la pool ETH est choisie, pas la paire mmETH', async () => sprout && sprout.cle.currency0 === ETH0);
/* controle negatif : une pool de NOTRE hook contre une devise ERC-20 reste eligible */
const notre = pdp([mk('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 0, HOOK_V8)])(TOK);
await essai('notre hook sur paire ERC-20 : garde', async () => notre && notre.isTbFeeHook);
await essai('paire etrangere seule : aucune route', async () => pdp([mk('0x4fc59c42653e052c7ab5c8381f839e2d70504131', 0, '0xc847d9d4db9d70b713e4c0ff19f7119f2ee328c0')])(TOK) === null);

if (manquants.length) { ko++; console.error('KO  missing exports: ' + manquants.join(', ')); }
if (ko) { console.error('FAIL rails-frais-20261002 · ' + n + ' ok, ' + ko + ' KO'); process.exit(1); }
console.log('ALL PASS rails-frais-20261002 · ' + n + ' assertions');
