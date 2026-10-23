/* test-market-pair-actions-20261017.mjs - UNE LIGNE D ACTION TOKENISEE DU MARKET OFFRE « Buy » ET « Pair a block with it ».
 * ? Phil (2026-10-17) : « ajoute bouton buy et paired with it » - les lignes SNDKc, METAc, SPCXc, AAPLc. n avaient QUE « Buy » :
 *   la fonction de la ligne rendait UN SEUL bouton (return au premier Buy), « Pair » n etait que le repli des lignes sans Buy.
 *   Or une action est LA paire du modele memestock. Regle : une ligne qui a un marche achetable garde Buy ; toute ligne B20 (0xb2.)
 *   qui n est pas TBLOCK offre Pair, par le MEME chemin (data-pairer -> pairerAvec -> Create, paire preselectionnee).
 * Ce banc EXTRAIT la fonction de rendu des boutons d app.html et l EXECUTE sur des lignes reelles (adresses du registre, pools
 * mesurees de /api/trending du 2026-10-17), puis execute pairerAvec contre un faux selecteur. Aucun reseau. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const { verdictRoutage, raisonSansBuy } = await imp('routage.js');
const { avecPoolAction } = await imp('pools-actions-aerodrome.js');
const { ACTIONS_COINBASE } = await imp('paires.js');
const { TBLOCK } = await imp('tokenomics.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');

/* A. la fonction des boutons de ligne, extraite de peindreTrending */
const iP = html.indexOf('function peindreTrending() {');
const iI = html.indexOf('<div class="trInfo">', iP);
const i0 = html.indexOf('(function () {', iI);
const i1 = html.indexOf("})() + '</li>'", i0);
ok(iP > 0 && iI > iP && i0 > iI && i1 > i0, 'la fonction des boutons de ligne est trouvee dans peindreTrending');
const src = html.slice(i0, i1 + 4);
const ACTIONS_PAR_ADR = new Set(ACTIONS_COINBASE.map((a) => String(a.adr).toLowerCase()));
const enTexte = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let pools = new Map();
const poolDecouvertPour = (adr) => pools.get(String(adr).toLowerCase()) || null;
const rendre = new Function('l', 'poolDecouvertPour', 'avecPoolAction', 'verdictRoutage', 'ACTIONS_PAR_ADR', 'LIQ_MIN_BUY_USD', 'enTexte', 'TBLOCK', 'raisonSansBuy',
  'return ' + src + ';');
