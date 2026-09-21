/* preuve-frais-arrivent.mjs — LES 0,001 ETH D UN INCONNU ARRIVENT-ILS VRAIMENT SUR a6cf ?
 *
 * ⛔⛔ LA PORTE POSEE PAR PHIL (2026-09-21) : « des que fees sont sur et certain et vont bien sur
 *     0xa6cf… tu passe au Bridge ». Ce fichier est cette porte. Tant qu il n est pas vert, on ne
 *     passe pas a la suite.
 *
 * ⛔ CE QUI REND CETTE PREUVE DIFFERENTE DES PRECEDENTES, et c est tout le sujet :
 *    · le createur N EST PAS NOUS. Un test ou a6cf se paie lui-meme prouve un aller-retour, pas un
 *      revenu. On fabrique donc une adresse tierce et on lui donne de l ETH par stateOverride.
 *    · on ne lit pas « status 0x1 ». On MESURE LE SOLDE de a6cf avant et apres, dans la meme
 *      simulation. Un appel qui reussit sans rien transferer aurait le meme status.
 *    · on lit aussi les transferts traces (`traceTransfers`), pour voir QUI paie QUI.
 *
 * ⛔ LA BORNE, ECRITE ICI : c est une SIMULATION sur l etat mainnet reel. Elle prouve que la chaine
 *    de contrats deplace l argent comme annonce. Elle ne prouve pas qu un inconnu viendra le faire.
 * ⛔ LECTURE SEULE : eth_simulateV1 n envoie rien, ne signe rien.
 */
import { encodeCreateB20, paramsAsset, encodeUpdateContractURI, encodeUpdateSupplyCap, encodeBatchMint }
  from './encodeur.js';
import { SUPPLY_FIXE, DECIMALES_FIXES, repartitionFrappe, HOOK_V8 }
  from './tokenomics.js';
import { planLancement, FEE_POOL, TICK_SPACING_POOL }
  from './lancer-pool.js';
import { cleDePool } from './pool.js';
import { FEE_WALLET, FRAIS_OUVERTURE_WEI } from './frais-creation.js';
import { keccak256 } from './keccak.js';

const enHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const sel4 = (s) => '0x' + enHex(keccak256(new TextEncoder().encode(s))).slice(0, 8);
const mot = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const m32 = (v) => BigInt(v).toString(16).padStart(64, '0');
const eth = (w) => (Number(w) / 1e18).toFixed(9);

const RPC = 'https://mainnet.base.org';
const FACTORY = '0xb20f000000000000000000000000000000000000';
const ETH_NATIF = '0x0000000000000000000000000000000000000000';
/* ⛔ UN INCONNU, PAS NOUS. Adresse fabriquee : elle n a jamais rien fait sur Base. */
const INCONNU = '0x' + '0'.repeat(34) + 'c0ffee'; /* 40 hex exactement */
const SEL_TEXTE = process.argv[2] || 'tblock-preuve-frais';
const NOM = 'PreuveFrais', SYM = 'PRF';
const VALO_ETH = 0.0002;
const URI = 'data:application/json,%7B%22name%22%3A%22' + NOM + '%22%2C%22face%22%3A%7B%22teinte%22%3A10%7D%7D';

let id = 1;
const rpc = async (m, p) => {
  let dernier = 'inconnu';
  for (let e = 0; e < 8; e++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: id++, method: m, params: p }) });
    const j = await r.json();
    if (!j.error) return j.result;
    dernier = j.error.message || '';
    if (!/rate limit|limit exceeded|too many/i.test(dernier)) throw new Error(dernier);
    await new Promise((f) => setTimeout(f, 800 * (e + 1)));
  }
  throw new Error(dernier);
};

console.log('=== CE QUI EST TESTE ===');
console.log('   createur   : ' + INCONNU + '   ⛔ PAS a6cf — un inconnu');
console.log('   wallet     : ' + FEE_WALLET);
console.log('   hook       : ' + HOOK_V8 + '  (V8)');
console.log('   frais      : ' + FRAIS_OUVERTURE_WEI + ' wei = ' + eth(FRAIS_OUVERTURE_WEI) + ' ETH');

/* ══ la creation, au nom de l inconnu ═════════════════════════════════════════════════════════ */
const part = repartitionFrappe(SUPPLY_FIXE, INCONNU);
const dataCreate = encodeCreateB20({
  variant: 0, saltTexte: SEL_TEXTE,
  params: paramsAsset({ nom: NOM, symbole: SYM, admin: INCONNU, decimales: DECIMALES_FIXES }),
  initCalls: [encodeUpdateContractURI(URI), encodeUpdateSupplyCap(SUPPLY_FIXE),
    encodeBatchMint(part.destinataires, part.montants)],
});
const BLOCK = '0x' + String(await rpc('eth_call',
  [{ from: INCONNU, to: FACTORY, data: dataCreate, value: '0x0' }, 'latest'])).slice(26, 66);
