// test-rails-frais-20261002.mjs — les 4 fuites du 2026-10-02, chacune avec son controle negatif.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLaunchOL } from './openlaunch-launch.js';
import { hookPaieDejaA6cf, HOOK_V8, HOOK_PREVU, HOOK_V2, HOOK_V5 } from './tokenomics.js';
import { mintLancementRecevable, simulerSequenceLancement } from './lancer-pool.js';
import { calldataV3ExactIn } from './calldata-v3.js';
import { FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR, FEE_WALLET } from './frais-creation.js';
import { estNotreHook } from './tokenomics.js';
import { confianceDe } from './pools-du-jeton.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const L = '0x1111111111111111111111111111111111111111';
const SALT = '0x' + '11'.repeat(32);
/* \r?\n : le depot peut etre extrait en CRLF */
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function extraire(nom) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + nom + '\\s*\\(').exec(html);
  assert.ok(m, 'fonction absente: ' + nom);
  let i = html.indexOf('{', m.index), d = 0, j = i;
  for (; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}') { d--; if (d === 0) break; } }
  return html.slice(m.index, j + 1);
}

/* 1 — REGLE DU FONDATEUR (2026-10-02 13:27) : plus AUCUN refus de « marque » sur la carte OpenLaunch */
const base = { lanceur: L, startTick: 196200, lpFee: 30000, salt: SALT };
for (const [nom, symbole] of [['TokenizedBlock', 'TBLOCK'], ['Tokenized Block', 'XYZ'], ['Gas', 'TBGAS'], ['x', 'TB']]) {
  const r = planLaunchOL({ ...base, nom, symbole });
  ok(r.etat === 'OK', 'plus de refus de marque : ' + nom + '/' + symbole);
}
/* controle negatif : la carte refuse toujours ce qui est INVALIDE (la garde n a pas ete arrachee en bloc) */
ok(planLaunchOL({ ...base, nom: 'My token', symbole: 'MY-TKN' }).etat === 'REFUSE', 'symbole invalide toujours refuse');
ok(planLaunchOL({ ...base, nom: 'My token', symbole: 'MYTKN' }).etat === 'OK', 'nom ordinaire accepte');