const boutons = (l) => rendre(l, poolDecouvertPour, avecPoolAction, verdictRoutage, ACTIONS_PAR_ADR, 500, enTexte, TBLOCK, raisonSansBuy);
const a = (sym) => ACTIONS_COINBASE.find((x) => x.symbole === sym).adr;
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
/* lignes reelles (prod /api/trending, 2026-10-17) - pools Aerodrome mesurees */
const actions = [
  { sym: 'SNDKc', adr: a('SNDKc'), dex: 'aerodrome', poolAdr: '0x5a8236f575471e7bfca2c8462a200c28f737246e', liquiditeUsd: 1474981, quoteAdr: USDC },
  { sym: 'ULc', adr: '0xb200000000000000000000349ef3aa93a0897476', dex: 'aerodrome', poolAdr: '0x518639e37e01849f8b9710e7444b199c1175d16d', liquiditeUsd: 9466, quoteAdr: USDC },
];
for (const s of ['METAc', 'SPCXc', 'AAPLc', 'MSFTc', 'PLTRc', 'GOOGLc', 'SKHYc']) {
  const l = avecPoolAction({ sym: s, adr: a(s), liquiditeUsd: 100000, quoteAdr: USDC });
  if (l && l.poolAdr) actions.push(l);
}
ok(actions.length >= 6, 'au moins 6 actions de la liste de Phil ont une pool mesuree : ' + actions.map((l) => l.sym).join(' '));
for (const l of actions) {
  const h = boutons(l);
  ok(/data-acheter(-fiche)?="/.test(h) && />Buy</.test(h), l.sym + ' : garde « Buy »');
  ok(h.includes('data-pairer="' + l.adr + '"') && /Pair a block with it/.test(h), l.sym + ' : offre AUSSI « Pair a block with it » (data-pairer = son adresse)');
}
/* un block TB sur notre hook (Buy v4 historique) : Buy + Pair (un block se paire « through its currency », regle du 2026-10-04) */
const blocV4 = { sym: 'RIBBIT', adr: '0xb2000000000000000000001111111111111111aa', dex: 'uniswap', liquiditeUsd: 20000 };
pools.set(blocV4.adr.toLowerCase(), { confiance: 'NOTRE', isTbFeeHook: true });
{ const h = boutons(blocV4); ok(/data-acheter="/.test(h) && h.includes('data-pairer="' + blocV4.adr + '"'), 'block achetable sur notre hook : Buy ET Pair'); }
/* un block sans marche achetable : Pair seul, comme avant */
const blocMince = { sym: 'rdstr', adr: '0xb2000000000000000000002222222222222222bb', dex: 'uniswap', liquiditeUsd: 600 };
{ const h = boutons(blocMince); ok(!/>Buy</.test(h) && h.includes('data-pairer="' + blocMince.adr + '"') && /cannot be quoted/.test(h), 'block sans Buy : « Pair a block with it » + la raison d avant (NON_COTEE), jamais une note vide'); }
/* ⛔ 2026-10-23 — ligne REELLE de prod (/api/trending 18:2xZ) : ORCLc, dex « aero », pool 0x62b5…8eb5 dont factory() = 0x9cb2…7a76
 *   (pas celle de notre routeur). Pas de Buy, et la raison DITE est la vraie : pas « empty / third-party hook ». */
{ const orcl = { sym: 'ORCLc', adr: a('ORCLc'), dex: 'aero', poolAdr: '0x62b5452e80e50b047dcf6dd3fb6a1d266c678eb5', liquiditeUsd: 206136, quoteAdr: USDC };
  const h = boutons(orcl);
  ok(!/>Buy</.test(h) && /newer pool factory \(&quot;aero&quot;\), which the router this app uses cannot address/.test(h) && !/empty, or a third-party hook/.test(h) && h.includes('data-pairer="' + orcl.adr + '"'),
    'ORCLc sur « aero » : pas de Buy, raison « newer pool factory (aero) » echappee (pas « empty / hook »), Pair garde'); }
{ const h = boutons({ sym: 'thin', adr: '0xb2000000000000000000003333333333333333cc', dex: 'aerodrome', poolAdr: '0x518639e37e01849f8b9710e7444b199c1175d16d', liquiditeUsd: 120 });
  ok(!/>Buy</.test(h) && /less than \$500 of liquidity/.test(h), 'pool Aerodrome achetable mais sous 500 $ : la raison est le seuil'); }
/* TBLOCK : jamais propose a l appairage (bloque dans l app), meme achetable */
pools.set(TBLOCK.toLowerCase(), { confiance: 'NOTRE', isTbFeeHook: true });
{ const h = boutons({ sym: 'TBLOCK', adr: TBLOCK, dex: 'uniswap', liquiditeUsd: 50000 }); ok(!/data-pairer/.test(h), 'TBLOCK : pas de « Pair »'); }
{ const h = boutons({ sym: 'TBLOCK', adr: TBLOCK, dex: 'uniswap', liquiditeUsd: 10 }); ok(!/data-pairer/.test(h), 'TBLOCK sans Buy : pas de « Pair » non plus'); }
/* un jeton qui n est pas un B20 (0xb2.) ne peut pas etre la paire d un block : pas de Pair */
{ const h = boutons({ sym: 'X', adr: '0x1234567890123456789012345678901234567890', dex: 'uniswap', liquiditeUsd: 10 }); ok(!/data-pairer/.test(h), 'jeton non B20 : pas de « Pair »'); }

/* B. le clic : data-pairer passe par pairerAvec AVANT le Buy, et pairerAvec preselectionne l action dans #cPaire */
ok(/const pr = e\.target\.closest\('\[data-pairer\]'\);\n\s+if \(pr\) \{\n\s+try \{ etape\('pairer_clic'\); \} catch \(_\) \{\}\n\s+pairerAvec\(pr\.getAttribute\('data-pairer'\)\);/.test(html),
  'clic Pair : etape pairer_clic puis pairerAvec(adresse) - le chemin existant, reutilise');
{
  const j0 = html.indexOf('function pairerAvec(adr) {'), fin = /\r?\n\}\r?\n/g; fin.lastIndex = j0; const mF = fin.exec(html), j1 = mF ? mF.index + mF[0].length : -1;
  ok(j0 > 0 && j1 > j0, 'pairerAvec est defini');
  const evts = [];
  const opts = [{ value: '0x0000000000000000000000000000000000000000' }, { value: a('SNDKc') }, { value: '__autre__' }];
  const sel = { options: opts, value: opts[0].value, dispatchEvent: (e) => evts.push(e.type), closest: () => ({ open: false, scrollIntoView() {} }), scrollIntoView() {} };
  const autre = { value: '' };
  const vus = [];
  const $ = (q) => (q === '#cPaire' ? sel : q === '#cPaireAutre' ? autre : null);
  const document = { querySelector: (q) => (q === '[data-cmode="block"]' ? { click: () => vus.push('mode-block') } : null) };
  const allerA = (t) => vus.push('aller:' + t);
  const f = new Function('$', 'document', 'allerA', 'AUTRE_PAIRE', 'Event', html.slice(j0, j1) + '\nreturn pairerAvec;')($, document, allerA, '__autre__', class { constructor(t) { this.type = t; } });
  const r = f(a('SNDKc').toUpperCase().replace('0X', '0x'));
  ok(r === true && vus[0] === 'aller:creer' && vus.includes('mode-block') && sel.value === a('SNDKc') && evts.includes('change') && autre.value === '',
    'Pair sur SNDKc : onglet Create, mode block, #cPaire = SNDKc (option du registre, pas « paste address »), change emis');
}
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
