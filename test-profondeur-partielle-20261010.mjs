/* test-profondeur-partielle-20261010.mjs — UNE PROFONDEUR ILLISIBLE NE BLOQUE PLUS LA ROUTE QUAND LES AUTRES SONT LUES (hors reseau).
 * QA de Phil (2026-10-10) : NVDAc > ETH s arretait sur « hop 2 (0x833589 to 0x420000): 3 pools found but the depth of 1 could not
 *   be read ». plan-franchissement.js `poolAerodromeDe` : relit une fois chaque profondeur ratee ; si elle reste illisible, prend la
 *   plus profonde des LUES seulement si elle detient >= PROFONDEUR_MIN_FOIS x le montant qui entre dans le saut.
 * Garde du defaut AMZNc (2026-10-10) : une pool VIDE lue ne gagne jamais contre une pool non lue. Lecteur RPC FICTIF : aucun appel reseau. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { poolAerodromeDe, PROFONDEUR_MIN_FOIS } from './plan-franchissement.js';
import { selecteur } from './keccak.js';
import { calldataGetPool } from './calldata-aerodrome.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); };
/* 2026-10-10 (4 bis) : USDC/WETH est desormais EPINGLE sur sa pool mesuree (test-pivot-weth-usdc-epingle) ; ce banc garde une paire NON epinglee (USDC/cbBTC). */
const A = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', B = '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4'; /* 2026-10-10 (actions hors USDC) : cbBTC/USDC est desormais EPINGLE - temoin non epingle = TOSHI */
const POOLS = { 1: '0x' + '1'.repeat(40), 10: '0x' + '2'.repeat(40), 100: '0x' + '3'.repeat(40) };
const SEL_BAL = selecteur('balanceOf(address)'), SEL_T0 = selecteur('token0()');
const getPoolDe = new Map(Object.entries(POOLS).map(([ts]) => [calldataGetPool({ tokenA: A, tokenB: B, tickSpacing: Number(ts) }).data, POOLS[ts]]));
const mot = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
/* profondeurs : valeur, 'jamais' (illisible a chaque essai) ou 'une-fois' (illisible au premier essai seulement) */
function lecteur(prof) {
  const essais = new Map();
  let appels = 0;
  const rpc = async (methode, [{ to, data }]) => {
    appels += 1;
    if (getPoolDe.has(data)) return '0x' + getPoolDe.get(data).slice(2).padStart(64, '0');
    if (String(data).startsWith(calldataGetPool({ tokenA: A, tokenB: B, tickSpacing: 1 }).data.slice(0, 10))) return mot(0);
    if (String(data).startsWith(SEL_BAL)) {
      const pool = '0x' + String(data).slice(-40);
      const v = prof[pool];
      const k = (essais.get(pool) || 0) + 1; essais.set(pool, k);
      if (v === 'jamais' || (v === 'une-fois' && k === 1)) throw new Error('over rate limit');
      return mot(v === 'une-fois' ? 5n * 10n ** 12n : v);
    }
    if (data === SEL_T0) return '0x' + A.slice(2).padStart(64, '0');
    throw new Error('unexpected call ' + to + ' ' + String(data).slice(0, 10));
  };
  rpc.appels = () => appels;
  return rpc;
}
const MONTANT = 1000n * 10n ** 6n; /* 1 000 USDC entrent dans le saut */
const profond = 3n * 10n ** 12n, vide = 0n;

