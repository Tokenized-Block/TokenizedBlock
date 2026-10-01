/* test-profil-lecture-ratee-cherche-la-pool.mjs — UN MARCHE ILLISIBLE PAR StateView EST CHERCHE AUTREMENT.
 *
 * ⛔⛔ LE DEFAUT (Raksha, 2026-10-01) : SNDKc ouvert depuis « Buy » dans Market — pas de BUY/SELL, pas de
 *     montant, pas de devis. Reproduit au navigateur (headless) en refusant les eth_call vers le StateView
 *     v4 (« over rate limit ») : la prod reste « Market unread — retry », panneau cache, 90 s ; avec ce
 *     correctif le panneau s ouvre a ~40 s (« market found · outside market »).
 *     CAUSE : dans `ouvrirProfil`, la decouverte (`enrichirMarcheSiDecouvert`) n etait tentee que sur
 *     NON_TROUVEE. Quatre lectures refusees laissaient NON_LUE, et rien ne cherchait la cle ailleurs.
 * ⛔ CE FICHIER EXECUTE LA VRAIE TRANCHE d ouvrirProfil (boucle de lecture -> `marcheProfil = …`),
 *   extraite d app.html depouille de ses commentaires.
 * ⛔⛔ TEMOINS : la decouverte qui ne trouve rien laisse NON_LUE (jamais « pas de pool ») ; mutation qui
 *   retire la seconde chance -> TUEE (voir le commit).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';

let n = 0;
const cas = async (t, f) => { n += 1; try { await f(); console.log('  ok  ' + t); } catch (e) { console.error('✗ ' + t); throw e; } };
const nu = sansCommentaires(readFileSync(new URL('./app.html', import.meta.url), 'utf8'), { minRetire: 5000 });
const d = nu.indexOf('for (let essai = 0; essai < 4; essai++) {', nu.indexOf('async function ouvrirProfil('));
const f = nu.indexOf('marcheProfil = v ? {', d);
assert.ok(d > 0 && f > d, 'tranche de lecture du profil introuvable');
const source = nu.slice(d, f);
const CLE = { currency0: '0x0000000000000000000000000000000000000000', currency1: '0xb200000000000000000000397293cb8cda9a10c5', fee: 3000, tickSpacing: 60, hooks: '0x' + '0'.repeat(40) };

async function lire({ vie, decouverte }) {
  const appels = [];
  const AsyncFunction = (async () => {}).constructor;
  const fn = new AsyncFunction('$', 'dormir', 'perime', 'vieDuBlock', 'rpc', 'RESEAUX', 'CHAINE', 'adr', 'clesReellesDe', 'enrichirMarcheSiDecouvert',
    'let v = null;\n' + source + '\nreturn v;');
  const v = await fn(() => ({ textContent: '' }), async () => {}, () => false, async () => vie, null, { 8453: { stateView: '0xsv' } }, 8453,
    '0xb200000000000000000000397293cb8cda9a10c5', async () => [],
    async (a, v0) => { appels.push(v0 && v0.etat); return decouverte(v0); });
  return { v, appels };
}
const trouve = () => ({ etat: 'LUE', vie: null, cle: CLE, decouvertExterne: true });

await cas('⛔⛔⛔ StateView REFUSE 4 FOIS (NON_LUE) MAIS LA POOL SE DECOUVRE : v = LUE, Buy/Sell peut s ouvrir', async () => {
  const r = await lire({ vie: { etat: 'NON_LUE' }, decouverte: (v0) => (v0.etat === 'NON_TROUVEE' ? trouve() : v0) });
  assert.equal(r.v.etat, 'LUE', 'la decouverte n a pas ete tentee sur une lecture ratee');
  assert.deepEqual(r.v.cle, CLE);
});
await cas('⛔⛔ TOUTES LES LECTURES JETTENT (v = null) : la decouverte est tentee aussi', async () => {
  const r = await lire({ vie: null, decouverte: () => trouve() });
  assert.equal(r.v && r.v.etat, 'LUE');
});
await cas('TEMOIN — RIEN DECOUVERT : v RESTE NON_LUE (« unread »), JAMAIS « pas de pool »', async () => {
  const r = await lire({ vie: { etat: 'NON_LUE' }, decouverte: (v0) => v0 });
  assert.equal(r.v.etat, 'NON_LUE');
});
await cas('NON_TROUVEE : le chemin d origine est intact (une seule decouverte)', async () => {
  const r = await lire({ vie: { etat: 'NON_TROUVEE' }, decouverte: () => trouve() });
  assert.equal(r.v.etat, 'LUE'); assert.deepEqual(r.appels, ['NON_TROUVEE']);
});
await cas('LUE en v4 : aucune decouverte', async () => {
  const r = await lire({ vie: { etat: 'LUE', vie: 5, cle: CLE }, decouverte: () => { throw new Error('ne doit pas etre appele'); } });
  assert.equal(r.v.etat, 'LUE'); assert.deepEqual(r.appels, []);
});
console.log('test-profil-lecture-ratee-cherche-la-pool :', n, 'cas OK');