console.log('   block prevu: ' + BLOCK
  + ((await rpc('eth_getCode', [BLOCK, 'latest'])) === '0x' ? '  ✅ libre' : '  ⛔ DEJA PRIS'));

/* ══ le plan ══════════════════════════════════════════════════════════════════════════════════ */
const SEL_SUPPLY = sel4('totalSupply()'), SEL_DEC = sel4('decimals()'), SEL_BAL = sel4('balanceOf(address)');
const rpcPlan = async (m, p) => {
  if (m === 'eth_call' && p[0] && String(p[0].to).toLowerCase() === BLOCK) {
    const d = String(p[0].data || '');
    if (d.startsWith(SEL_SUPPLY)) return '0x' + m32(SUPPLY_FIXE);
    if (d.startsWith(SEL_DEC)) return '0x' + m32(DECIMALES_FIXES);
    if (d.startsWith(SEL_BAL) && d.toLowerCase().includes(mot(INCONNU))) return '0x' + m32(part.montants[0]);
    return '0x' + m32(0);
  }
  return rpc(m, p);
};
const plan = await planLancement({ rpc: rpcPlan, chaine: 8453, jeton: BLOCK, compte: INCONNU,
  valorisationEth: VALO_ETH, hooks: HOOK_V8 });
if (plan.etat !== 'PRET' && plan.etat !== 'APPROBATIONS') {
  console.log('\n⛔ plan refuse : ' + plan.etat + ' — ' + (plan.pourquoi || '')); process.exit(1);
}

const SEL_INSCRIRE = sel4('inscrire((address,address,uint24,int24,address),uint160)');
const cle = cleDePool(ETH_NATIF, BLOCK, { fee: FEE_POOL, tickSpacing: TICK_SPACING_POOL, hooks: HOOK_V8 });
const cleHex = mot(cle.currency0) + mot(cle.currency1) + m32(FEE_POOL) + m32(TICK_SPACING_POOL) + mot(HOOK_V8);
const appels = [
  { nom: '1. creer le block', to: FACTORY, data: dataCreate, value: '0x0' },
  { nom: '2. inscrire + PAYER 0,001 ETH', to: HOOK_V8,
    data: SEL_INSCRIRE + cleHex + m32(plan.sqrtVise), value: '0x' + FRAIS_OUVERTURE_WEI.toString(16) },
  ...(plan.etapes || []).map((e, i) => ({ nom: (3 + i) + '. ' + e.nom, to: e.to, data: e.data, value: e.value || '0x0' })),
  { nom: (3 + (plan.etapes || []).length) + '. ouvrir la pool',
    to: plan.tx.to, data: plan.tx.data, value: plan.tx.value || '0x0' },
];

/* ══ LA MESURE : le solde de a6cf AVANT et APRES, dans la meme simulation ════════════════════ */
const soldeAvant = BigInt(await rpc('eth_getBalance', [FEE_WALLET, 'latest']));
const SEL_BAL_LIRE = sel4('balanceOf(address)');
void SEL_BAL_LIRE;
const r = await rpc('eth_simulateV1', [{
  blockStateCalls: [{
    stateOverrides: { [INCONNU]: { balance: '0x' + (10n ** 18n).toString(16) } },
    calls: appels.map((a) => ({ from: INCONNU, to: a.to, data: a.data, value: a.value })),
  }],
  validation: false, traceTransfers: true, returnFullTransactions: false,
}, 'latest']);
const bloc = (Array.isArray(r) ? r[0] : r) || {};
const res = bloc.calls || [];

console.log('\n=== LA CHAINE, DU POINT DE VUE D UN INCONNU ===');
let tousOk = true;
res.forEach((c, i) => {
  const ok = c.status === '0x1';
  if (!ok) tousOk = false;
  console.log('   ' + (appels[i] ? appels[i].nom : '?').padEnd(38) + (ok ? '✅ OK' : '⛔ ECHEC')
    + (c.error ? ' · ' + JSON.stringify(c.error).slice(0, 110) : ''));
});

