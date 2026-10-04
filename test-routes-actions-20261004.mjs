/* test-routes-actions-20261004.mjs — LES ROUTES NEUVES DES ACTIONS TOKENISEES : contre ETH, contre un block, contre une autre action.
 *
 * Phil, 2026-10-04 : « Payer un block avec n importe quelle TStock : pas route — fais-le » ; « les trades avec action tokenisee
 *   comme sur Coinbase wallet, avec nos fees — c est notre market tout entier ».
 * CE QUI EST PROUVE AILLEURS, en EXECUTION : banc-marche-actions-fork-20261004.mjs (fork de Base) — chaque route est envoyee
 *   telle que le planificateur la rend, et le wallet des frais est mesure sur ses soldes.
 * CE QUE CE FICHIER TIENT, hors reseau :
 * A. calldata-aerodrome.js : la sortie en ETH NATIF remplace le balayage par `unwrapWETH9WithFee(min, destinataire, bps, wallet des
 *    frais)` — et seulement si le chemin finit sur le WETH ; sans le drapeau, rien ne change (temoin).
 * B. rails-api.js : l AIGUILLAGE. Une action v4 qui paie un block / une action lit d abord SON marche (route 5) ; une action de la
 *    table Aerodrome contre ETH passe par le batisseur Aerodrome ; les refus disent quoi faire, sans une lecture de chaine.
 * C. app.html : le ticket propose « for ETH » a la vente d une action, et les actions v4 pour payer un block.
 * D. MUTANTS (sur des copies) : chaque branche retiree fait rougir son assertion.
 * ⛔ BORNE : un faux noeud qui ne rend que des zeros ne prouve AUCUN plan — seulement quel batisseur est appele, et dans quel ordre. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');

const { ACTIONS_COINBASE } = await imp('paires.js');
const { POOLS_ACTIONS_AERODROME } = await imp('pools-actions-aerodrome.js');
const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');
const { WETH_BASE } = await imp('plan-eth-block.js');
const USDC = USDC_BASE.toLowerCase(), WETH = WETH_BASE.toLowerCase(), FRAIS = FEE_WALLET.toLowerCase();
const aero = [...POOLS_ACTIONS_AERODROME.keys()].map((k) => String(k).toLowerCase());
const adrDe = (sym) => String(ACTIONS_COINBASE.find((a) => a.symbole === sym).adr).toLowerCase();
const symAero = ACTIONS_COINBASE.find((a) => aero.includes(String(a.adr).toLowerCase())).symbole;
const v4 = ACTIONS_COINBASE.filter((a) => !aero.includes(String(a.adr).toLowerCase()));
const symV4 = v4[0].symbole, symV4b = v4[1].symbole;
const COMPTE = '0x00000000000000000000000000000000c0ffee77', BLOCK = '0xb200000000000000000000000000000000000001';

console.log('— A. calldata : la sortie en ETH natif');
async function calldata(dir, extra) {
  const C = await imp('calldata-aerodrome.js', dir);
  return { C, r: C.calldataExactInputAvecFrais({ sauts: [{ de: adrDe(symAero), vers: USDC, tickSpacing: 10 }, { de: USDC, vers: WETH, tickSpacing: 100 }],
    recipient: COMPTE, amountIn: 1000000n, amountOutMinimum: 2000000000000n, deadline: 1900001200n, maintenant: 1900000000n, beneficiaireFrais: FRAIS, ...extra }) };
}
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
{
  const { C, r } = await calldata(ICI, { sortieEthNatif: true });
  const d = String(r.data || '').toLowerCase(), sel = C.SELECTEURS.unwrapWETH9WithFee.slice(2), i = d.indexOf(sel);
  ok(r.etat === 'PRET' && i > 0 && !d.includes(C.SELECTEURS.sweepTokenWithFee.slice(2)), 'A sortie ETH : le balayage est unwrapWETH9WithFee, et sweepTokenWithFee n y est plus');
  const bps = BigInt(r.fraisBps), minU = 2000000000000n * (10000n - bps) / 10000n;
  ok(bps > 0n && d.slice(i + 8, i + 8 + 256) === mot(minU) + COMPTE.slice(2).padStart(64, '0') + mot(bps) + FRAIS.slice(2).padStart(64, '0'),
    'A … ses 4 arguments, dans l ordre : minimum APRES retenue (' + minU + '), le destinataire, ' + bps + ' bps, le wallet des frais du depot');
  ok(String(r.minUtilisateur) === minU.toString() && String(r.minPools) === '2000000000000', 'A … deux minimums distincts : celui des pools, et celui de l utilisateur (apres retenue)');
  const t = await calldata(ICI, {});
  const dt = String(t.r.data || '').toLowerCase();
  ok(t.r.etat === 'PRET' && dt.includes(C.SELECTEURS.sweepTokenWithFee.slice(2)) && !dt.includes(sel), 'A temoin : sans le drapeau, le balayage reste sweepTokenWithFee (rien ne change pour les chemins existants)');
  const x = C.calldataExactInputAvecFrais({ sauts: [{ de: adrDe(symAero), vers: USDC, tickSpacing: 10 }], recipient: COMPTE, amountIn: 1000000n, amountOutMinimum: 5n,
    deadline: 1900001200n, maintenant: 1900000000n, beneficiaireFrais: FRAIS, sortieEthNatif: true });
  ok(x.etat === 'REFUSE' && /ends on WETH/.test(String(x.pourquoi)), 'A une sortie ETH sur un chemin qui ne finit PAS sur le WETH est refusee (unwrap ne balaie que le WETH)');
}

console.log('— B. rails-api.js : l aiguillage');
/* faux noeud : toute lecture rend des zeros. `clesDe` est un ESPION : il note QUEL marche le planificateur lit, et dans quel ordre. */
async function router(dir, de, vers) {
  const R = await imp('rails-api.js', dir);
  let appels = 0; const lus = [];
  const rpc = async (m) => { appels += 1; if (m === 'eth_blockNumber') return '0x1'; return '0x' + '0'.repeat(64 * 8); };
  const r = await R.planRail({ de, vers, montant: '1000000', compte: COMPTE }, { rpc, clesDe: async (a) => { lus.push(String(a).toLowerCase()); return []; } });
  return { r, appels, lus };
}
{
  const e = await router(ICI, adrDe(symAero), 'ETH');
  ok(e.r.route === 'ACTION>ETH' && e.r.via === 'planAerodromeSegment' && e.r.pool === 'aerodrome' && e.appels > 0 && e.r.etat !== 'PRET',
    'B ' + symAero + ' (table Aerodrome) > ETH : batisseur Aerodrome, qui lit ses pools ; faux noeud = aucun plan (etat ' + e.r.etat + ')');
  const b = await router(ICI, adrDe(symV4), BLOCK);
  ok(b.r.route === 'ACTION>BLOCK' && b.lus[0] === adrDe(symV4) && !/this block trades against/.test(String(b.r.pourquoi)),
    'B ' + symV4 + ' (pool v4) > BLOCK : le planificateur lit d abord le marche de L ACTION (route 5), pas celui du block (route 1)');
  const a = await router(ICI, adrDe(symV4), adrDe(symV4b));
  ok(a.r.route === 'ACTION>ACTION' && a.lus[0] === adrDe(symV4) && !/no measured deep Aerodrome pool/.test(String(a.r.pourquoi)),
    'B ' + symV4 + ' > ' + symV4b + ' (deux pools v4) : route 5, plus le refus « no measured deep Aerodrome pool »');
  const h = await router(ICI, adrDe(symV4), 'ETH');
  ok(h.r.route === 'ACTION>ETH' && h.lus[0] === adrDe(symV4) && h.r.via !== 'planAerodromeSegment', 'B ' + symV4 + ' (pool v4) > ETH : route 5 (v4), jamais le batisseur Aerodrome');
  const x = await router(ICI, adrDe(symV4), adrDe(symAero));
  ok(x.r.etat === 'REFUSE' && /trades on Aerodrome and .* on Uniswap v4: sell for USDC, then buy with USDC \(two trades\)/.test(String(x.r.pourquoi)) && x.appels === 0 && x.lus.length === 0,
    'B ' + symV4 + ' (v4) > ' + symAero + ' (Aerodrome) : refus qui dit quoi faire, AVANT toute lecture');
  const y = await router(ICI, adrDe(symAero), BLOCK);
  ok(y.r.etat === 'REFUSE' && /sells here for USDC or ETH — sell it first, then buy/.test(String(y.r.pourquoi)) && y.appels === 0, 'B ' + symAero + ' (Aerodrome) > BLOCK : refus qui dit quoi faire, sans lecture');
  const t = await router(ICI, USDC, BLOCK);
  ok(t.r.route === 'USDC>BLOCK' && t.lus[0] === BLOCK, 'B temoin : USDC > BLOCK garde la route 1 (le marche du block est lu en premier)');
}

