/* banc-vente-aerodrome-fork-20261004.mjs — LA VENTE D UNE ACTION TOKENISEE SUR SA POOL AERODROME, EXECUTEE SUR UN FORK.
 *
 * POURQUOI. Mesure du 2026-10-04 sur le planificateur de prod : vendre NVDAc rendait REFUSE (« no initialized pool among the 16 keys
 *   read ») alors que l acheter passait — l achat prenait sa pool Aerodrome, la vente ne cherchait qu une pool v4. Phil : « pool
 *   Aerodrome et Uniswap acceptees, oublie pas ». rails-api.js route desormais la vente d une action de la table mesuree par le
 *   batisseur Aerodrome (un segment action -> USDC).
 *
 * CE QUE LE BANC FAIT, pour chaque action essayee : un compte neuf recoit de l USDC, ACHETE l action avec le plan du planificateur
 *   (USDC>ACTION), puis la REVEND avec le plan ACTION>USDC — les appels rendus sont envoyes tels quels. Tout se juge sur l ETAT
 *   apres la transaction (status du recu, soldes lus avant/apres), jamais sur un evenement.
 *   - la vente consomme EXACTEMENT le montant d action annonce ;
 *   - le vendeur recoit au moins `recoitAuMoins` USDC ;
 *   - le wallet des frais recoit sa part en USDC, et cette part vaut `fraisBps` de ce qui est sorti de la pool (a l arrondi pres) ;
 *   - l autorisation donnee au routeur est consommee : il ne reste aucune allowance.
 * TEMOINS : une action a pool v4 (pas dans la table) garde le chemin v4 (`planEchange`) ; vendre plus que son solde REVERTE a l envoi
 *   (ce plan n est pas simule cote serveur — c est sa borne, et le banc la montre).
 * ⛔ BORNES : un fork (base-anvil, comptes impersonnes, aucune cle) — ne prouve ni l interface, ni un vrai wallet. L USDC du compte
 *   d essai est pris sur le fork a une pool Aerodrome d une AUTRE action (un transfert impersonne, impossible sur la vraie chaine).
 * Usage : base-anvil --fork-url <rpc Base> --port 8549, puis node banc-vente-aerodrome-fork-20261004.mjs [http://127.0.0.1:8549] [SYMc …] */
import * as R from './rails-api.js';
import * as F from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { ACTIONS_COINBASE } from './paires.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8549';
const demandes = process.argv.slice(2).filter((x) => !/^https?:/.test(x));
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const brut = async (method, params) => fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
const rpc = async (method, params) => { const r = await brut(method, params); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; };
const USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase();
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const lireU = async (to, data) => BigInt(await rpc('eth_call', [{ to, data }, 'latest']));
const balance = (jeton, qui) => lireU(jeton, '0x70a08231' + adrMot(qui));
const allowance = (jeton, qui, a) => lireU(jeton, '0xdd62ed3e' + adrMot(qui) + adrMot(a));
async function envoyer(de, tx) {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) { /* reverterait : on l envoie pour LIRE le status 0 */ }
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { h, status: r.status }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
const plan = (de, vers, montant, compte) => R.planRail({ de, vers, montant: String(montant), compte }, { rpc, clesDe: async () => [] });

const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
ok(chaine === 8453, 'le fork est Base (sinon ce banc ne prouve rien)');

const table = [...POOLS_ACTIONS_AERODROME.entries()].map(([adr, t]) => ({ adr: adr.toLowerCase(), ...t }));
const essais = (demandes.length ? demandes : ['NVDAc', 'MSTRc', 'AAPLc']).map((s) => table.find((t) => t.symbole === s)).filter(Boolean);
ok(essais.length > 0, 'actions essayees : ' + essais.map((e) => e.symbole).join(', ') + ' (toutes dans la table Aerodrome mesuree)');

