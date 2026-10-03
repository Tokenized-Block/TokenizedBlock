/* test-memestock-paires-20261003.mjs — UN BLOCK APPAIRE A UNE ACTION (MEMESTOCK) : on n ouvre que ce que le hook admet.
 *
 * ⛔⛔ MESURE DU 2026-10-03 (prod) : le selecteur « Pair » du Create ouvrait 37 actions et 40 blocks vivants ; le hook de
 *   lancement (V8, liste FIGEE) n admet que ETH, USDC, cbBTC et 10 actions — deviseAdmise() lu : NVDAc true, AMDc false,
 *   6 blocks vivants du Market false. Un Create appaire au reste revertait APRES le clic.
 * A. la regle (hookDeLancementPour) : les 10 lancables, AMDc non. B. TEMOIN ON-CHAIN (lecture) : le hook V8 dit la meme
 *   chose — si le contrat changeait, ce banc le verrait. C. app.html : selecteur et garde de majPaire branches sur la regle. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const P = await imp('paires.js');
const T = await imp('tokenomics.js');
const PO = await imp('pool.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const adr = (s) => P.ACTIONS_COINBASE.find((a) => a.symbole === s).adr;

/* ── A. la regle ── */
/* 2026-10-03 : le 7030 (62 devises) est DEPLOYE et le drapeau ALLUME — les 58 actions du registre sont lancables (sur 7030).
 *   Le temoin « V8 seul » (10) se joue avec les options SANS h7030. */
const SANS_7030 = { v9: T.OPTIONS_LANCEMENT.v9 === true };
const lancablesV8 = P.ACTIONS_COINBASE.filter((a) => P.hookDeLancementPour(a.adr, 8453, SANS_7030)).map((a) => a.symbole).sort();
ok(JSON.stringify(lancablesV8) === JSON.stringify(['AAPLc', 'AMZNc', 'GOOGLc', 'METAc', 'MSFTc', 'MSTRc', 'NVDAc', 'SNDKc', 'SPCXc', 'TSLAc']),
  'TEMOIN sans 7030 : 10 actions lancables (V8) : ' + lancablesV8.join(' '));
const lancables = P.ACTIONS_COINBASE.filter((a) => P.hookDeLancementPour(a.adr, 8453, T.OPTIONS_LANCEMENT) === '7030').map((a) => a.symbole);
ok(T.OPTIONS_LANCEMENT.h7030 === true && lancables.length === 58, 'drapeau allume : les 58 actions du registre sont lancables sur le 7030 (' + lancables.length + ')');
ok(!P.hookDeLancementPour(adr('AMDc'), 8453, SANS_7030), 'AMDc : pas lancable sur le V8 seul');
ok(P.hookDeLancementPour(adr('AMDc'), 8453, T.OPTIONS_LANCEMENT) === '7030', 'AMDc : lancable sur le 7030 (la liste s elargit seule)');

/* ── B. temoin on-chain ── */
const sel = PO.selecteur('deviseAdmise(address)');
const lire = async (a) => {
  for (let e = 0; e < 4; e += 1) {
    try {
      const r = await fetch('https://mainnet.base.org', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: T.HOOK_V8, data: '0x' + sel + a.toLowerCase().slice(2).padStart(64, '0') }, 'latest'] }) }).then((x) => x.json());
      if (r.result) return BigInt(r.result) === 1n;
    } catch (_) {}
    await new Promise((o) => setTimeout(o, 700 * (e + 1)));
  }
  return null;
};
const vN = await lire(adr('NVDAc')), vA = await lire(adr('AMDc'));
ok(vN === true && vA === false, 'hook V8 sur la chaine : deviseAdmise(NVDAc)=' + vN + ', deviseAdmise(AMDc)=' + vA + ' (null = non lu, jamais un vert)');

/* ── C. app.html ── */
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
ok(/function estPaireLancable\(adr\) \{\n\s+return Number\(CHAINE\) !== 8453 \|\| !!hookDeLancementPour\(adr, CHAINE, OPTIONS_LANCEMENT\);/.test(html), 'estPaireLancable = la regle de lancement, mainnet seulement');
ok(/const lancable = estPaireLancable;/.test(html) && /p\.type === 'ACTION'\) && lancable\(p\.adr\)\)/.test(html), 'selecteur : une action n est ouverte que si elle est lancable');
ok(/const okB = deviseOk && lancable\(b\.adr\);/.test(html), 'selecteur : un block vivant n est ouvert que s il est lancable');
ok(/memestock/.test(html) && /\.sort\(\(a, b\) => Number\(lancable\(b\.adr\)\) - Number\(lancable\(a\.adr\)\)\)/.test(html), 'les lancables en tete, groupe « memestock »');
const iGarde = html.indexOf("if (Number(CHAINE) === 8453 && !hookDeLancementPour(q.paire.adr, CHAINE, OPTIONS_LANCEMENT))");
const iLecture = html.indexOf('try { f = await faitsDuBlock({ rpc, jeton: q.paire.adr');
ok(iGarde > 0 && iLecture > iGarde, 'majPaire : la garde du hook passe AVANT la lecture on-chain, et dit « Nothing was sent »');
/* symbolesLancables, extraite et executee */
const i0 = html.indexOf('function symbolesLancables()');
let src = null; if (i0 >= 0) { let p = 0; for (let k = html.indexOf('{', i0); k < html.length; k += 1) { if (html[k] === '{') p += 1; else if (html[k] === '}') { p -= 1; if (p === 0) { src = html.slice(i0, k + 1); break; } } } }
const sl = new Function('pairesProposees', 'estPaireLancable', 'CHAINE', src + '\nreturn symbolesLancables;')(
  P.pairesProposees, (a) => !!P.hookDeLancementPour(a, 8453, T.OPTIONS_LANCEMENT), 8453);
ok(sl().length === 58 && sl().includes('NVDAc') && sl().includes('AMDc'), 'le message de refus (hors Base) liste les 58 lancables : ' + sl().length);
const slV8 = new Function('pairesProposees', 'estPaireLancable', 'CHAINE', src + '\nreturn symbolesLancables;')(
  P.pairesProposees, (a) => !!P.hookDeLancementPour(a, 8453, SANS_7030), 8453);
ok(slV8().length === 10 && !slV8().includes('AMDc'), 'TEMOIN sans 7030 : la meme fonction en liste 10');

console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
