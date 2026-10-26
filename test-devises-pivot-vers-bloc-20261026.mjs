/* test-devises-pivot-vers-bloc-20261026.mjs — GAPS 4 et 7, hors reseau : QUI paie un block, et avec quels mots on refuse.
 * CE QUI EST PROUVE AILLEURS, en EXECUTION : banc-devises-pivot-vers-bloc-fork-20261026.mjs (fork Base, base-anvil) — EURC, cbBTC, WETH
 *   -> IB022 (cote ETH, hook qui paie), EURC -> SSTR et ETH -> SSTR (cote USDC, hook tiers), et le repli en deux trades.
 * CE QUE CE FICHIER TIENT :
 * A. rails-api.js `entreeVersBloc` : l aiguillage de la route 1, pur (aucune lecture).
 * B. `phraseRefusEntreeBloc` / `nomJeton` : le refus dit « ETH », jamais « 0x0000…0000 » (le defaut mesure en prod le 2026-10-25).
 * C. le lot : la 4 ter et les devises pivot passent par LE MEME `lotPivotUsdcVersBloc` (pas de jumeau) ; la jambe pivot porte le DEVIS.
 * D. faux noeud (zeros) : un devis Aerodrome illisible rend NON_MESURE, jamais un plan au minimum devine.
 * ⛔ BORNE : un faux noeud ne prouve aucun plan — seulement l aiguillage. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.TB_DIR_TEST || ICI;
const imp = (f) => import(pathToFileURL(path.join(DIR, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const R = await imp('rails-api.js');
const { POOLS_PIVOTS_AERODROME, DEVISES_VIA_USDC_AERODROME } = await imp('plan-franchissement.js');
const { USDC_BASE } = await imp('frais-creation.js');
const { WETH_BASE } = await imp('plan-eth-block.js');
const { DEVISES_BASE } = await imp('paires.js');
const ETH = R.ETH, USDC = USDC_BASE.toLowerCase(), WETH = WETH_BASE.toLowerCase();
const pivot = (s) => [...DEVISES_VIA_USDC_AERODROME].find((x) => [...POOLS_PIVOTS_AERODROME].some(([k, v]) => k.split('|').includes(x) && v.symbole === 'USDC/' + s));
/* 2026-10-26 : EURC est BANNI (Phil) — la devise pivot d exemple a 6 decimales est AUDF (meme mecanisme) ; le bannissement a son banc,
 *   test-eurc-banni-20261026.mjs */
const AUDF = pivot('AUDF'), CBBTC = pivot('cbBTC');
const OUSD = String(DEVISES_BASE.find((d) => d.symbole === 'OUSD').adr).toLowerCase();
const TOSHI = String((DEVISES_BASE.find((d) => d.symbole === 'TOSHI') || {}).adr || '').toLowerCase();
ok(!!AUDF && !!CBBTC && DEVISES_VIA_USDC_AERODROME.has(WETH), 'les devises pivot se lisent dans la table epinglee');

console.log('— A. entreeVersBloc');
const t = [
  [AUDF, ETH, 'PIVOT_AERODROME'], [AUDF, USDC, 'PIVOT_AERODROME'], [CBBTC, ETH, 'PIVOT_AERODROME'], [CBBTC, USDC, 'PIVOT_AERODROME'],
  [WETH, ETH, 'PIVOT_AERODROME'], [WETH, USDC, 'PIVOT_AERODROME'], [WETH, WETH, 'DIRECT'], [CBBTC, CBBTC, 'DIRECT'],
  [ETH, USDC, 'V4'], [ETH, ETH, 'DIRECT'], [USDC, ETH, 'V4'], [USDC, USDC, 'DIRECT'], [OUSD, ETH, 'V4'], [OUSD, USDC, 'V4'],
  [AUDF, CBBTC, 'REFUS'], [ETH, CBBTC, 'REFUS'], [USDC, WETH, 'REFUS'],
  ...(TOSHI ? [[TOSHI, ETH, 'REFUS'], [TOSHI, USDC, 'REFUS']] : []),
];
for (const [de, quote, attendu] of t) {
  const r = R.entreeVersBloc({ de, quote });
  ok(r === attendu, 'A ' + R.nomJeton(de) + ' paie un block cote en ' + R.nomJeton(quote) + ' : ' + r + (r === attendu ? '' : ' (attendu ' + attendu + ')'));
}

