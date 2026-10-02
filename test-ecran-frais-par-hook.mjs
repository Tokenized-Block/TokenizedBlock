/* test-ecran-frais-par-hook.mjs — LE PLAN DIT « LE HOOK A PAYE », L ECRAN DOIT L ACCEPTER, ET RIEN D AUTRE.
 *
 * ⛔⛔ KO PROD 2026-10-02 (trouve par Grok Super, confirme dans le code) : les gardes de l ecran Buy/Sell
 *   exigeaient fraisBps = 0,5 % et frais > 0 SANS exception. Le plan, lui, met le routeur a 0 quand le hook paie
 *   deja a6cf (« une fois par swap »). Resultat : TOUT Buy/Sell V8 s arretait sur « could not be prepared safely ».
 *   Les bancs du plan etaient verts : AUCUN ne passait le plan a l ecran. Ce banc le fait.
 * ⛔ On teste la VRAIE fonction de l ecran (fraisPayeParHook), extraite d app.html — pas une copie.
 * ⚠️ NE PROUVE PAS un swap reel : quoter simule. Il garde l ACCORD entre la decision du plan et celle de l ecran. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const E = await import(pathToFileURL(path.join(ICI, 'echange.js')).href);
const T = await import(pathToFileURL(path.join(ICI, 'tokenomics.js')).href);
const { FEE_WALLET, USDC_BASE } = await import(pathToFileURL(path.join(ICI, 'frais-creation.js')).href);
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };

/* ── la VRAIE fonction de l ecran ── */
const extraire = (nom) => {
  const i = html.indexOf('function ' + nom + '(');
  if (i < 0) return null;
  let j = html.indexOf('{', i), prof = 0;
  for (let k = j; k < html.length; k += 1) {
    if (html[k] === '{') prof += 1; else if (html[k] === '}') { prof -= 1; if (prof === 0) return html.slice(i, k + 1); }
  }
  return null;
};
const src1 = extraire('fraisPayeParHook'), src2 = extraire('feeWalletDansCalldata');
ok(!!src1 && !!src2, 'fraisPayeParHook et feeWalletDansCalldata extraites d app.html');
const fraisPayeParHook = new Function('FEE_WALLET', 'HOOKS_PAIENT_DEJA_A6CF',
  src2 + '\n' + src1 + '\nreturn fraisPayeParHook;')(FEE_WALLET, T.HOOKS_PAIENT_DEJA_A6CF);

/* ── les gardes l utilisent bien (et pas seulement la definition) ── */
ok(/const parHook = fraisPayeParHook\(r, p\.tx, \[p\.cle && p\.cle\.hooks\]\);\n\s+if \(!parHook && \(!bpsOk \|\| !destOk \|\| !fraisOk\)\)/.test(html),
  'garde swap simple : refus seulement si !parHook');
ok(/if \(!parHook && p\.tx && !feeWalletDansCalldata\(p\.tx\)\)/.test(html), 'jumeau calldata du swap simple : idem');
ok(/const parHook = fraisPayeParHook\(r, p\.tx, \(\(b && b\.sauts\) \|\| \[\]\)\.map/.test(html)
  && /if \(!parHook && \(!tauxOk \|\| !destOk \|\| !fraisOk \|\| !octetsOk\)\)/.test(html), 'garde multi-sauts : idem');

/* ── de VRAIS plans ── */
const ETH = '0x' + '0'.repeat(40), USDC = USDC_BASE.toLowerCase();
const BLOC = '0xb2ffffffffffffffffffffffffffffffffffff01';
const q = '0x' + (10n ** 18n).toString(16).padStart(64, '0') + '0'.repeat(64);
const rpc = async (m) => (m === 'eth_call' ? q : m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64));
const compte = '0x' + '4'.repeat(40);
const v8Eth = { currency0: ETH, currency1: BLOC, fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 };
const nuEth = { ...v8Eth, fee: 500, tickSpacing: 10, hooks: ETH };
const INCONNU = '0x' + '1'.repeat(36) + '00cc';

