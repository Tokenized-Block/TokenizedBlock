/* 2026-10-10 - revue adverse de Claude, point 1 : route 4 ter (rails-api.js) ne doit JAMAIS facturer deux frais.
 *   Bug (6549231) : `hookPaie` lu sur la 1re tentative ; si la jambe v4 revenait NON_MESURE, on rebatissait avec le frais Aerodrome
 *   (10 bps) et une 2e tentative PRET + fraisParHook passait : deux frais, resume `fraisParHook:false`.
 *   Banc hors ligne : rails-api.js copie dans un dossier temporaire, ses voisins re-exportes, et 4 modules remplaces par des stubs. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };

const src = fs.readFileSync(path.join(ICI, 'rails-api.js'), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-4ter-'));
fs.writeFileSync(path.join(dir, 'rails-api.js'), src);
const url = (f) => pathToFileURL(path.join(ICI, f)).href;
const STUBS = {
  'echange.js': `export * from '${url('echange.js')}';
export async function planEchangeMultiSauts(a) { const S = globalThis.__S4; S.v4.push(a); return S.repV4.shift() || { etat: 'NON_MESURE', pourquoi: 'stub vide' }; }`,
  'plan-aerodrome-segment.js': `export * from '${url('plan-aerodrome-segment.js')}';
export async function planAerodromeSegment(a) { const S = globalThis.__S4; S.aero.push(a); const bps = a.fraisBps === 0n ? 0 : 10;
  return { etat: 'PRET', appels: [{ role: 'aero' }], resume: { recoitAuMoins: '990000', fraisBps: bps } }; }`,
  'sauts-depuis-chemin.js': `export * from '${url('sauts-depuis-chemin.js')}';
export async function sautsDepuisChemin() { return { etat: 'OK', sauts: [{}] }; }`,
  'marche.js': `export * from '${url('marche.js')}';
export async function vieDuBlock({ jeton }) { return { etat: 'LUE', cle: { currency0: globalThis.__S4.USDC, currency1: jeton, fee: 0, tickSpacing: 60, hooks: '0x' + '1'.repeat(40) } }; }`,
};
for (const m of src.matchAll(/from '\.\/([^']+)'/g)) {
  const f = m[1];
  fs.writeFileSync(path.join(dir, f), STUBS[f] || `export * from '${url(f)}';\n`);
}
const { USDC_BASE } = await import(url('frais-creation.js'));
const { POOLS_ACTIONS_AERODROME } = await import(url('pools-actions-aerodrome.js'));
const ACTION = String([...POOLS_ACTIONS_AERODROME.keys()][0]).toLowerCase();
const BLOCK = '0xb200000000000000000000000000000000000001', COMPTE = '0x00000000000000000000000000000000c0ffee77';
const R = await import(pathToFileURL(path.join(dir, 'rails-api.js')).href);
const PRET = (hook) => ({ etat: 'PRET', etapes: [], tx: { to: '0x1', data: '0x' }, resume: { recoitAuMoins: '5', fraisBps: hook ? 0 : 0, fraisParHook: hook, fraisMarcheBps: hook ? 10 : 0 } });
async function cas(repV4) {
  globalThis.__S4 = { USDC: USDC_BASE.toLowerCase(), repV4: [...repV4], v4: [], aero: [] };
  const r = await R.planRail({ de: ACTION, vers: BLOCK, montant: '1000000', compte: COMPTE }, { rpc: async () => '0x', clesDe: async () => [] });
  const S = globalThis.__S4;
  return { r, aeroBps: S.aero.map((a) => (a.fraisBps === 0n ? 0 : 10)), v4: S.v4.length };
}
const NM = { etat: 'NON_MESURE', pourquoi: 'v4 quote: HTTP 429' };
{
  const x = await cas([NM, PRET(true)]);
  ok(x.r.etat === 'NON_MESURE' && /429/.test(String(x.r.pourquoi)) && x.aeroBps.length === 1 && x.v4 === 1,
    'ROUGE->VERT (a) : 1re jambe v4 NON_MESURE -> rendue telle quelle, AUCUNE 2e tentative a 10 bps (etat ' + x.r.etat + ', aero ' + JSON.stringify(x.aeroBps) + ')');
}
{
  const x = await cas([PRET(false), PRET(true)]);
  ok(x.r.etat === 'NON_MESURE' && /hook/i.test(String(x.r.pourquoi)), 'ROUGE->VERT (b) : 2e tentative PRET + fraisParHook -> NON_MESURE nomme, jamais deux frais (etat ' + x.r.etat + ')');
}
/* 2026-10-10 (diagnostic Grok 21:58, point 2) : la carte du panneau lit `resume.fraisBps` ; le resume 4 ter ne l avait pas -> hook qui
 *   ne paie pas = 0,1 % pris en USDC SANS une ligne a l ecran. On EXECUTE les lignes de frais de la carte (app.html) sur le resume rendu. */
const html = fs.readFileSync(process.env.TB_APP || path.join(ICI, 'app.html'), 'utf8');
const i0 = html.indexOf('const fMarche = rs.fraisParHook'), i1 = html.indexOf("bcEtape(m, 'No app fee on this route.');", i0);
const lignesFrais = i0 > 0 && i1 > i0 ? html.slice(i0, i1 + "bcEtape(m, 'No app fee on this route.');".length) : null;
const carte = (rs) => { const dit = []; new Function('rs', 'm', 'bcEtape', lignesFrais)(rs, null, (_m, t) => dit.push(t)); return dit; };
ok(lignesFrais !== null, 'les lignes de frais de la carte sont lisibles dans app.html');
{
  const x = await cas([PRET(true)]);
  ok(x.r.etat === 'PRET' && x.r.resume.fraisParHook === true && x.r.resume.fraisBpsJambe1 === 0 && JSON.stringify(x.aeroBps) === '[0]', 'temoin : hook paie -> PRET, Aerodrome a 0 bps, un seul frais');
  ok(Number(x.r.resume.fraisBps) === 0, 'hook paie -> resume.fraisBps 0 (frais d app du lot : aucun) (vu ' + x.r.resume.fraisBps + ')');
  const dit = lignesFrais ? carte(x.r.resume) : [];
  ok(dit.some((t) => /^Market fee: 0\.1 %/.test(t)) && !dit.some((t) => /App fee/.test(t)), 'carte hook paie : la ligne Market fee, aucune App fee (vu ' + JSON.stringify(dit) + ')');
}
{
  const x = await cas([PRET(false), PRET(false)]);
  ok(x.r.etat === 'PRET' && x.r.resume.fraisParHook === false && x.r.resume.fraisBpsJambe1 === 10 && JSON.stringify(x.aeroBps) === '[0,10]', 'temoin : hook ne paie pas -> PRET, frais Aerodrome 10 bps, un seul frais');
  ok(Number(x.r.resume.fraisBps) === 10, 'ROUGE->VERT : hook ne paie pas -> resume.fraisBps 10 (vu ' + x.r.resume.fraisBps + ')');
  const dit = lignesFrais ? carte(x.r.resume) : [];
  ok(dit.includes('App fee: 0.1 %, inside the transaction.') && !dit.some((t) => /Market fee/.test(t)), 'ROUGE->VERT : carte hook ne paie pas -> « App fee: 0.1 % » (vu ' + JSON.stringify(dit) + ')');
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(n - ko + '/' + ko);
process.exit(ko ? 1 : 0);