console.log('— B. les mots du refus');
const pe = R.phraseRefusEntreeBloc(ETH), pu = R.phraseRefusEntreeBloc(USDC), pc = R.phraseRefusEntreeBloc(CBBTC);
ok(/trades against ETH:/.test(pe) && !/0x0{40}/.test(pe), 'B cote en ETH : « ' + pe + ' »');
ok(['USDC', 'OUSD', 'WETH', 'cbBTC', 'AUDF'].every((s) => pe.includes(s)) && !pe.includes('EURC'), 'B … et nomme ce qui le paie ici (USDC, OUSD, WETH, cbBTC, AUDF — jamais EURC)');
ok(/trades against USDC:/.test(pu) && ['ETH', 'OUSD', 'WETH', 'cbBTC', 'AUDF'].every((s) => pu.includes(s)) && !pu.includes('EURC'), 'B cote en USDC : « ' + pu + ' »');
ok(pc === 'this block trades against cbBTC: pay with that token', 'B cote en cbBTC : « ' + pc + ' » (pas de chemin mesure depuis une autre devise)');
ok(R.nomJeton(ETH) === 'ETH' && R.nomJeton(AUDF) === 'AUDF' && R.nomJeton(WETH) === 'WETH' && R.nomJeton(CBBTC) === 'cbBTC' && R.nomJeton(USDC) === 'USDC',
  'B nomJeton : ETH, AUDF, WETH, cbBTC, USDC');
const inconnu = '0xb200000000000000000000000000000000000abc';
ok(R.nomJeton(inconnu) === inconnu, 'B un jeton hors registres garde son adresse entiere');

console.log('— C. le lot, sans jumeau');
const src = fs.readFileSync(path.join(DIR, 'rails-api.js'), 'utf8').replace(/\r\n/g, '\n');
const appelsLot = src.match(/lotPivotUsdcVersBloc\(\{/g) || [];
ok(appelsLot.length === 2 && /via: 'actionAerodromeVersBloc'[\s\S]{0,40}jambe1/.test(src) && /via: 'deviseAerodromeVersBloc'[\s\S]{0,40}jambe1/.test(src),
  'C la 4 ter (action) et les devises pivot appellent LE MEME lot (2 appels de lotPivotUsdcVersBloc)');
ok((src.match(/fraisRouteurAilleurs: true, simulationDifferee: true/g) || []).length === 1, 'C une seule jambe 2 « fraisRouteurAilleurs + simulationDifferee » dans le fichier (aucune copie de la regle de frais)');
const brPivot = src.slice(src.indexOf("if (comment === 'PIVOT_AERODROME')"), src.indexOf("if (comment === 'PIVOT_AERODROME')") + 1200);
ok(/sortieCotee: cote/.test(brPivot) && /fraisAero \? \{\} : \{ fraisBps: 0n \}/.test(brPivot), 'C la jambe pivot porte le DEVIS (sortieCotee) et la meme bascule de frais que la 4 ter (0 bps quand le hook paie)');
ok(!/'this block trades against ' \+ quote\b/.test(src) && !/'this block trades against ' \+ quoteB \+/.test(src), 'C plus aucun refus qui imprime l adresse de la cotation telle quelle');

console.log('— D. faux noeud');
const COMPTE = '0x00000000000000000000000000000000c0ffee77';
const rpc = async (m) => (m === 'eth_blockNumber' ? '0x1' : '0x' + '0'.repeat(64 * 8));
for (const x of [AUDF, CBBTC, WETH]) {
  const r = await R.planRail({ de: x, vers: USDC, montant: '1000000', compte: COMPTE }, { rpc, clesDe: async () => [] });
  ok(r.etat === 'NON_MESURE' && /Aerodrome quote/.test(String(r.pourquoi)) && r.aSigner.length === 0, 'D ' + R.nomJeton(x) + ' > USDC, devis illisible : ' + r.etat + ' — ' + r.pourquoi);
}
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
