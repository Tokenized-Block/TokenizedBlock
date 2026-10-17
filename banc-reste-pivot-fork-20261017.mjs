/* banc-reste-pivot-fork-20261017.mjs — BLOCK -> ETH -> USDC -> ACTION (franchissement, 3 appels) : CE QUI RESTE EN USDC AU COMPTE.
 *
 * POURQUOI (mesure d un autre agent, 2026-10-17, fork dedie) : UNIT > AAPLc rendait 12,0039 $ d AAPLc et laissait 0,1213 $ d USDC au
 *   compte sur 12,1439 $ ; IB022 laissait 0,22 $. Cause : l appel 3 (Aerodrome exactInput) depense le MINIMUM garanti de l appel 1
 *   (tolerance 1 %), pas l USDC reellement recu — le calldata d un lot EIP-5792 est fige avant l envoi.
 * CE QUE CE BANC MESURE, PAR LES SOLDES (avant / apres), jamais par les logs :
 *   (1) le plan PRET s execute sans revert ; le compte recoit l action ; le block paye = le montant du plan ;
 *   (2) l USDC qui reste au compte, en unites et en $ ;
 *   (3) LE PLAN L ANNONCE : `resume.restePivot` (unites) et `resume.resteAuCompte` (phrase) ; l ecart entre l annonce et le solde
 *       mesure est borne (meme bloc, meme prix : ce qui s ecarte est le frais/arrondi des pools, pas la marche) ;
 *   (4) OPTION (a) MESUREE, PAS SUPPOSEE : le routeur Aerodrome CL ne depense PAS un solde qu il detient — exactInput tire chez
 *       msg.sender (transferFrom). USDC pose chez le routeur + appelant sans USDC ni allowance => REVERT ; amountIn = 0 => REVERT.
 * ⛔ BORNES : fork anvil (base), compte impersonne, aucune cle, au bloc affiche. Les appels du lot sont envoyes UN PAR UN (anvil mine
 *   chaque tx seule : aucun tiers ne s intercale, c est l etat d un lot atomique) — ne prouve ni un vrai wallet ni EIP-5792 lui-meme.
 *   Le prix ne bouge pas entre le plan et l execution : le reste mesure ici est celui d un devis FRAIS ; sur la chaine il varie avec
 *   la marche (plus si le prix monte, moins s il baisse, revert sous le minimum).
 * Usage : anvil --base --fork-url https://mainnet.base.org --port 9737, puis node banc-reste-pivot-fork-20261017.mjs [http://127.0.0.1:9737] */
import * as R from './rails-api.js';
import * as F from './frais-creation.js';
import { ACTIONS_COINBASE } from './paires.js';
import { LOGS_INITIALIZE_ACTIONS } from './cles-v4-actions.js';
import { decoderInitialize } from './pools-du-jeton.js';
import { ROUTEUR_AERODROME_CL, calldataExactInputCL } from './calldata-aerodrome.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import fs from 'node:fs';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9737';
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); return c; };
const rpc = async (method, params) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; }
  return r.result;
};
const ETH = R.ETH, USDC = F.USDC_BASE.toLowerCase();
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const solde = async (j, qui) => (j === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : BigInt(await rpc('eth_call', [{ to: j, data: '0x70a08231' + adrMot(qui) }, 'latest'])));
async function envoyer(de, tx) {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) { /* on l envoie pour lire le status */ }
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { status: r.status, gaz: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || '0x0') }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came');
}
const cles = new Map();
for (const l of LOGS_INITIALIZE_ACTIONS) {
  const d = decoderInitialize(l);
  if (!d || !d.cle) continue;
  for (const c of [d.cle.currency0, d.cle.currency1]) { const k = String(c).toLowerCase(); if (k !== USDC) cles.set(k, (cles.get(k) || []).concat([d.cle])); }
}
const plan = (de, vers, montant, compte) => R.planRail({ de, vers, montant: String(montant), compte }, { rpc, clesDe: async (a) => cles.get(String(a).toLowerCase()) || [] });
async function planPret(de, vers, montant, compte) {
  let p = await plan(de, vers, montant, compte), tours = 0;
  while (p.etat === 'APPROBATIONS' && tours < 3) {
    tours += 1;
    for (const c of p.aSigner) { const r = await envoyer(compte, c); if (r.status !== '0x1') return { etat: 'APPROBATION_REVERTEE' }; }
    p = await plan(de, vers, montant, compte);
  }
  return p;
}
const usd = (u) => '$' + (Number(u) / 1e6).toFixed(4);

