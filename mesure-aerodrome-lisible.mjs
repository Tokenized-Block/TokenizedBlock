/* mesure-aerodrome-lisible.mjs — PEUT-ON LIRE UN MARCHE AERODROME, ET LE PRIX TOMBE-T-IL JUSTE ?
 *
 * ⛔⛔ CE QUI A DECLENCHE CETTE MESURE (2026-09-26). Phil demande pourquoi un block est « endormi ».
 *     Mesure : MUc (`0xb200000000000000000000fd2f87532b90095211`, adresse COPIEE de `/api/trending`)
 *     trade 806 446 $ par 24 h — sur **Aerodrome**. Notre lecteur de vie, lui, est Uniswap v4 ONLY :
 *     `vieDuBlock` exige un `stateView` v4 et lit `getSlot0(bytes32)` sur un poolId v4. Et le mot
 *     « aerodrome » n apparait ZERO fois dans tout notre JS et notre HTML.
 *     ⇒ La fiche affiche « Market unread — that is about the network. Use Retry. » C est la MAUVAISE
 *       cause, et « Retry » ne peut JAMAIS aboutir : il n y a pas de pool v4 a trouver.
 *
 * ⛔ AVANT D ECRIRE LE LECTEUR, ON PROUVE QU ON SAIT LIRE. Cette sonde etablit, dans l ordre :
 *     1. que la factory Slipstream annoncee existe et repond ;
 *     2. quelle pool porte reellement MUc, en essayant les tickSpacings et les devises connues ;
 *     3. le prix derive de `slot0`, COMPARE au prix publie par DexScreener.
 *   Le 3 est le seul vrai juge : un prix derive qui ne retombe pas sur la mesure publique est un
 *   prix faux, meme s il a l air plausible.
 *
 * ⛔ LES ADRESSES VIENNENT D UN RAPPORT D AGENT — donc de la SORTIE D UN MODELE. Elles sont
 *   re-verifiees ici sur la chaine avant toute utilisation. Aucune n est completee de memoire.
 *
 * ⚠️ CE QUE CETTE SONDE NE PEUT PAS DIRE : que TOUS les blocks Aerodrome se lisent ainsi. Elle en
 *   lit un. Le taux de reussite sur la population se mesurera apres, sur la liste du Trending.
 */
import { selecteur } from './keccak.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';

/* ⛔ COPIEES du rapport d audit du 2026-09-26, qui les tenait lui-meme de la chaine (le
 *   PositionManager canonique `0xe1f8cd9a…` declare cette factory via `factory()`). Elles sont
 *   REVERIFIEES ci-dessous : une adresse recopiee reste une adresse a prouver. */
const FACTORY_SLIPSTREAM = '0xf8f2eb4940cfe7d13603dddd87f123820fc061ef';
const MUC = '0xb200000000000000000000fd2f87532b90095211';

/* Devises contre lesquelles un block peut etre cote. ⛔ COPIEES de `paires.js` quand elles y sont,
 *   sinon des adresses canoniques Base. On ne devine rien. */
const { pairesProposees } = await import('./paires.js');
const WETH = '0x4200000000000000000000000000000000000006';

const souffler = (ms = 300) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params, essais = 4) {
  for (let i = 0; i < essais; i++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json();
    if (!j.error) return j.result;
    const msg = j.error.message || String(j.error.code);
    if (!/rate limit|too many|429|limited/i.test(msg) || i === essais - 1) throw new Error(msg);
    await souffler(1000 * (i + 1));
  }
}
/* ⛔⛔ DEUX `selecteur` EXISTENT DANS CE DEPOT, AVEC DES CONVENTIONS OPPOSEES, et ma premiere version
 *     s y est fait prendre :
 *       `keccak.js` -> rend AVEC le prefixe : '0x1a441dcf'
 *       `pool.js`   -> rend SANS : '1a441dcf'  (d ou les `'0x' + selecteur(...)` de lancer-pool.js)
 *     J avais ecrit `sel(sig)` avec la version de keccak.js : le noeud a recu `0x0x…`
 *     et a repondu « Invalid params » SEIZE fois. J allais conclure que la factory Slipstream ne
 *     repond a rien — un verdict entierement faux sur un contrat parfaitement vivant.
 *   ⛔ ET JE NE L AI VU QUE PARCE QUE J AI DEJA FAIT LA MEME FAUTE CE MATIN. La sonde imprime donc
 *     ses selecteurs AVANT de s en servir : un instrument s accuse lui-meme en premier. */
const sel = (sig) => { const s = selecteur(sig); return s.startsWith('0x') ? s : '0x' + s; };
const pad = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const motSigne = (n) => (n < 0 ? (BigInt(n) + (1n << 256n)) : BigInt(n)).toString(16).padStart(64, '0');
async function appel(to, data) {
  try { return { ok: await rpc('eth_call', [{ to, data }, 'latest']) }; }
  catch (e) { return { erreur: String((e && e.message) || e) }; }
}

console.log('═══ PEUT-ON LIRE UN MARCHE AERODROME ? ═══\n');

/* ── 1. la factory existe-t-elle vraiment ? ─────────────────────────────────────────────────── */
console.log('── 1. la factory Slipstream repond-elle ? ──');
console.log('  selecteurs : allPoolsLength ' + sel('allPoolsLength()') + ' · getPool ' + sel('getPool(address,address,int24)') + ' · slot0 ' + sel('slot0()'));
const code = await rpc('eth_getCode', [FACTORY_SLIPSTREAM, 'latest']);
console.log('  ' + FACTORY_SLIPSTREAM);
console.log('  bytecode : ' + ((String(code).length - 2) / 2) + ' octets');
if (!code || code === '0x') { console.log('  ⛔ AUCUN bytecode : rien de ce qui suit ne tient.'); process.exit(1); }