for (const sens of ['ACHAT', 'VENTE']) {
  const p = await E.planEchange({ rpc, chaine: 8453, jeton: BLOC, compte, sens, montant: 10n ** 15n,
    marcheLu: { etat: 'LUE', cle: v8Eth, paire: 'ETH' } });
  ok(['PRET', 'APPROBATIONS'].includes(p.etat) && p.resume && p.resume.fraisParHook === true && p.resume.fraisBps === 0n,
    'plan V8/ETH ' + sens + ' : PRET, fraisParHook, 0 bps (' + p.etat + ' ' + (p.pourquoi || '') + ')');
  ok(fraisPayeParHook(p.resume, p.tx, [p.cle && p.cle.hooks]) === true, 'ECRAN : V8/ETH ' + sens + ' accepte (le KO de prod)');
}
/* temoin : pool SANS hook -> le routeur prend 0,5 %, pas de drapeau, l ecran garde l ancienne regle */
/* temoin : hook HORS liste -> le routeur prend son frais, pas de drapeau (une pool SANS hook est refusee plus tot) */
const pNu = await E.planEchange({ rpc, chaine: 8453, jeton: BLOC, compte, sens: 'ACHAT', montant: 10n ** 15n,
  marcheLu: { etat: 'LUE', cle: { ...v8Eth, hooks: INCONNU }, paire: 'ETH' } });
ok(pNu.etat === 'PRET' && pNu.resume && pNu.resume.fraisParHook !== true && pNu.resume.frais > 0n
  && fraisPayeParHook(pNu.resume, pNu.tx, [INCONNU]) === false,
  'TEMOIN hook hors liste : PRET avec frais routeur, aucun drapeau, l ecran garde l ancienne regle (' + pNu.etat + ' ' + (pNu.pourquoi || '') + ')');

/* multi-sauts : USDC -> ETH (sans hook) -> block (V8) */
const ms = await E.planEchangeMultiSauts({ rpc, chaine: 8453, compte, entree: USDC, sortie: BLOC, montant: 50n * 10n ** 6n,
  decimalesEntree: 6, prixUsdEntree: 1,
  sauts: [{ cle: { currency0: ETH, currency1: USDC, fee: 500, tickSpacing: 10, hooks: ETH }, zeroForOne: false }, { cle: v8Eth, zeroForOne: true }] });
const hooksMs = [ETH, T.HOOK_V8];
ok(['PRET', 'APPROBATIONS'].includes(ms.etat) && ms.resume && ms.resume.fraisParHook === true,
  'plan multi-sauts USDC>ETH>block(V8) : drapeau pose (' + ms.etat + ' ' + (ms.pourquoi || '') + ')');
ok(fraisPayeParHook(ms.resume, ms.tx, hooksMs) === true, 'ECRAN multi-sauts : accepte');

/* ── l ecran ne se laisse pas tromper : chaque incoherence -> refus ── */
const bon = { fraisParHook: true, fraisBps: 0n, frais: 0n, beneficiaireFrais: null };
ok(fraisPayeParHook(bon, { data: '0x00' }, [T.HOOK_V8]) === true, 'resume coherent + hook payeur -> accepte');
ok(fraisPayeParHook({ ...bon, fraisParHook: undefined }, null, [T.HOOK_V8]) === false, 'TEMOIN sans drapeau -> refus (0 bps du wallet de frais ne suffit pas)');
ok(fraisPayeParHook(bon, null, [INCONNU, ETH]) === false, 'TEMOIN drapeau mais AUCUN hook de la liste -> refus');
ok(fraisPayeParHook({ ...bon, fraisBps: 50n }, null, [T.HOOK_V8]) === false, 'TEMOIN drapeau + 50 bps -> refus');
ok(fraisPayeParHook({ ...bon, frais: 1n }, null, [T.HOOK_V8]) === false, 'TEMOIN drapeau + frais routeur > 0 -> refus');
ok(fraisPayeParHook({ ...bon, beneficiaireFrais: FEE_WALLET }, null, [T.HOOK_V8]) === false, 'TEMOIN drapeau + beneficiaire routeur -> refus');
ok(fraisPayeParHook(bon, { data: '0x' + FEE_WALLET.slice(2) }, [T.HOOK_V8]) === false, 'TEMOIN drapeau + a6cf dans le calldata (double frais) -> refus');

console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