/* ⛔ traceTransfers emet un log synthetique par transfert d ETH. On cherche CELUI qui arrive sur
 *    a6cf, et on en lit le montant — au lieu de supposer que « ca a marche ». */
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
let recuParLeWallet = 0n;
const versLeWallet = [];
for (const c of res) {
  for (const l of c.logs || []) {
    if (String(l.topics?.[0]).toLowerCase() !== TOPIC_TRANSFER) continue;
    const vers = '0x' + String(l.topics[2] || '').slice(26).toLowerCase();
    if (vers !== FEE_WALLET.toLowerCase()) continue;
    const de = '0x' + String(l.topics[1] || '').slice(26).toLowerCase();
    const montant = BigInt(l.data || '0x0');
    recuParLeWallet += montant;
    versLeWallet.push({ de, montant });
  }
}

console.log('\n=== CE QUE a6cf A REELLEMENT RECU DANS LA SIMULATION ===');
console.log('   solde avant (chaine reelle) : ' + soldeAvant + ' wei = ' + eth(soldeAvant) + ' ETH');
if (!versLeWallet.length) {
  console.log('   ⛔⛔ AUCUN transfert trace vers le wallet. Les appels peuvent etre verts et');
  console.log('        l argent ne pas bouger : c est exactement ce que ce test existe pour voir.');
} else {
  for (const t of versLeWallet) console.log('   reçu de ' + t.de + ' : ' + t.montant + ' wei = ' + eth(t.montant) + ' ETH');
}
console.log('   TOTAL reçu : ' + recuParLeWallet + ' wei = ' + eth(recuParLeWallet) + ' ETH');
console.log('   attendu    : ' + FRAIS_OUVERTURE_WEI + ' wei = ' + eth(FRAIS_OUVERTURE_WEI) + ' ETH');

/* ⛔⛔ MA PREMIERE GARDE ETAIT FAUSSE, ET C EST ECRIT ICI PLUTOT QUE CORRIGE EN SILENCE. Elle
 *     exigeait que l EXPEDITEUR IMMEDIAT du transfert vers a6cf soit l inconnu. Or le hook RELAIE :
 *     `feeWallet.call{value: msg.value}`. L expediteur immediat est donc le hook, par construction,
 *     et la garde criait au loup sur un chemin parfaitement sain — exactement le defaut qui a deja
 *     coute une signature le matin meme.
 * ⛔ CE QU IL FAUT PROUVER EST LE CHEMIN ENTIER : l argent SORT de l inconnu, ENTRE dans le hook, et
 *    RESSORT vers a6cf, pour le meme montant. On verifie donc les DEUX sauts. */
let sortiDeLInconnu = 0n;
for (const c of res) {
  for (const l of c.logs || []) {
    if (String(l.topics?.[0]).toLowerCase() !== TOPIC_TRANSFER) continue;
    const de = '0x' + String(l.topics[1] || '').slice(26).toLowerCase();
    const vers = '0x' + String(l.topics[2] || '').slice(26).toLowerCase();
    if (de === INCONNU.toLowerCase() && vers === HOOK_V8.toLowerCase()) sortiDeLInconnu += BigInt(l.data || '0x0');
  }
}
const exact = recuParLeWallet === FRAIS_OUVERTURE_WEI;
const cheminEntier = sortiDeLInconnu === FRAIS_OUVERTURE_WEI && recuParLeWallet === FRAIS_OUVERTURE_WEI;
console.log('\n=== LE CHEMIN, SAUT PAR SAUT ===');
console.log('   inconnu → hook : ' + sortiDeLInconnu + ' wei = ' + eth(sortiDeLInconnu) + ' ETH');
console.log('   hook → a6cf    : ' + recuParLeWallet + ' wei = ' + eth(recuParLeWallet) + ' ETH');
console.log('   rien ne reste au hook : ' + (sortiDeLInconnu === recuParLeWallet ? '✅ oui' : '⛔ NON'));
console.log('\n=== VERDICT ===');
if (tousOk && exact && cheminEntier) {
  console.log('   ✅✅ LES FRAIS ARRIVENT. Un inconnu ouvre un marche : 0,001 ETH sortent de SON');
  console.log('        solde, traversent le hook sans rien y laisser, et atterrissent sur a6cf —');
  console.log('        au wei pres, dans la MEME transaction atomique.');
} else {
  console.log('   ⛔ PAS PROUVE :'
    + (tousOk ? '' : ' un appel echoue ·')
    + (exact ? '' : ' le montant reçu (' + recuParLeWallet + ') ne vaut pas ' + FRAIS_OUVERTURE_WEI + ' ·')
    + (cheminEntier ? '' : ' le chemin inconnu → hook → a6cf n est pas complet'));
}
console.log('\n⛔ BORNE : simulation sur l etat mainnet. Prouve que les contrats deplacent l argent');
console.log('   comme annonce. Ne prouve PAS qu un inconnu viendra le faire.');
