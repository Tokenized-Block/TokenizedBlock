// test-lancement-guide-20261017.mjs - 2026-10-17, the guided launch: one numbered list (1 birth, 2 register, 3 launch market),
// each step with its exact amount and why, read from the CHAIN (never assumed), resumed after reload / stale node, a paid step
// never asked twice, and a visible "Market open" at the end.
// MEASURED (fork of Base at 52694526, then mainnet 52695895): UNIT 0xb200..4f27 launched by 0x31e0 in tx
// 0x980ae60dc5323c6ca7d44529be4e79686ca54663a586a49fead9be0b671f1a16 (21:20:01 Brussels): sqrtPriceX96 = 10000<<96, ACTIVE
// liquidity (getLiquidity) = 0 because a no-seed birth places a block-only range BELOW the price (upper tick 184200 < tick 184206),
// liquidityGross at 184200 = 99980036087645815512138. The app read "liquidity 0" as an EMPTY pool and told the creator
// "someone opened this market before you and left it empty" - false. The guide reads the range edge instead.
import { readFileSync } from 'node:fs';
import { selecteur, poolId } from './pool.js';
import { HOOK_7030 } from './tokenomics.js';
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { ko++; console.log('KO  ' + m); } };
let G;
try { G = await import('./lancement-guide.js'); } catch (e) { ok(false, 'lancement-guide.js loads (' + e.message.slice(0, 80) + ')'); console.log('KO ' + ko + '/' + n); process.exit(1); }
const { lireEtatLancement, etapesGuidees, texteMarcheOuvert } = G;
const COMPTE = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const SV = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';
const cle = { currency0: '0x0000000000000000000000000000000000000000', currency1: UNIT, fee: 0, tickSpacing: 200, hooks: HOOK_7030 };
const pid = poolId(cle).slice(2);
const mot = (x) => '0x' + BigInt.asUintN(256, BigInt(x)).toString(16).padStart(64, '0');
const S = (f) => '0x' + selecteur(f);
const SQRT = 10000n << 96n, TICK = 184206n, GROSS = 99980036087645815512138n;
/** a chain at a given stage: 0 nothing, 1 born, 2 registered+paid, 3 market open (no-seed), 4 pool initialized with NO position */
function chaine(stade, { latestEnRetard = false, plante = false } = {}) {
  return async (m, p) => {
    if (plante) throw new Error('node down');
    if (m === 'eth_getCode') return stade >= 1 ? '0x6080' : '0x';
    if (m !== 'eth_call') throw new Error('unexpected ' + m);
    const [{ to, data }, tag] = p;
    const s = latestEnRetard && tag === 'latest' ? Math.min(stade, 1) : stade;
    const d = String(data).toLowerCase();
    if (d.startsWith(S('payee(bytes32)'))) return mot(s >= 2 ? 1 : 0);
    if (d.startsWith(S('createurs(bytes32)'))) return s >= 2 ? mot(COMPTE) : mot(0);
    if (d.startsWith(S('prixInscrit(bytes32)'))) return mot(s >= 2 ? SQRT : 0);
    if (d.startsWith(S('fraisVie()'))) return mot(300000000000000n);
    if (d.startsWith(S('fraisCreation()'))) return mot(700000000000000n);
    if (d.startsWith(S('getSlot0(bytes32)'))) { if (!d.includes(pid)) return mot(0) + mot(0).slice(2) + mot(0).slice(2) + mot(0).slice(2);
      return s >= 3 || s === 4 ? mot(SQRT) + mot(TICK).slice(2) + mot(0).slice(2) + mot(0).slice(2) : mot(0) + mot(0).slice(2) + mot(0).slice(2) + mot(0).slice(2); }
    if (d.startsWith(S('getLiquidity(bytes32)'))) return mot(0);
    if (d.startsWith(S('getTickLiquidity(bytes32,int24)'))) {
      const t = BigInt.asIntN(256, BigInt('0x' + d.slice(74, 138)));
      return s === 3 && t === 184200n ? mot(GROSS) + mot(GROSS).slice(2) : mot(0) + mot(0).slice(2);
    }
    throw new Error('unexpected call ' + d.slice(0, 10) + ' to ' + to);
  };
}
const lire = (stade, o = {}) => lireEtatLancement({ rpc: chaine(stade, o), stateView: SV, jeton: UNIT, cle, hook: HOOK_7030, compte: COMPTE, ...(o.blocMin ? { blocMin: o.blocMin } : {}) });
const montants = { fraisCreateWei: 700000000000000n, fraisVieWei: 300000000000000n, cautionWei: 415168000000000n, seedWei: 0n };
// 1) fresh: step 1 to do, nothing else offered
let e = await lire(0); let g = etapesGuidees(e, montants);
ok(e.etat === 'LU' && e.ne === false, 'stage 0: read, not born');
ok(g.etapes.length === 3 && g.etapes.map((x) => x.n).join(',') === '1,2,3', 'always one list of 3 numbered steps');
ok(g.etapes[0].statut === 'A_FAIRE' && g.etapes[1].statut === 'ATTENTE' && g.etapes[2].statut === 'ATTENTE', 'stage 0: 1 to do, 2-3 waiting');
ok(/0\.0007 ETH/.test(g.etapes[0].montant) && /why/i.test('why ' + g.etapes[0].pourquoi) && g.etapes[0].pourquoi.length > 20, 'step 1 says 0.0007 ETH and why');
ok(/0\.0003 ETH/.test(g.etapes[1].montant) && /0\.000415168 ETH/.test(g.etapes[1].montant), 'step 2 says 0.0003 ETH + the creator minimum 0.000415168 ETH');
ok(/no fee/i.test(g.etapes[2].montant) && /gas/i.test(g.etapes[2].montant), 'step 3 says no fee, gas only (no-seed)');
ok(g.marcheOuvert === false, 'stage 0: market not open');
// 2) born: step 2 current
g = etapesGuidees(await lire(1), montants);
ok(g.etapes[0].statut === 'FAIT' && g.etapes[1].statut === 'A_FAIRE' && g.etapes[2].statut === 'ATTENTE', 'stage 1: 1 done, 2 to do');
// 3) registered + paid (UNIT before 21:20): step 2 done, never re-asked; step 3 current
e = await lire(2); g = etapesGuidees(e, montants);
ok(e.payee === true && e.inscritParMoi === true && e.prixInscrit === SQRT, 'stage 2: paid, registered by me at 10000<<96');
ok(g.etapes[1].statut === 'FAIT' && g.etapes[2].statut === 'A_FAIRE', 'stage 2: 2 done (paid, not re-asked), 3 to do');
ok(g.courante === 3, 'stage 2: current step = 3 (launch market)');
// 4) stale node after reload: latest lags, blocMin of the receipt known -> NON_MESURE, nothing current, nothing asked
//    (2026-10-17, Claude's review: reads stay at 'latest'; reading AT a persisted old block fails on non-archive nodes hours later)
e = await lire(2, { latestEnRetard: true, blocMin: '0x3240d72' }); g = etapesGuidees(e, montants);
ok(e.etat === 'NON_MESURE' && g.courante === null && g.etapes.every((x) => x.statut !== 'A_FAIRE'), 'stale node + blocMin: NON_MESURE, step 2 never offered again');
// 4b) caught-up node, old blocMin: the reads never use the old block (a non-archive node would refuse it) -> paid, step 3 current
e = await lire(2, { blocMin: '0x3240d72' }); g = etapesGuidees(e, montants);
ok(e.etat === 'LU' && e.payee === true && e.lueA === 'latest' && g.courante === 3, 'old blocMin on a caught-up node: read at latest, paid, step 3 current');
// 5) stale node WITHOUT blocMin cannot see payment: it must not claim step 2 is to pay if the read is unsure -> it is to do,
//    but etapesGuidees never builds a tx: that stays with completerInscriptionPayee (which reads at blocMin). Unreadable -> NON_LU.
e = await lire(2, { plante: true }); g = etapesGuidees(e, montants);
ok(e.etat === 'NON_MESURE' && g.etapes.every((x) => x.statut === 'NON_LU') && g.courante === null, 'node down: every step NON_LU, nothing current, nothing asked');
// 6) market open with a no-seed range (UNIT now): open
e = await lire(3); g = etapesGuidees(e, montants);
ok(e.marche === 'OUVERT' && e.sqrtPriceX96 === SQRT, 'stage 3: pool initialized at 10000<<96 with a range edge -> OUVERT (active liquidity 0 is NOT empty)');
ok(g.etapes.every((x) => x.statut === 'FAIT') && g.marcheOuvert === true && g.courante === null, 'stage 3: all done, market open');
ok(/market open/i.test(texteMarcheOuvert(e)), 'a visible "Market open" confirmation text');
// 7) initialized but NO position at all: really empty
e = await lire(4);
ok(e.marche === 'VIDE', 'stage 4: initialized without any position edge -> VIDE');
// 8) app.html wiring
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
ok(/from '\.\/lancement-guide\.js'/.test(app), 'app.html imports lancement-guide.js');
ok(/id="plGuide"/.test(app), 'app.html has the numbered step list #plGuide');
ok(/tb\.blocInscrit\./.test(app) && /localStorage\.(setItem|getItem)\('tb\.blocInscrit\.'/.test(app.replace(/\s+/g, ' ').replace(/\('tb\.blocInscrit\.' \+/g, "('tb.blocInscrit.'")), 'the confirmed registration block survives a reload (localStorage tb.blocInscrit.<block>)');
ok(/guide\.marche === 'OUVERT'/.test(app), 'calculerLancement stops on an OPEN market before the empty-pool message');
console.log(ko ? 'KO ' + ko + '/' + n : 'ok lancement-guide - ' + n + ' assertions');
process.exit(ko ? 1 : 0);