/* 2 — un frais par jambe : table mesuree sur fork */
ok(hookPaieDejaA6cf(HOOK_V8, 'ACHAT') && hookPaieDejaA6cf(HOOK_V8, 'VENTE'), 'V8 paie dans les deux sens');
ok(hookPaieDejaA6cf(HOOK_PREVU, 'VENTE') && hookPaieDejaA6cf(HOOK_V2, 'VENTE'), 'V1/V2 paient a la vente');
/* controles negatifs */
ok(!hookPaieDejaA6cf(HOOK_PREVU, 'ACHAT') && !hookPaieDejaA6cf(HOOK_V2, 'ACHAT'), 'V1/V2 achat : routeur garde son frais');
ok(!hookPaieDejaA6cf(HOOK_V5, 'VENTE') && !hookPaieDejaA6cf('0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc', 'ACHAT'), 'hook etranger / V5 : non');
ok(!hookPaieDejaA6cf(HOOK_V8, 'AUTRE') && !hookPaieDejaA6cf(null, 'ACHAT'), 'entrees invalides : non');
const ech = readFileSync(new URL('./echange.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
ok(/const bps = \(estWalletDeFrais\(compte\) \|\| hookPaie\) \? 0n : FRAIS_INTERFACE_BPS;/.test(ech), 'planEchange : bps 0 si le hook paie');
ok(/if \(hookPaie\) \{\n\s+if \(bps !== 0n\) return 'double fee/.test(ech), 'garde : double frais refuse');

/* 3 — 0x753d : naissance sans apport recevable ; refus avant paiement */
const tx0 = { to: L, data: '0x01', value: '0x0' };
ok(mintLancementRecevable({ naissance: true, p: { sansApport: true }, tx: tx0, ethRequis: 0n }), 'sans apport : recevable');
ok(mintLancementRecevable({ naissance: true, p: {}, tx: { ...tx0, value: '0x10' }, ethRequis: 16n }), 'avec seed : recevable');
/* controle negatif : une naissance AVEC apport attendu mais mint a 0 reste refusee */
ok(!mintLancementRecevable({ naissance: true, p: {}, tx: tx0, ethRequis: 0n }), 'mint a 0 sans sansApport : refuse');
ok(!mintLancementRecevable(null), 'pas de plan : refuse');
const appels = [{ to: L, data: '0x', value: '0x1' }, { to: L, data: '0x', value: '0x0' }];
const rep = (statuts) => async () => [{ calls: statuts.map((s) => ({ status: s })) }];
ok((await simulerSequenceLancement({ rpc: rep(['0x1', '0x1']), compte: L, appels })).etat === 'ACCEPTE', 'sequence acceptee');
ok((await simulerSequenceLancement({ rpc: rep(['0x1', '0x0']), compte: L, appels })).etat === 'REFUSE', 'mint qui revert : refuse');
ok((await simulerSequenceLancement({ rpc: rep(['0x1']), compte: L, appels })).etat === 'NON_MESURE', 'reponse incomplete : non mesure');
ok((await simulerSequenceLancement({ rpc: async () => { throw new Error('x'); }, compte: L, appels })).etat === 'NON_MESURE', 'noeud muet : non mesure');
const sig = extraire('signerEtapeLancement'), ref = extraire('refuserAvantPaiementLancement');
ok(sig.indexOf('refuserAvantPaiementLancement') > 0 && sig.indexOf('refuserAvantPaiementLancement') < sig.indexOf('envoyerDepuisWallet'), 'refus AVANT le wallet');
ok(/simulerSequenceLancement/.test(ref) && /mintLancementRecevable\(pl\)/.test(ref) && /0xbb920fed/.test(ref), 'refus : predicat + sequence, sur inscrire seulement');
ok(/if \(naissance && !mintLancementRecevable\(planCourant\)\)/.test(extraire('lancerMarcheBlock')), 'garde du mint = meme predicat');

/* 3b — v3 : frais sur l ENTREE */
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', BLK = '0xb200000000000000000000fd2f87532b90095211';
const v3 = (fe) => calldataV3ExactIn({ sauts: [{ de: USDC, vers: BLK, fee: 10000 }], recipient: L, amountIn: 5000000n,
  amountOutMinimum: 1n, deadline: 2000000000n, payerIsUser: true, fraisEntree: fe, beneficiaireFrais: fe ? FEE_WALLET : null });
const a = v3(5000n), b = v3(0n);
ok(a.etat === 'PRET' && a.champs.amountIn === '4995000' && a.fraisEntree === '5000', 'v3 : swap sur le net, frais 5000');
ok(a.data.toLowerCase().includes(FEE_WALLET.slice(2).toLowerCase()) && a.data.includes('0200' + '0'.repeat(60)), 'v3 : commandes 0x02 0x00, a6cf present');
/* controle negatif : sans frais, une seule commande et aucun a6cf */
ok(b.etat === 'PRET' && !b.data.toLowerCase().includes(FEE_WALLET.slice(2).toLowerCase()) && b.champs.amountIn === '5000000', 'v3 sans frais : inchange');
ok(calldataV3ExactIn({ sauts: [{ de: USDC, vers: BLK, fee: 10000 }], recipient: L, amountIn: 5000000n, amountOutMinimum: 1n,
  deadline: 2000000000n, payerIsUser: true, fraisEntree: 5000n }).etat === 'REFUSE', 'frais sans beneficiaire : refuse');

/* 4 — « Open a market on TB · 0.001 ETH » : createPaid + inscrire = 0,001 exactement */
const valeurCreation = new Function('utiliseCreateRouter', 'FRAIS_OUVERTURE_WEI', 'CREATE_FEE_WEI_FLOOR',
  extraire('valeurCreation') + '\nreturn valeurCreation;')(() => true, FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR);
ok(BigInt(valeurCreation(null)) + CREATE_FEE_WEI_FLOOR === FRAIS_OUVERTURE_WEI, 'createPaid + plancher inscrire = 0,001');
ok(BigInt(valeurCreation(FRAIS_OUVERTURE_WEI)) === FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR, 'appel IB direct : 0,0007');
ok(BigInt(valeurCreation(null)) >= CREATE_FEE_WEI_FLOOR, 'au-dessus du plancher CreateRouter');
/* controle negatif : un total plus grand (dollar > 0,001) n est pas rabote sous ce total */
ok(BigInt(valeurCreation(2000000000000000n)) + CREATE_FEE_WEI_FLOOR === 2000000000000000n, 'total plus grand garde');
ok(/if \(val < FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR\) return null;/.test(extraire('recupererPrepayeCreateRouter')), 'prepaye relu a 0,0007');

/* 4b — « Buy here » : la route la moins chere doit etre une route praticable (ETH ou notre hook) */
const ETH0 = '0x0000000000000000000000000000000000000000', TOK = '0xb200000000000000000000784d2c42a395452405';
const mk = (c0, fee, hooks) => { const cle = { currency0: c0, currency1: TOK, fee, tickSpacing: 60, hooks }; return { cle, jeton: TOK, confiance: confianceDe(cle) }; };
const pdp = (pools) => new Function('poolsLive', 'estNotreHook', 'confianceDe', 'const FRAIS_DYNAMIQUE_V4 = 0x800000;\n'
  + extraire('fraisEstDynamique') + '\n' + extraire('poolDecouvertPour') + '\nreturn poolDecouvertPour;')(new Map(pools.map((p, i) => [String(i), p])), estNotreHook, confianceDe);
const sprout = pdp([mk(ETH0, 3000, '0x01f6c61223f89ad07f0d712be4804b66efc380cc'), mk('0x4fc59c42653e052c7ab5c8381f839e2d70504131', 0, '0xc847d9d4db9d70b713e4c0ff19f7119f2ee328c0')])(TOK);
ok(sprout && sprout.cle.currency0 === ETH0, 'SPROUT : la pool ETH est choisie, pas la paire mmETH');
/* controle negatif : une pool de NOTRE hook contre une devise ERC-20 reste eligible */
const notre = pdp([mk('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 0, HOOK_V8)])(TOK);
ok(notre && notre.isTbFeeHook, 'notre hook sur paire ERC-20 : garde');
ok(pdp([mk('0x4fc59c42653e052c7ab5c8381f839e2d70504131', 0, '0xc847d9d4db9d70b713e4c0ff19f7119f2ee328c0')])(TOK) === null, 'paire etrangere seule : aucune route');

console.log('ALL PASS rails-frais-20261002 · ' + n + ' assertions');
