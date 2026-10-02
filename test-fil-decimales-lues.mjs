/* test-fil-decimales-lues.mjs — LE FIL DOIT CONNAITRE LES DECIMALES POUR DIRE UN MONTANT.
 *
 * ⛔⛔ 2026-10-02 (Phil : « check le feed ») : 5 359 evenements lus en prod, 100 % « amount not read ». Les habitants
 *   (actions, blocks de la carte) partaient avec `dec: null` ecrit en dur dans blocksSuivisLive ; fil-live.js ne
 *   formate une quantite que si les decimales sont connues. Correctif : decimals() LU sur la chaine, en cache.
 * On teste les VRAIES fonctions d app.html (extraites), avec un rpc simule. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };

const extraire = (debut, nom) => {
  const i = html.indexOf(debut + nom + '(');
  if (i < 0) return null;
  let prof = 0;
  for (let k = html.indexOf('{', i); k < html.length; k += 1) {
    if (html[k] === '{') prof += 1; else if (html[k] === '}') { prof -= 1; if (prof === 0) return html.slice(i, k + 1); }
  }
  return null;
};
const sLire = extraire('async function ', 'lireDecimalesManquantes');
const sSuivis = extraire('function ', 'blocksSuivisLive');
ok(!!sLire && !!sSuivis, 'lireDecimalesManquantes et blocksSuivisLive extraites d app.html');
ok(!/dec: null \}\);\n\s+\}\n\s+return \[\.\.\.m\.values\(\)\];/.test(sSuivis), 'plus aucun `dec: null` ecrit en dur pour les habitants');
{
  const iLit = html.indexOf('await lireDecimalesManquantes(blocksSuivisLive());');
  const iEv = html.indexOf('const r = await evenementsLive({ rpc, poolManager: V.poolm, blocks: blocksSuivisLive()');
  ok(iLit > 0 && iEv > iLit && iEv - iLit < 600, 'les decimales sont lues AVANT evenementsLive, dans le meme tour');
}

const AAPL = '0xb200000000000000000000c2e324d24d7eecd1fb', BLOC = '0xb2ffffffffffffffffffffffffffffffffffff01', MUET = '0x' + '7'.repeat(40);
function monde(reponses) {
  const appels = [];
  const rpc = async (m, p) => { appels.push(p[0].to); const r = reponses[p[0].to.toLowerCase()]; if (r instanceof Error) throw r; return r; };
  const fab = new Function('rpc', 'creationsLues', 'creationsLive', 'habitants', 'DECIMALES_PAR_TOUR',
    'const decimalesLues = new Map();\n' + sLire + '\n' + sSuivis + '\nreturn { lireDecimalesManquantes, blocksSuivisLive, decimalesLues };');
  return { appels, ...fab(rpc, [], new Map(), [{ adr: AAPL, sym: 'AAPLc' }, { adr: BLOC, sym: 'BLOC' }, { adr: MUET, sym: 'MUET' }], 12) };
}
const hex = (d) => '0x' + d.toString(16).padStart(64, '0');

const w = monde({ [AAPL]: hex(8), [BLOC]: hex(18), [MUET]: new Error('429 over rate limit') });
const avant = w.blocksSuivisLive();
ok(avant.every((b) => b.dec === null), 'TEMOIN avant lecture : decimales inconnues (le defaut de prod)');
await w.lireDecimalesManquantes(avant);
const apres = Object.fromEntries(w.blocksSuivisLive().map((b) => [b.sym, b.dec]));
ok(apres.AAPLc === 8 && apres.BLOC === 18, 'apres lecture : AAPLc 8, block 18 (' + JSON.stringify(apres) + ')');
ok(apres.MUET === null, 'lecture ratee (429) -> null, jamais 0 ni 18 invente');
const nAppels = w.appels.length;
await w.lireDecimalesManquantes(w.blocksSuivisLive());
ok(w.appels.length === nAppels + 1 && w.appels[w.appels.length - 1] === MUET, 'tour suivant : seul le jeton non lu est relu (cache), ' + (w.appels.length - nAppels) + ' appel');

const fou = monde({ [AAPL]: '0xzz', [BLOC]: hex(999), [MUET]: hex(6) });
await fou.lireDecimalesManquantes(fou.blocksSuivisLive());
const f = Object.fromEntries(fou.blocksSuivisLive().map((b) => [b.sym, b.dec]));
ok(f.AAPLc === null && f.BLOC === null && f.MUET === 6, 'reponse illisible ou absurde (999) -> null ; 6 accepte');

/* plafond par tour */
const beaucoup = new Function('rpc', 'creationsLues', 'creationsLive', 'habitants', 'DECIMALES_PAR_TOUR',
  'const decimalesLues = new Map();\n' + sLire + '\n' + sSuivis + '\nreturn { lireDecimalesManquantes, blocksSuivisLive };');
let nb = 0;
const hab = Array.from({ length: 40 }, (_, i) => ({ adr: '0x' + (i + 1).toString(16).padStart(40, '0'), sym: 'T' + i }));
const b = beaucoup(async () => { nb += 1; return hex(18); }, [], new Map(), hab, 12);
await b.lireDecimalesManquantes(b.blocksSuivisLive());
ok(nb === 12, 'au plus 12 lectures par tour (le noeud public rend des 429) — vu ' + nb);

/* ── un evenement lu trop tot est COMPLETE quand ses decimales arrivent ── */
const { completerQuantite } = await import(new URL('./fil-live.js', import.meta.url).href);
const { formaterUnites } = await import(new URL('./montants.js', import.meta.url).href);
const swap = { quantite: null, brut: { v: '12773640280000000000000000', forme: 'unites' } };
ok(completerQuantite(swap, 18) === true && swap.quantite === formaterUnites(12773640280000000000000000n, 18) && swap.brut === null,
  'swap lu trop tot -> complete avec le meme formateur (' + swap.quantite + ')');
const env = { quantite: null, brut: { v: '150000000', forme: 'brut' } };
ok(completerQuantite(env, 8) === true && env.quantite === '1.5', 'transfert (8 decimales) -> 1.5');
const deja = { quantite: '3', brut: null };
ok(completerQuantite(deja, 18) === false && deja.quantite === '3', 'TEMOIN : un montant deja lu n est jamais reecrit');
const sansDec = { quantite: null, brut: { v: '5', forme: 'brut' } };
ok(completerQuantite(sansDec, undefined) === false && sansDec.quantite === null, 'TEMOIN : sans decimales lues, rien n est invente');
ok(/for \(const e of liveEvts\) completerQuantite\(e, decimalesLues\.get\(/.test(html), 'app.html complete le fil apres chaque lecture de decimales');

console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
