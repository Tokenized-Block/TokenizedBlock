/* test-rail-eth-action-resume-20261010.mjs - ACHETER UNE ACTION EN ETH : LA CARTE DIT LE MINIMUM RECU ET LE FRAIS D APP.
 * Test prod de Grok (20261010-banque-hors-usdc, ETH -> NVDAc, tx 0xa7ceebcd…, a6cf NVDAc +0,00000054) : « la carte n affiche ni
 *   minimum ni ligne de frais ». Mesure prod (2026-10-10, /api/rails/plan ETH -> NVDAc, x-ms-monitor) : etat PRET, via
 *   planAchatEthAction, `resume` NUL - le plan porte minUtilisateur et fraisBps, la route ne les remontait pas.
 * Banc hors ligne : rails-api.js copie dans un dossier temporaire, voisins re-exportes, echange-eth.js remplace par un stub.
 * EXECUTE ensuite les lignes de frais et de minimum de la carte du panneau (app.html, TB_APP = ancienne) sur le resume rendu.
 * AFFIRME : PRET -> resume { paye, payeDevise ETH, recoitAuMoins = minUtilisateur, recoitDevise, fraisBps } ; la carte dit
 *   « App fee: 0.1 % » et « You receive at least » ; un plan REFUSE reste sans resume (rien d invente).
 * NE PROUVE PAS : le rendu navigateur ; le frais reel (prouve par la tx de Grok, verifiee sur les soldes, pas ici).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const src = fs.readFileSync(path.join(ICI, 'rails-api.js'), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-eth-action-'));
fs.writeFileSync(path.join(dir, 'rails-api.js'), src);
const url = (f) => pathToFileURL(path.join(ICI, f)).href;
const STUBS = {
  'echange-eth.js': `export * from '${url('echange-eth.js')}';
export async function planAchatEthAction(a) { globalThis.__E.push(a); return globalThis.__R; }`,
};
for (const m of src.matchAll(/from '\.\/([^']+)'/g)) fs.writeFileSync(path.join(dir, m[1]), STUBS[m[1]] || `export * from '${url(m[1])}';\n`);
const { POOLS_ACTIONS_AERODROME } = await import(url('pools-actions-aerodrome.js'));
const NVDA = '0xb20000000000000000000078ee7ce2fe4908108c';
vu(POOLS_ACTIONS_AERODROME.has(NVDA), 'temoin : NVDAc n est plus dans la table Aerodrome, le cas teste a disparu');
const R = await import(pathToFileURL(path.join(dir, 'rails-api.js')).href);
const COMPTE = '0x00000000000000000000000000000000c0ffee77';
const cas = async (rep) => { globalThis.__E = []; globalThis.__R = rep; return R.planRail({ de: 'ETH', vers: NVDA, montant: '50000000000000', compte: COMPTE }, { rpc: async () => '0x', clesDe: async () => [] }); };
const PRET = { etat: 'PRET', appels: [{ role: 'swap', to: '0x698cb2b6dd822994581fea6ea4fc755d1363a92f', data: '0x', value: '0x1' }], simule: true,
  plan: { minUtilisateur: '53766', minSortie: '53820', sortieAttendue: '54396', fraisBps: 10 } };
const r = await cas(PRET);
vu(r.etat === 'PRET' && r.via === 'planAchatEthAction' && globalThis.__E.length === 1, 'la route ETH -> NVDAc ne passe plus par planAchatEthAction : ' + r.via);
vu(!!r.resume, 'ROUGE->VERT : PRET sans resume (la carte n a ni minimum ni frais)');
const rs = r.resume || {};
vu(String(rs.recoitAuMoins) === '53766' && String(rs.fraisBps) === '10' && String(rs.paye) === '50000000000000' && String(rs.recoitDevise).toLowerCase() === NVDA,
  'resume faux : ' + JSON.stringify(rs));
const ref = await cas({ etat: 'REFUSE', pourquoi: 'not enough ETH in this wallet for that amount', plan: PRET.plan });
vu(ref.etat === 'REFUSE' && ref.resume === null, 'un plan REFUSE porte un resume invente : ' + JSON.stringify(ref.resume));
/* la carte du panneau, executee sur ce resume */
const html = fs.readFileSync(process.env.TB_APP || path.join(ICI, 'app.html'), 'utf8');
const i0 = html.indexOf('const fMarche = rs.fraisParHook'), i1 = html.indexOf("vers.sym + '.');", i0);
vu(i0 > 0 && i1 > i0, 'lignes de frais / minimum de la carte introuvables');
const dit = [];
new Function('rs', 'm', 'bcEtape', 'decVers', 'bcUnites', 'vers', html.slice(i0, i1 + "vers.sym + '.');".length))(rs, null, (_m, t) => dit.push(t), 8, (v, d) => (Number(v) / 10 ** d).toFixed(8), { sym: 'NVDAc' });
vu(dit.includes('App fee: 0.1 %, inside the transaction.'), 'ROUGE->VERT : la carte ne dit pas le frais d app (vu ' + JSON.stringify(dit) + ')');
vu(dit.some((t) => /^You receive at least 0\.00053766 NVDAc\.$/.test(t)), 'ROUGE->VERT : la carte ne dit pas le minimum (vu ' + JSON.stringify(dit) + ')');
fs.rmSync(dir, { recursive: true, force: true });
console.log('ok rail-eth-action-resume - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