console.log('— C. app.html : le ticket');
const html = lire('app.html');
/* Phil, 2026-10-04 : « swap action to USDC et inversement, pas que ETH — USDC natif sera plus simple » : USDC d abord pour une action */
ok(/else if \(ACTIONS_PAR_ADR\.has\(a\)\) choix = \(q && q\.ok \? \[\[q\.adr, 'for ' \+ q\.sym\]\] : \[\]\)\.concat\(\[\['ETH', 'for ETH'\]\]\);/.test(html), 'C vendre une action : sa cotation (USDC) en premier, « for ETH » en second');
ok(/if \(achat\) choix = ACTIONS_PAR_ADR\.has\(a\) \? \[\['USDC', 'USDC'\], \['ETH', 'ETH'\]\] : standard \? \[\['ETH', 'ETH'\], \['USDC', 'USDC'\]\] : \[\[q\.adr, q\.sym\]\];/.test(html),
  'C acheter une action : USDC en premier, ETH en second ; un block garde ETH en premier');
ok(/if \(achat && !ACTIONS_PAR_ADR\.has\(a\) && standard\) \{\s+const v4 = bcActionsV4\(\);/.test(html) && /if \(v4\.has\(sa\)\) choix\.push\(\[sa, st\.symbole \+ ' \(stock\)'\]\);/.test(html),
  'C acheter un block (cote en ETH ou USDC) : les actions a pool v4 mesuree sont proposees comme moyen de paiement');
ok(/if \(ACTIONS_PAR_ADR\.has\(k\) && !POOLS_ACTIONS_AERODROME\.has\(k\)\) s\.add\(k\);/.test(html) && /for \(const l of LOGS_INITIALIZE_MESURES\) \{\s+const d = decoderInitialize\(l\);\s+if \(!d \|\| !d\.cle\) continue;\s+for \(const c of \[d\.cle\.currency0, d\.cle\.currency1\]\)/.test(html),
  'C … cette liste vient des pools v4 LUES (logs redecodes), et exclut la table Aerodrome (qui ne paie pas un block en un trade)');

console.log('— D. mutants');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-routes-'));
const copie = () => { const dir = fs.mkdtempSync(path.join(tmp, 'm-')); for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) && !/^(serveur-web|vendor|mcp-ext-apps)/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(dir, f)); return dir; };
const muter = (fichier, de, vers) => { const src = lire(fichier); const dir = copie(); const une = src.split(de).length === 2; fs.writeFileSync(path.join(dir, fichier), src.replace(de, () => vers)); return { dir, une }; };
{
  const m = muter('rails-api.js', "if (nv === 'BLOCK' && nd !== 'BLOCK' && nd !== 'ACTION') {", "if (nv === 'BLOCK' && nd !== 'BLOCK') {");
  let rouge = false;
  try { const b = await router(m.dir, adrDe(symV4), BLOCK); rouge = b.lus[0] !== adrDe(symV4); } catch (_) { rouge = true; }
  ok(m.une && rouge, 'D mutant « la route 1 reprend ACTION>BLOCK » : ROUGE (c est le marche du block qui est lu, l action ne paie plus)');
}
{
  const m = muter('rails-api.js', "if (nv === 'ACTION' && nd !== 'ACTION') {", "if (nv === 'ACTION') {");
  let rouge = false;
  try { const a = await router(m.dir, adrDe(symV4), adrDe(symV4b)); rouge = /no measured deep Aerodrome pool/.test(String(a.r.pourquoi)) || a.lus[0] !== adrDe(symV4); } catch (_) { rouge = true; }
  ok(m.une && rouge, 'D mutant « la route 3 reprend ACTION>ACTION » : ROUGE');
}
{
  const m = muter('rails-api.js', "if (nd === 'ACTION' && nv === 'ETH' && POOLS_ACTIONS_AERODROME.has(de)) {", 'if (false) {');
  let rouge = false;
  try { const e = await router(m.dir, adrDe(symAero), 'ETH'); rouge = e.r.via !== 'planAerodromeSegment'; } catch (_) { rouge = true; }
  ok(m.une && rouge, 'D mutant « vente Aerodrome contre ETH retiree » : ROUGE');
}
{
  const m = muter('calldata-aerodrome.js', 'const balayage = sortieEthNatif', 'const balayage = false');
  let rouge = false;
  try { const { C, r } = await calldata(m.dir, { sortieEthNatif: true }); rouge = !String(r.data || '').toLowerCase().includes(C.SELECTEURS.unwrapWETH9WithFee.slice(2)); } catch (_) { rouge = true; }
  ok(m.une && rouge, 'D mutant « sortie ETH qui balaie quand meme du WETH » : ROUGE');
}
{
  const m = muter('plan-aerodrome-segment.js', 'fraisBps, beneficiaireFrais, sortieEthNatif,', 'fraisBps, beneficiaireFrais,');
  /* le drapeau perdu en route : le plan rendrait du WETH en annoncant de l ETH — on le voit sur un noeud qui rend des pools lisibles */
  const P = await imp('plan-aerodrome-segment.js', m.dir), Pv = await imp('plan-aerodrome-segment.js');
  const C = await imp('calldata-aerodrome.js');
  const pool = '0x' + '1'.repeat(40);
  const rpc = async (methode, params) => {
    const data = String(params[0].data || '');
    if (data.startsWith(C.SELECTEURS.getPool)) return '0x' + pool.slice(2).padStart(64, '0');
    if (data.startsWith('0x70a08231')) return '0x' + (10n ** 12n).toString(16).padStart(64, '0');
    if (data.startsWith('0x0dfe1681')) return '0x' + String(params[0].to === pool ? USDC : USDC).slice(2).padStart(64, '0'); /* token0() */
    return '0x' + (1n << 96n).toString(16).padStart(64, '0') + '0'.repeat(64 * 6); /* slot0 : prix 1:1 */
  };
  const args = { rpc, chemin: [{ de: adrDe(symAero), vers: USDC, famille: 'aerodrome' }, { de: USDC, vers: WETH, famille: 'aerodrome' }], devise: adrDe(symAero), block: WETH,
    montant: 10n ** 9n, compte: COMPTE, beneficiaireFrais: FRAIS, maintenant: 1900000000000, sortieEthNatif: true };
  const vrai = await Pv.planAerodromeSegment(args), mut = await P.planAerodromeSegment(args);
  const sel = C.SELECTEURS.unwrapWETH9WithFee.slice(2);
  ok(vrai.etat === 'PRET' && String(vrai.appels[1].data).toLowerCase().includes(sel) && /^0x0{40}$/.test(String(vrai.resume.recoitDevise)),
    'D temoin : le plan complet (2 sauts) rend PRET, se termine par unwrapWETH9WithFee, et annonce de l ETH natif (etat ' + vrai.etat + (vrai.pourquoi ? ' — ' + vrai.pourquoi : '') + ')');
  ok(m.une && mut.etat === 'PRET' && !String(mut.appels[1].data).toLowerCase().includes(sel), 'D mutant « drapeau perdu entre le plan et le calldata » : ROUGE (le plan annoncerait de l ETH et rendrait du WETH)');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
