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
  /* audit rails R9 (2026-10-03) : echange.js rendait 300 ici ; HOOK_FEE() du V8 relu = 5000 / 1e6 */
  ok(p.resume && p.resume.fraisMarcheBps === 50, 'plan V8/ETH ' + sens + ' : fraisMarcheBps 50 (' + (p.resume && p.resume.fraisMarcheBps) + ')');
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

/* ══ 2026-10-02 (C2, F2) — LE BADGE DIT LE TAUX DU HOOK, PAS LE 3 % DU V1 ══ */
const srcLib = extraire('libelleFrais'), srcDyn = extraire('fraisEstDynamique');
const cst = (re) => { const m = html.match(re); return m ? Number(m[1]) : null; };
const PREVU_BPS = cst(/const HOOK_PREVU_FRAIS_BPS = (\d+);/), DYN = cst(/const FRAIS_DYNAMIQUE_V4 = (0x[0-9a-f]+);/i);
ok(!!srcLib && !!srcDyn && PREVU_BPS === 300 && DYN === 0x800000, 'libelleFrais, fraisEstDynamique et leurs constantes extraites d app.html');
/* ⛔ 2026-10-03 (audit rails R9) : UNE table, dans tokenomics.js. app.html l importe et ne la redefinit plus ;
 *   echange.js la lit pour `resume.fraisMarcheBps` (il rendait 300 sur V8). */
ok(!/function fraisHookBps\(/.test(html) && /import \{[^}]*\bfraisHookBps\b[^}]*\} from '\.\/tokenomics\.js'/.test(html),
  'app.html importe fraisHookBps de tokenomics.js et ne garde aucun jumeau local');
ok(T.fraisHookBps(T.HOOK_V8) === 50 && T.fraisHookBps(T.HOOK_PREVU) === 300 && T.fraisHookBps(T.HOOK_V7) === 300,
  'tokenomics.fraisHookBps : V8 50, V1/V7 300');
const fabriquerLib = (lib) => new Function('fraisHookBps', 'estNotreHook', 'HOOK_PREVU_FRAIS_BPS', 'FRAIS_DYNAMIQUE_V4',
  srcDyn + '\n' + lib + '\nreturn libelleFrais;')(T.fraisHookBps, T.estNotreHook, PREVU_BPS, DYN);
const libelleFrais = fabriquerLib(srcLib);
const badge = (c) => libelleFrais(c).court + ' · included'; /* la composition de l ecran, verifiee ci-dessous */
ok(/feeEl\.textContent = parHook \? libelleFrais\(p\.cle\)\.court \+ ' · included'/.test(html), 'le badge de l ecran compose bien libelleFrais(p.cle).court + « · included »');
ok(badge(v8Eth) === 'Fee 0.5% · included', 'BADGE V8 : « Fee 0.5% · included » (' + badge(v8Eth) + ')');
ok(libelleFrais({ ...v8Eth, hooks: T.HOOK_PREVU }).court === 'Fee 3%', 'V1 (HOOK_PREVU) : Fee 3%');
ok(libelleFrais({ ...v8Eth, hooks: T.HOOK_V7 }).court === 'Fee 3%' && libelleFrais({ ...v8Eth, hooks: T.HOOK_V2 }).court === 'Fee 3%', 'V2/V7 (HOOK_FEE 30 000) : Fee 3%');
ok(libelleFrais(nuEth).court === 'Fee 0.55%' && libelleFrais({ ...nuEth, hooks: INCONNU }).court === 'Fee 0.55%+', 'sans hook / hook tiers : inchanges');
/* MUTANT (en memoire) : le taux unique du V1 pour tout hook TB — le banc doit le voir */
const libMut = fabriquerLib(srcLib.replace('fraisHookBps(hk)', 'HOOK_PREVU_FRAIS_BPS'));
ok(srcLib.includes('fraisHookBps(hk)') && libMut(v8Eth).court === 'Fee 3%' && libMut(v8Eth).court !== libelleFrais(v8Eth).court,
  'MUTANT taux V1 pour tout hook : le badge V8 redevient « Fee 3% » et le banc le distingue');

/* ══ 2026-10-02 (Phil : UN frais par swap ; C2 F3) — LA GARDE DU FRANCHISSEMENT ACCEPTE UN FRAIS PAYE PAR LE HOOK ══
 * ⛔ On execute le VRAI bloc de garde d afficherFranchissement (extrait d app.html), sur de VRAIS plans de planFranchissement. */