const instantane = await rpc('evm_snapshot', []);
let serie = 0;
try {
  for (const e of essais) {
    console.log('— ' + e.symbole);
    serie += 1;
    const compte = '0x' + ('c0ffee' + String(tete) + String(serie)).padEnd(40, 'a').slice(0, 40);
    await rpc('anvil_impersonateAccount', [compte]);
    await rpc('anvil_setBalance', [compte, '0x' + (10n ** 18n).toString(16)]);
    /* l USDC d essai : pris a la pool Aerodrome d une AUTRE action (jamais celle qu on traite : sa comptabilite doit rester intacte) */
    const source = table.find((t) => t.adr !== e.adr && t.symbole !== 'NVDAc') || table.find((t) => t.adr !== e.adr);
    const MISE = 500n * 10n ** 6n;
    ok(await balance(USDC, source.pool) > MISE * 2n, e.symbole + ' : la pool ' + source.symbole + ' du fork detient de quoi preter 500 USDC au compte d essai');
    await rpc('anvil_impersonateAccount', [source.pool]);
    await rpc('anvil_setBalance', [source.pool, '0x' + (10n ** 18n).toString(16)]);
    const t0 = await envoyer(source.pool, { to: USDC, data: '0xa9059cbb' + adrMot(compte) + mot(MISE) });
    ok(t0.status === '0x1' && await balance(USDC, compte) === MISE, e.symbole + ' : le compte d essai detient 500 USDC');

    /* 1. ACHAT — le chemin deja en prod, pour obtenir l action */
    const pa = await plan(USDC, e.adr, MISE, compte);
    ok(pa.etat === 'PRET' && pa.route === 'USDC>ACTION' && pa.aSigner.length === 2, e.symbole + ' achat : plan PRET, 2 appels (approbation, swap)');
    for (const c of pa.aSigner) { const r = await envoyer(compte, c); if (r.status !== '0x1') { ok(false, e.symbole + ' achat : un appel a echoue (status ' + r.status + ')'); } }
    const detenu = await balance(e.adr, compte);
    ok(detenu > 0n && await balance(USDC, compte) === 0n, e.symbole + ' achat : le compte detient ' + detenu + ' unites brutes de ' + e.symbole + ', et plus un USDC');

    /* 2. VENTE — le chemin NEUF */
    const usdcAvant = await balance(USDC, compte), fraisAvant = await balance(USDC, FRAIS), poolAvant = await balance(USDC, e.pool);
    const pv = await plan(e.adr, USDC, detenu, compte);
    ok(pv.etat === 'PRET' && pv.route === 'ACTION>USDC' && pv.via === 'planAerodromeSegment' && pv.pool === 'aerodrome', e.symbole + ' vente : plan PRET par le batisseur Aerodrome (etat ' + pv.etat + (pv.pourquoi ? ' — ' + pv.pourquoi : '') + ')');
    if (pv.etat !== 'PRET') continue;
    ok(pv.aSigner.length === 2 && pv.aSigner[0].to.toLowerCase() === e.adr && pv.aSigner[0].data.slice(0, 10) === '0x095ea7b3' && BigInt('0x' + pv.aSigner[0].data.slice(74, 138)) === detenu,
      e.symbole + ' vente : 1er appel = approve(routeur, montant EXACT) sur l action — jamais l infini');
    const routeur = '0x' + pv.aSigner[0].data.slice(34, 74);
    ok(pv.aSigner[1].to.toLowerCase() === routeur, e.symbole + ' vente : le swap part vers le routeur qui vient d etre autorise');
    const statuts = [];
    for (const c of pv.aSigner) statuts.push((await envoyer(compte, c)).status);
    ok(statuts.every((s) => s === '0x1'), e.symbole + ' vente : les 2 transactions sont confirmees (status ' + statuts.join(', ') + ')');
    const recu = await balance(USDC, compte) - usdcAvant, frais = await balance(USDC, FRAIS) - fraisAvant, sorti = poolAvant - await balance(USDC, e.pool);
    ok(await balance(e.adr, compte) === 0n, e.symbole + ' vente : le montant annonce est parti EN ENTIER (solde d action 0)');
    const min = BigInt(pv.resume.recoitAuMoins);
    ok(recu >= min && min > 0n, e.symbole + ' vente : recu ' + recu + ' USDC bruts >= minimum annonce ' + min);
    ok(frais > 0n && recu + frais === sorti, e.symbole + ' vente : ce qui sort de la pool (' + sorti + ') = vendeur (' + recu + ') + wallet des frais (' + frais + '), rien d autre');
    const bps = BigInt(pv.resume.fraisBps);
    const attendu = sorti * bps / 10000n;
    ok(bps > 0n && (frais === attendu || frais === attendu + 1n || frais + 1n === attendu), e.symbole + ' vente : le frais vaut ' + bps + ' bps de la sortie (' + frais + ' pour ' + attendu + ' calcule)');
    ok(await allowance(e.adr, compte, routeur) === 0n, e.symbole + ' vente : il ne reste aucune allowance au routeur');
    /* l aller-retour coute les frais des deux sens + le frais LP : on le DIT, on ne le cache pas */
    console.log('    aller-retour : 500 USDC -> ' + (Number(recu) / 1e6).toFixed(4) + ' USDC (' + ((1 - Number(recu) / Number(MISE)) * 100).toFixed(2) + ' % laisses : 2 frais d interface, frais de pool, glissement)');
  }

  /* TEMOIN 1 : vendre ce qu on ne detient pas — le plan est rendu PRET (non simule), et le SWAP reverte a l envoi */
  {
    const e = essais[0], compte = '0x' + ('c0ffee' + String(tete) + '99').padEnd(40, 'b').slice(0, 40);
    await rpc('anvil_impersonateAccount', [compte]);
    await rpc('anvil_setBalance', [compte, '0x' + (10n ** 18n).toString(16)]);
    const pv = await plan(e.adr, USDC, 1000000n, compte);
    const st = [];
    for (const c of pv.aSigner) st.push((await envoyer(compte, c)).status);
    ok(pv.etat === 'PRET' && st[0] === '0x1' && st[1] === '0x0' && await balance(USDC, compte) === 0n,
      'temoin : sans solde, le plan est rendu PRET (il n est pas simule) et le swap REVERTE a l envoi — rien n est credite (status ' + st.join(', ') + ')');
  }
  /* TEMOIN 2 : une action a pool v4 seule ne passe PAS par le batisseur Aerodrome */
  {
    const v4 = ACTIONS_COINBASE.find((a) => a.symbole === 'LLYc');
    const pv = await plan(String(v4.adr).toLowerCase(), USDC, 1000000n, '0x4200000000000000000000000000000000000006');
    ok(pv.route === 'ACTION>USDC' && pv.via !== 'planAerodromeSegment', 'temoin : LLYc (pool v4, hors table) garde son chemin v4 (via ' + (pv.via || 'aucun : ' + pv.etat) + ')');
  }
} finally {
  await rpc('evm_revert', [instantane]);
}
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