const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
/* adresses LUES dans le depot, jamais recopiees de memoire */
const IB022 = (fs.readFileSync(new URL('./pool-sans-hook.js', import.meta.url), 'utf8').match(/'(0x[0-9a-f]{40})', \/\* IB022 /) || [])[1];
if (!ok(/^0x[0-9a-f]{40}$/.test(String(IB022)), 'IB022 se lit dans pool-sans-hook.js')) process.exit(1);
const AAPLC = String((ACTIONS_COINBASE.find((a) => a.symbole === 'AAPLc') || {}).adr || '').toLowerCase();
const UNIT = (fs.readFileSync(new URL('./banc-unit-lancement-fork-20261017.mjs', import.meta.url), 'utf8').match(/UNIT \|\| '(0x[0-9a-f]{40})'/) || [])[1];
if (!ok(/^0x[0-9a-f]{40}$/.test(String(UNIT)), 'UNIT se lit dans banc-unit-lancement-fork-20261017.mjs')) process.exit(1);
if (!ok(POOLS_ACTIONS_AERODROME.has(AAPLC), 'AAPLc (paires.js) est une action de la table Aerodrome : la route est le franchissement')) process.exit(1);

const snap = await rpc('evm_snapshot', []);
const mesures = [];
try {
  const compte = '0x' + ('5e57e' + tete).padEnd(40, 'c').slice(0, 40);
  await rpc('anvil_impersonateAccount', [compte]);
  await rpc('anvil_setBalance', [compte, '0x' + (10n ** 18n).toString(16)]);
  for (const [nomB, B] of [['IB022', IB022], ['UNIT', UNIT]]) {
  /* mise en place : le compte achete le block avec de l ETH (route 1, le chemin par defaut de l app) */
  const pa = await planPret(ETH, B, 6n * 10n ** 15n, compte);
  if (!ok(pa.etat === 'PRET', 'mise en place ETH > ' + nomB + ' : plan PRET (' + pa.etat + (pa.pourquoi ? ', ' + String(pa.pourquoi).slice(0, 100) : '') + ')')) continue;
  let revert = false;
  for (const c of pa.aSigner) { const r = await envoyer(compte, c); if (r.status !== '0x1') { revert = true; break; } }
  if (!ok(!revert, 'mise en place ETH > ' + nomB + ' : executee')) continue;
  const tenu = await solde(B, compte);
  if (!ok(tenu > 0n, 'le compte detient ' + tenu + ' unites de ' + nomB)) continue;

  for (const [nom, part] of [[nomB + ' > AAPLc (moitie)', tenu / 2n], [nomB + ' > AAPLc (quart)', tenu / 4n]]) {
    const p = await planPret(B, AAPLC, part, compte);
    if (!ok(p.etat === 'PRET', nom + ' : plan PRET (' + p.etat + (p.pourquoi ? ', ' + String(p.pourquoi).slice(0, 120) : '') + ')')) continue;
    ok(p.via === 'planFranchissement' && p.aSigner.length === 3, nom + ' : franchissement en 3 appels (via ' + p.via + ', ' + p.aSigner.length + ' appels)');
    const r = p.resume || {};
    const avant = { b: await solde(B, compte), a: await solde(AAPLC, compte), u: await solde(USDC, compte) };
    const st = [];
    for (const c of p.aSigner) { const x = await envoyer(compte, c); st.push(x.status); if (x.status !== '0x1') break; }
    if (!ok(st.every((s) => s === '0x1'), nom + ' : les 3 appels passent (' + st.join(',') + ')')) continue;
    const d = { b: avant.b - await solde(B, compte), a: await solde(AAPLC, compte) - avant.a, u: await solde(USDC, compte) - avant.u };
    ok(d.b === BigInt(part), nom + ' : le block paye = le montant du plan (' + d.b + ')');
    ok(d.a > 0n && d.a >= BigInt(r.recoitAuMoins || 0), nom + ' : le compte recoit ' + d.a + ' unites d AAPLc (>= minimum ' + r.recoitAuMoins + ')');
    const devisPivot = BigInt(r.devisPivot || 0), minPivot = BigInt(r.pivotAuMoins || 0);
    console.log('     MESURE : devis jambe 1 ' + devisPivot + ' u USDC (' + usd(devisPivot) + '), minimum jambe 1 = entree jambe 2 ' + minPivot + ' (' + usd(minPivot) + ')'
      + ', USDC reste au compte ' + d.u + ' (' + usd(d.u) + ', ' + (devisPivot > 0n ? (Number(d.u * 1000000n / devisPivot) / 10000).toFixed(3) + ' % du devis' : '?') + ')');
    mesures.push({ nom, resteMesure: d.u, devisPivot, minPivot, annonce: r.restePivot, phrase: r.resteAuCompte, tol: r.toleranceBpsJambe1 });
    /* (2) LE DEFAUT, MESURE : l USDC qui reste = la sortie reelle de la jambe 1 moins ce que la jambe 2 a depense */
    ok(d.u > 0n, nom + ' : de l USDC RESTE au compte (' + usd(d.u) + ') — le lot ne peut pas depenser plus que le minimum de la jambe 1');
    /* (3) LE PLAN L ANNONCE, CHIFFRE, ET L ANNONCE TIENT AU SOLDE */
    const annonce = r.restePivot === undefined || r.restePivot === null ? null : BigInt(r.restePivot);
    ok(annonce !== null && annonce > 0n, nom + ' : le plan annonce le reste en unites (restePivot = ' + r.restePivot + ')');
    ok(typeof r.resteAuCompte === 'string' && /\$\d/.test(r.resteAuCompte) && /USDC/.test(r.resteAuCompte) && /wallet/.test(r.resteAuCompte),
      nom + ' : et en clair : « ' + r.resteAuCompte + ' »');
    if (annonce !== null && annonce > 0n) {
      const ecart = d.u > annonce ? d.u - annonce : annonce - d.u;
      /* meme bloc, meme prix : l ecart vient seulement du devis v4 (quoteur) contre l execution reelle ; borne a 2 % de l annonce + 2 unites */
      ok(ecart <= annonce / 50n + 2n, nom + ' : annonce ' + annonce + ' vs mesure ' + d.u + ' (ecart ' + ecart + ' unites)');
    }
  }
  }

  /* (4) OPTION (a) : le routeur Aerodrome depense-t-il un solde qu il detient ? On lui pose l USDC reste, et un appelant SANS USDC
   *   ni allowance demande exactInput sur ce montant. Un routeur « solde du contrat » (SwapRouter02 / UniversalRouter) passerait. */
  const reste = await solde(USDC, compte);
  if (ok(reste > 0n, 'option (a) : il reste ' + reste + ' u USDC a poser chez le routeur')) {
    const t = await envoyer(compte, { to: USDC, data: '0xa9059cbb' + adrMot(ROUTEUR_AERODROME_CL) + reste.toString(16).padStart(64, '0') });
    ok(t.status === '0x1' && await solde(USDC, ROUTEUR_AERODROME_CL) >= reste, 'option (a) : le routeur detient l USDC pose');
    const vide = '0x' + ('0a0a' + tete).padEnd(40, '0').slice(0, 40);
    await rpc('anvil_impersonateAccount', [vide]);
    await rpc('anvil_setBalance', [vide, '0x' + (10n ** 17n).toString(16)]);
    const ts = POOLS_ACTIONS_AERODROME.get(AAPLC).tickSpacing;
    const deadline = BigInt(parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16) + 600);
    for (const [quoi, montant] of [['amountIn = le solde du routeur', reste], ['amountIn = 0 (CONTRACT_BALANCE de SwapRouter02)', 0n]]) {
      const c = montant > 0n
        ? calldataExactInputCL({ sauts: [{ de: USDC, vers: AAPLC, tickSpacing: ts }], recipient: vide, amountIn: montant, amountOutMinimum: 1n, deadline })
        : (() => { const x = calldataExactInputCL({ sauts: [{ de: USDC, vers: AAPLC, tickSpacing: ts }], recipient: vide, amountIn: 1n, amountOutMinimum: 1n, deadline });
          /* meme calldata, mot amountIn mis a 0 a la main (le constructeur le refuse, a raison) :
           *   mots = [offset du tuple, offset du chemin, recipient, deadline, amountIn, amountOutMinimum, ...] => amountIn = mot 4 */
          const corps = x.data.slice(10);
          if (BigInt('0x' + corps.slice(64 * 4, 64 * 5)) !== 1n) throw new Error('internal: amountIn is not word 4');
          return { ...x, data: x.data.slice(0, 10) + corps.slice(0, 64 * 4) + '0'.repeat(64) + corps.slice(64 * 5) }; })();
      const r = await envoyer(vide, { to: c.to, data: c.data });
      ok(r.status === '0x0', 'option (a) : exactInput depuis un compte sans USDC, ' + quoi + ' => REVERT (status ' + r.status + ') : le routeur ne depense pas son propre solde');
    }
    ok(await solde(AAPLC, vide) === 0n, 'option (a) : l appelant n a recu aucune action');
  }
} finally { await rpc('evm_revert', [snap]); }
console.log('\nRESUME MESURE :');
for (const m of mesures) console.log('  ' + m.nom + ' : reste ' + m.resteMesure + ' u (' + usd(m.resteMesure) + ') sur devis ' + usd(m.devisPivot) + ' · annonce ' + m.annonce + ' · tolerance jambe 1 ' + m.tol + ' bps · « ' + m.phrase + ' »');
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