const PF = await import(pathToFileURL(path.join(ICI, 'plan-franchissement.js')).href);
const PO = await import(pathToFileURL(path.join(ICI, 'pool.js')).href);
const { BPS_MAX } = await import(pathToFileURL(path.join(ICI, 'frais-degressif.js')).href);
/* (les accolades du parametre destructure empechent `extraire` : on borne le bloc par ses deux ancres, apres la definition) */
const i0 = html.indexOf('function afficherFranchissement(');
const iG = i0 < 0 ? -1 : html.indexOf('if (!estWalletDeFrais(compte)) {', i0), jG = iG < 0 ? -1 : html.indexOf('const sym = symPaye || (deviseDentree', iG); /* 2026-10-03 : ancre suivie (symPaye, vente block -> action) */
const garde = iG > 0 && jG > iG ? html.slice(iG, jG) : '';
ok(garde.length > 0 && /fraisPayeParHook\(/.test(garde) && /if \(!parHook && !parCl\)/.test(garde), 'garde du franchissement extraite : fraisPayeParHook + « !parHook && !parCl »');
const fabriquerGarde = (g) => new Function('r', 'pf', 'compte', 'estWalletDeFrais', 'feeWalletDansCalldata', 'fraisPayeParHook', 'BPS_MAX_UI', 'FEE_WALLET', 'refuser',
  g + '\nreturn "OK";');
const feeWalletDansCalldata = new Function('FEE_WALLET', src2 + '\nreturn feeWalletDansCalldata;')(FEE_WALLET);
const juge = (g, pf) => fabriquerGarde(g)(pf.resume, pf, compte, () => false, feeWalletDansCalldata, fraisPayeParHook, BPS_MAX, FEE_WALLET, () => 'REFUS');
const POOL_A = '0xa3b1e3f9747065e2073722ff4c9027d3ea4994f0', NVDA = '0xb20000000000000000000078ee7ce2fe4908108c';
const B20 = '0xb200000000000000000000000000000000000001';
const SEL = ['getPool(address,address,int24)', 'token0()', 'slot0()'].map((x) => '0x' + PO.selecteur(x));
const motA = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const rpcFr = async (m, p) => {
  if (m !== 'eth_call') return m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64);
  const d = String(p[0].data || '').toLowerCase();
  if (d.startsWith(SEL[0])) return '0x' + motA(parseInt(d.slice(10 + 128, 10 + 192), 16) === 10 ? POOL_A : ETH);
  if (d.startsWith(SEL[1])) return '0x' + motA(USDC);
  if (d.startsWith(SEL[2])) return '0x' + (2n ** 96n).toString(16).padStart(64, '0') + '0'.repeat(64 * 6);
  if (d.startsWith('0x' + PO.selecteur('getSlot0(bytes32)')) || d.startsWith('0x' + PO.selecteur('getLiquidity(bytes32)'))) return '0x' + '0'.repeat(256);
  return String(p[0].to || '').toLowerCase() === String(E.QUOTEUR[8453]).toLowerCase() ? q : '0x' + 'f'.repeat(128) + '0'.repeat(64);
};
const cleDe = (a, b, h) => { const [c0, c1] = a < b ? [a, b] : [b, a]; return h === ETH ? { currency0: c0, currency1: c1, fee: 500, tickSpacing: 10, hooks: h } : { currency0: c0, currency1: c1, fee: 0, tickSpacing: 200, hooks: h }; };
const planFr = (chemin) => PF.planFranchissement({ rpc: rpcFr, chaine: 8453, compte, chemin, devise: chemin[0].de, block: NVDA, montant: 10n ** 21n,
  decimalesEntree: 18, beneficiaireFrais: FEE_WALLET, fraisDevisesOk: new Set([NVDA]),
  resoudreV4: async ({ de, vers }) => { const c = cleDe(de, vers, de === B20 || vers === B20 ? T.HOOK_V8 : ETH); return { etat: 'OK', cle: c, zeroForOne: de === c.currency0, quote: 10n ** 18n }; } });
const frCl = await planFr([{ de: ETH, vers: USDC, famille: 'uniswap-v4' }, { de: USDC, vers: NVDA, famille: 'aerodrome' }]);
const frHook = await planFr([{ de: B20, vers: ETH, famille: 'uniswap-v4' }, { de: ETH, vers: USDC, famille: 'uniswap-v4' }, { de: USDC, vers: NVDA, famille: 'aerodrome' }]);
ok(frCl.etat === 'PRET' && frHook.etat === 'PRET', 'plans de franchissement PRET (CL : ' + frCl.etat + ', hook : ' + frHook.etat + ' ' + (frHook.pourquoi || '') + ')');
if (frCl.etat === 'PRET' && frHook.etat === 'PRET') {
  ok(juge(garde, frCl) === 'OK', 'ECRAN franchissement : frais unique sur la jambe CL -> accepte');
  ok(juge(garde, frHook) === 'OK', 'ECRAN franchissement : frais unique paye par le hook V8 -> accepte');
  const a6 = '0x' + FEE_WALLET.slice(2);
  ok(juge(garde, { ...frHook, appels: [frHook.appels[0], frHook.appels[1], { ...frHook.appels[2], data: frHook.appels[2].data + a6.slice(2) }] }) === 'REFUS',
    'TEMOIN hook payeur + a6cf dans la jambe 2 (double frais) -> refus');
  ok(juge(garde, { ...frCl, appels: [{ ...frCl.appels[0], data: frCl.appels[0].data + a6.slice(2) }, frCl.appels[1], frCl.appels[2]],
    resume: { ...frCl.resume, fraisJambe1: 1n, fraisBpsJambe1: 20n } }) === 'REFUS', 'TEMOIN ancienne forme (routeur V4 + sweep CL : 2 frais) -> refus');
  ok(juge(garde, { ...frHook, resume: { ...frHook.resume, hooksJambe1: [INCONNU] } }) === 'REFUS', 'TEMOIN drapeau hook mais aucun hook payeur -> refus');
  ok(juge(garde, { ...frCl, appels: [frCl.appels[0], frCl.appels[1], { ...frCl.appels[2], data: '0x00' }] }) === 'REFUS', 'TEMOIN jambe CL sans a6cf dans les octets (zero frais) -> refus');
  ok(juge(garde, { ...frCl, resume: { ...frCl.resume, jambesPayantes: 2 } }) === 'REFUS', 'TEMOIN jambesPayantes 2 -> refus');
  /* MUTANT (en memoire) : l ancienne exigence « frais CL » seule — le lot paye par le hook est refuse */
  ok(juge(garde.replace('if (!parHook && !parCl)', 'if (!parCl)'), frHook) === 'REFUS', 'MUTANT garde sans parHook : le lot paye par le hook est refuse (le banc le voit)');
}

console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
