/* test-market-buy-actions-20261003.mjs — LE MARKET ACHETE LES ACTIONS TOKENISEES QUE LA FICHE SAIT ACHETER.
 * ⛔ MESURE (prod, 2026-10-03) : 220 lignes, 34 « Buy » ; les 9 actions sur Aerodrome (GOOGLc, METAc, MSFTc, NVDAc…) n en
 *   avaient pas, alors que leur fiche de carte affiche « Buy » (ETH en une tx / USDC) avec notre frais de 0,1 % (sortie,
 *   sweepTokenWithFee). Ce banc : (A) le cablage, (B) le verdict applique aux VRAIES lignes servies par /api/trending. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const { verdictRoutage } = await import(pathToFileURL(path.join(ICI, 'routage.js')).href);
const { FRAIS_INTERFACE_BPS_CL } = await import(pathToFileURL(path.join(ICI, 'calldata-aerodrome.js')).href);
const P = await import(pathToFileURL(path.join(ICI, 'paires.js')).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');

/* A. cablage */
/* 2026-10-03 (soir) : + `achetableIci` — les 20 actions a pool v4 USDC (cles-v4-actions.js) rendent IN_APP ; la fiche sait les acheter. */
ok(/const vR = verdictRoutage\(\{ aMarche: true, dex: lA\.dex, poolAdr: lA\.poolAdr \}\);\n(\s+\/\*[^]*?\*\/\n)?\s+const actionRegistre = typeof STOCKS_BASE_BY_ADR !== 'undefined' && STOCKS_BASE_BY_ADR\.has\(String\(l\.adr \|\| ''\)\.toLowerCase\(\)\);\n\s+if \(liqOk && \(vR\.achetableEnEth \|\| vR\.achetableEnUsdc \|\| \(vR\.achetableIci && actionRegistre\)\)\) \{\n\s+return '<button type="button" class="bouton trAcheter" data-acheter-fiche="/.test(html),
  'ligne du Market : Buy si le MEME verdict que la fiche dit achetable (ETH, USDC, ou v4 lisible ici — actions du registre seulement), liquidite au seuil');
const iV = html.indexOf('const vR = verdictRoutage({ aMarche: true'), iF = html.indexOf('if (feeOk && liqOk) {');
ok(iF > 0 && iV > iF, 'le Buy v4 historique reste prioritaire (teste avant)');
ok(/const ficheBtn = e\.target\.closest\('\[data-acheter-fiche\]'\);/.test(html) && /etape\('achat_clic'\)[\s\S]{0,200}allerA\('map'\)/.test(html)
  && /\.bloc\[data-block="' \+ cibleF\.toLowerCase\(\)/.test(html) && /else void ouvrirProfil\(adr, sym\);/.test(html),
  'clic : compte l intention (achat_clic), ouvre la fiche de la carte, sinon le profil comme avant');
ok(FRAIS_INTERFACE_BPS_CL === 10n, 'frais de ce chemin : 10 bps (0,1 %) pris sur la sortie — ' + FRAIS_INTERFACE_BPS_CL + ' bps');

/* B. les vraies lignes */
try {
  const r = await fetch('https://tokenizedblock.space/api/trending', { headers: { 'x-ms-monitor': '1' } }).then((x) => x.json());
  const rows = Array.isArray(r) ? r : Object.values(r).find(Array.isArray);
  const v4 = rows.filter((l) => (l.liquiditeUsd || 0) >= 500 && verdictRoutage({ aMarche: true, dex: l.dex, poolAdr: l.poolAdr }).achetableIci);
  const v4Actions = v4.filter((l) => P.ACTIONS_COINBASE.some((a) => String(a.adr).toLowerCase() === String(l.adr).toLowerCase()));
  console.log('    lignes v4 IN_APP : ' + v4.length + ' · dont actions du registre (Buy via la fiche) : ' + v4Actions.map((l) => l.sym).join(' '));
  ok(v4Actions.length >= 10 && v4Actions.length < v4.length / 2, 'la borne « actions du registre » mord : ' + v4Actions.length + ' sur ' + v4.length + ' lignes v4');
  const fiche = rows.filter((l) => (l.liquiditeUsd || 0) >= 500 && (() => { const v = verdictRoutage({ aMarche: true, dex: l.dex, poolAdr: l.poolAdr }); return v.achetableEnEth || v.achetableEnUsdc; })());
  console.log('    lignes servies ' + rows.length + ' · nouveau Buy (fiche) : ' + fiche.map((l) => l.sym).join(' '));
  /* le verdict ouvre Aerodrome (ETH ou USDC) ET Uniswap v3 (USDC) : toutes hors v4, sur une pool a adresse de contrat */
  ok(fiche.length > 0 && fiche.every((l) => /^0x[0-9a-f]{40}$/i.test(String(l.poolAdr || ''))), 'des lignes reelles gagnent un Buy, toutes hors v4 (pool a adresse de contrat) : ' + fiche.length);
  const vol = fiche.reduce((s, l) => s + (l.volume24hUsd || 0), 0);
  console.log('    volume 24 h de ces lignes : ' + Math.round(vol) + ' $');
} catch (err) { ok(false, 'trending illisible — NON MESURE : ' + String(err && err.message).slice(0, 80)); }
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0; /* pas process.exit : sous Windows il plante (UV_HANDLE_CLOSING) si un socket se ferme encore */