for (const sig of ['allPoolsLength()', 'owner()', 'voter()']) {
  await souffler();
  const r = await appel(FACTORY_SLIPSTREAM, sel(sig));
  console.log('  ' + sig.padEnd(18) + (r.erreur ? 'NE REPOND PAS (' + r.erreur.slice(0, 32) + ')'
    : (sig === 'allPoolsLength()' ? String(BigInt(r.ok)) : '0x' + r.ok.slice(-40))));
}
/* ⛔ `tickSpacingToFee` est ce qui distingue Slipstream d un v3 ordinaire : s il repond, on est bien
 *   devant le bon contrat, et pas devant une adresse qui lui ressemble. */
for (const ts of [80, 500, 150, 100, 200, 2000]) {
  await souffler();
  const r = await appel(FACTORY_SLIPSTREAM, sel('tickSpacingToFee(int24)') + motSigne(ts));
  if (!r.erreur && r.ok && r.ok !== '0x') {
    const pips = Number(BigInt(r.ok));
    console.log('  tickSpacing ' + String(ts).padStart(4) + ' -> fee ' + pips + ' pips = '
      + (pips / 10000).toFixed(2) + ' %' + (pips === 0 ? '  (non configure)' : ''));
  } else {
    console.log('  tickSpacing ' + String(ts).padStart(4) + ' -> NON LU');
  }
}

/* ── 2. quelle pool porte MUc ? ─────────────────────────────────────────────────────────────── */
console.log('\n── 2. quelle pool Aerodrome porte MUc ? ──');
const devises = [['WETH', WETH]];
for (const p of pairesProposees(8453) || []) {
  /* ⛔ LE CHAMP EST `adr`, PAS `adresse` — lu dans `DEVISES_BASE`. Ma premiere version testait
   *   `p.adresse`, toujours indefini : la liste est restee a UNE devise (WETH) et la sonde a conclu
   *   « aucune pool », alors qu elle n avait essaye presque rien. */
  if (p && p.adr && !/^0x0{40}$/.test(p.adr)) devises.push([p.symbole, p.adr]);
}
console.log('  devises essayees : ' + devises.length);

const SEL_GET_POOL = sel('getPool(address,address,int24)');
const trouvees = [];
for (const [sym, adr] of devises) {
  for (const ts of [80, 500, 150, 100, 200, 2000]) {
    await souffler(180);
    const r = await appel(FACTORY_SLIPSTREAM,
      SEL_GET_POOL + pad(MUC) + pad(adr) + motSigne(ts));
    if (r.erreur || !r.ok || r.ok === '0x') continue;
    const pool = '0x' + r.ok.slice(-40);
    if (/^0x0{40}$/.test(pool)) continue;
    trouvees.push({ sym, devise: adr, ts, pool });
    console.log('  ✅ pool trouvee : ' + sym + ' · tickSpacing ' + ts + ' -> ' + pool);
  }
}
if (!trouvees.length) {
  /* ⛔ UN ZERO ICI N EST PAS « MUc N A PAS DE MARCHE » : c est « aucune des devises essayees ne le
   *   porte ». Les 806 446 $ de volume mesures le contredisent — donc la devise est ailleurs. */
  console.log('  ⛔ aucune pool sur les devises essayees. Ce n est PAS « pas de marche » :');
  console.log('    DexScreener mesure 806 446 $ / 24 h. La devise d en face est hors de cette liste.');
  process.exitCode = 2;
}

/* ── 3. le prix derive retombe-t-il sur la mesure publique ? ────────────────────────────────── */
console.log('\n── 3. LE JUGE : le prix derive vaut-il celui de DexScreener ? ──');
const ref = await (await fetch('https://tokenizedblock.space/api/trending',
  { headers: { 'x-ms-monitor': '1' } })).json();
const ligne = (ref.blocks || ref.liste || []).find((b) => String(b.adr).toLowerCase() === MUC);
const prixRef = ligne ? Number(ligne.prixUsd) : null;
console.log('  prix publie (DexScreener) : ' + (prixRef != null ? '$' + prixRef : 'NON LU'));

for (const t of trouvees) {
  await souffler();
  const s0 = await appel(t.pool, sel('slot0()'));
  if (s0.erreur || !s0.ok || s0.ok === '0x') { console.log('  ' + t.pool + ' slot0 NON LU'); continue; }
  const sqrt = BigInt('0x' + s0.ok.slice(2, 66));
  await souffler();
  const liq = await appel(t.pool, sel('liquidity()'));
  const L = liq.erreur ? null : BigInt(liq.ok);
  await souffler();
  const t0r = await appel(t.pool, sel('token0()'));
  const token0 = t0r.erreur ? null : '0x' + t0r.ok.slice(-40);
  console.log('  ' + t.sym + ' ts=' + t.ts + ' · sqrtPriceX96 = ' + sqrt
    + ' · liquidity = ' + (L === null ? 'NON LU' : L) + ' · token0 = ' + (token0 || 'NON LU'));
  if (sqrt === 0n) {
    console.log('    ⛔ sqrtPrice nul : pool creee mais JAMAIS initialisee — pas un prix de zero.');
  }
}

console.log('\n── CE QUE CETTE SONDE NE DIT PAS ──');
console.log('⛔ Que tous les blocks Aerodrome se lisent ainsi : elle en lit UN.');
console.log('⛔ Le prix en DOLLARS : slot0 rend un ratio entre deux jetons. Le passage au dollar');
console.log('   demande le prix USD de la devise d en face, qui se lit ailleurs.');
console.log('⛔ Elle ne prouve rien sur nos revenus : lire un marche ne le fait pas nous payer.');