/* 1. le cas de la QA : 3 pools, 1 profondeur jamais lue, la plus profonde lue detient >= 100 x le montant */
let r = await poolAerodromeDe({ rpc: lecteur({ [POOLS[1]]: 5n * 10n ** 6n, [POOLS[10]]: profond, [POOLS[100]]: 'jamais' }), a: A, b: B, montantEntree: MONTANT });
/* 2026-10-10 (revue adverse, 4 bis) : la branche partielle de 3f8a9c9 est RETIREE - une profondeur illisible = NON_MESURE, meme avec un montant */
ok(r.etat === 'NON_MESURE' && /could not be read/.test(r.pourquoi), '1 une profondeur illisible sur 3 : NON_MESURE, jamais « la plus profonde des lues » (' + r.etat + ')');
/* 2. sans montant : comportement d avant, NON_MESURE nomme */
r = await poolAerodromeDe({ rpc: lecteur({ [POOLS[1]]: 5n * 10n ** 6n, [POOLS[10]]: profond, [POOLS[100]]: 'jamais' }), a: A, b: B });
ok(r.etat === 'NON_MESURE' && /depth of 1 could not be read/.test(r.pourquoi), '2 sans montant d entree : NON_MESURE comme avant (' + r.etat + ')');
/* 3. TEMOIN NEGATIF (defaut AMZNc) : la seule pool lue est VIDE, la vraie n est pas lue -> jamais choisie */
r = await poolAerodromeDe({ rpc: lecteur({ [POOLS[1]]: vide, [POOLS[10]]: 'jamais', [POOLS[100]]: vide }), a: A, b: B, montantEntree: MONTANT });
ok(r.etat === 'NON_MESURE', '3 temoin negatif : pools lues vides, la profonde illisible -> NON_MESURE, jamais une pool vide (' + r.etat + ')');
/* 4. pool lue trop fine pour le montant (moins de 100 x) -> NON_MESURE */
r = await poolAerodromeDe({ rpc: lecteur({ [POOLS[1]]: MONTANT * 50n, [POOLS[10]]: 'jamais', [POOLS[100]]: MONTANT * 2n }), a: A, b: B, montantEntree: MONTANT });
ok(r.etat === 'NON_MESURE' && PROFONDEUR_MIN_FOIS === 100n, '4 la plus profonde lue ne detient que 50 x le montant (< ' + PROFONDEUR_MIN_FOIS + ' x) : NON_MESURE (' + r.etat + ')');
/* 5. lecture passagere : ratee au 1er essai, relue -> toutes lues, choix complet (pas de profondeursNonLues) */
r = await poolAerodromeDe({ rpc: lecteur({ [POOLS[1]]: 5n * 10n ** 6n, [POOLS[10]]: profond, [POOLS[100]]: 'une-fois' }), a: A, b: B });
ok(r.etat === 'PRET' && r.pool === POOLS[100] && r.profondeursNonLues === undefined, '5 une profondeur ratee une fois est RELUE : choix sur toutes les pools, la plus profonde gagne (' + r.etat + ', ' + r.pool + ')');
/* 6. toutes lues : inchange */
r = await poolAerodromeDe({ rpc: lecteur({ [POOLS[1]]: 1n, [POOLS[10]]: profond, [POOLS[100]]: 2n }), a: A, b: B, montantEntree: MONTANT });
ok(r.etat === 'PRET' && r.pool === POOLS[10] && r.profondeursNonLues === undefined, '6 toutes lues : la plus profonde, comme avant');
/* 7. le segment Aerodrome passe le montant qui ENTRE dans chaque saut */
const seg = fs.readFileSync(path.join(ICI, 'plan-aerodrome-segment.js'), 'utf8');
ok(/poolAerodromeDe\(\{ rpc, a: s\.de, b: s\.vers, montantEntree: courant \}\)/.test(seg), '7 plan-aerodrome-segment.js passe `courant` (le montant entrant du saut)');
/* 8. MUTANTS : sans relecture, ou sans le seuil, le test doit rougir */
const src = fs.readFileSync(path.join(ICI, 'plan-franchissement.js'), 'utf8').replace(/\r\n/g, '\n'); /* portable LF/CRLF */
const mutants = [
  ['comparaison partielle', 'if (trouvees.length > 1 && lues.length < trouvees.length) {', 'if (false) {'],
  ['relecture retiree', 'for (const x of trouvees) {\n      if (x.prof !== null) continue;', 'for (const x of []) {\n      if (x.prof !== null) continue;'],
];
for (const [nom, de, vers] of mutants) {
  ok(src.includes(de), '8 le mutant « ' + nom + ' » trouve son ancre');
  const f = path.join(ICI, '.mutant-profondeur-' + process.pid + '.mjs');
  fs.writeFileSync(f, src.replace(de, vers));
  try {
    const M = await import('./' + path.basename(f) + '?m=' + nom.replace(/\W/g, ''));
    const c1 = await M.poolAerodromeDe({ rpc: lecteur({ [POOLS[1]]: 5n * 10n ** 6n, [POOLS[10]]: profond, [POOLS[100]]: 'jamais' }), a: A, b: B, montantEntree: MONTANT });
    const c3 = await M.poolAerodromeDe({ rpc: lecteur({ [POOLS[1]]: MONTANT * 50n, [POOLS[10]]: 'jamais', [POOLS[100]]: MONTANT * 2n }), a: A, b: B, montantEntree: MONTANT });
    const c5 = await M.poolAerodromeDe({ rpc: lecteur({ [POOLS[1]]: 5n * 10n ** 6n, [POOLS[10]]: profond, [POOLS[100]]: 'une-fois' }), a: A, b: B });
    const tue = !(c1.etat === 'NON_MESURE' && c3.etat === 'NON_MESURE' && c5.etat === 'PRET' && c5.pool === POOLS[100]);
    ok(tue, '8 mutant « ' + nom + ' » TUE');
  } finally { fs.rmSync(f, { force: true }); }
}
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
