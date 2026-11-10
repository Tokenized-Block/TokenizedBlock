// test-etat-naissance-20261110.mjs — etat-naissance.js, the ONE reader of a birth (CREATE-ONE-PATH). A fake node plays each state.
// Proves: every state a birth can stop in gives exactly one next signature, in order, and M = signatures left (vault included);
// a permit past its expiry is next again while what was done stays done; an unread price or vault never invents "done";
// a node error gives NON_MESURE, never a step. The live run against block TEST (mainnet, read only) is recorded in game343's message.
// Does NOT prove: the calls of each step (their planners and fork benches do), nor a wallet signing.
import * as N from './etat-naissance.js';
import { selecteur, poolId } from './pool.js';
let ok = 0, ko = 0;
const t = (n, c, x = '') => { if (c) ok++; else { ko++; console.log('RED', n, x); } };
const W = '0x' + '11'.repeat(20), B = '0xb2' + '00'.repeat(18) + 'ab', E18 = 10n ** 18n, NOW = 1_800_000_000;
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const S = (sig) => '0x' + selecteur(sig).replace(/^0x/, '');
const ID = poolId(N.cleEth(B)).slice(2);

/* a fake chain: s = { code, payee, createur, sqrt, liq, tickLiq, tbl, wt, wtAllow, wtP2:[amt,exp], blkBal, blkAllow, blkP2:[amt,exp] } */
function noeud(s, panne = null) {
  return async (m, p) => {
    if (panne && panne(m, p)) throw new Error('HTTP 429');
    if (m === 'eth_getCode') return s.code ? '0x6000' : '0x';
    const to = String(p[0].to).toLowerCase(), d = String(p[0].data).toLowerCase();
    const sel = d.slice(0, 10);
    if (to === N.HOOK_7030) {
      if (sel === S('payee(bytes32)')) return '0x' + w(s.payee ? 1 : 0);
      if (sel === S('createurs(bytes32)')) return '0x' + w(s.createur ? BigInt(W) : 0);
      if (sel === S('prixInscrit(bytes32)')) return '0x' + w(0);
    }
    if (to === N.STATE_VIEW) {
      if (sel === S('getSlot0(bytes32)')) return '0x' + w(s.sqrt || 0) + w(0) + w(0) + w(0);
      if (sel === S('getLiquidity(bytes32)')) return '0x' + w(s.liq || 0);
      if (sel === S('getTickLiquidity(bytes32,int24)')) return '0x' + w(s.tickLiq || 0) + w(0);
    }
    if (sel === S('balanceOf(address)')) return '0x' + w(to === N.TBLOCK ? s.tbl || 0 : to === N.WTCOIN ? s.wt || 0 : to === B.toLowerCase() ? s.blkBal || 0 : 0);
    if (sel === S('allowance(address,address)')) return '0x' + w(to === N.WTCOIN ? s.wtAllow || 0 : s.blkAllow || 0);
    if (to === N.PERMIT2 && sel === S('allowance(address,address,address)')) {
      const tok = '0x' + d.slice(10 + 64 + 24, 10 + 128);
      const [a, e] = tok === N.WTCOIN ? (s.wtP2 || [0, 0]) : (s.blkP2 || [0, 0]);
      return '0x' + w(a) + w(e) + w(0);
    }
    return '0x' + w(0);
  };
}
const lire = (s, opts = {}) => N.lireEtatNaissance({ rpc: noeud(s, opts.panne), compte: W, bloc: B, partTblock: 'part' in opts ? opts.part : 500000n * E18, coffrePaye: 'coffre' in opts ? opts.coffre : false, maintenantSec: NOW });
const OFFRE = 10n ** 27n;

/* 1. fresh wallet, no TBLOCK: next = ETH -> wtCOIN, M = 10 */
let r = await lire({});
t('fresh: read', r.etat === 'LU', JSON.stringify(r));
t('fresh: next is ETH -> wtCOIN, step 1', r.prochaine && r.prochaine.cle === 'buy1' && r.prochaine.etape === 1);
t('fresh: M = 10 (4 + 5 + 1)', r.restantes === 10, String(r.restantes));
t('fresh: exactly one SUIVANT', r.etapes.flatMap((e) => e.signatures).filter((s) => s.statut === 'SUIVANT').length === 1);
t('fresh: button', N.libelleContinue(r).l1 === 'Continue: get TBLOCK (step 1 of 3)' && N.libelleContinue(r).l2 === 'Signature 1 of 10 · ETH → wtCOIN', JSON.stringify(N.libelleContinue(r)));

/* 2. enough TBLOCK already: step 1 done, next = Create, M = 6, button says give it birth */
r = await lire({ tbl: 600000n * E18 });
t('holds TBLOCK: step 1 done', r.etapes[0].statut === 'FAIT');
t('holds TBLOCK: next = Create, M = 6', r.prochaine.cle === 'create' && r.restantes === 6);
t('holds TBLOCK: button names the birth', /give it birth \(step 2 of 3\)/.test(N.libelleContinue(r).l1));

/* 3. stopped after ETH -> wtCOIN (Grok's first stop): resume from wtCOIN, next = approve wtCOIN */
r = await lire({ wt: 13n * 10n ** 15n });
t('wtCOIN held: buy1 done, next approve wtCOIN, M = 9', r.etapes[0].signatures[0].statut === 'FAIT' && r.prochaine.cle === 'buy2' && r.restantes === 9);
/* dust below the floor is not a resume */
r = await lire({ wt: 10n });
t('wtCOIN dust: not a resume, next = ETH -> wtCOIN', r.prochaine.cle === 'buy1');

/* 4. created, nothing else: next = approve the block, M = 4+1 */
const cree = { tbl: 600000n * E18, code: true, blkBal: OFFRE };
r = await lire(cree);
t('created: Create done, next approve the block, M = 5', r.etapes[1].signatures[0].statut === 'FAIT' && r.prochaine.cle === 'approve' && r.restantes === 5);
t('created: button says open its market', /open its market \(step 2 of 3\)/.test(N.libelleContinue(r).l1));

/* 5. TEST's exact state: approved, registered, permit EXPIRED: next = Permit2 (again), M = 3; registration stays done */
const test = { ...cree, blkAllow: OFFRE, blkP2: [OFFRE, NOW - 60], payee: true, createur: true };
r = await lire(test);
t('TEST: Permit2 next again, marked expired', r.prochaine.cle === 'permit2' && r.prochaine.expire === true);
t('TEST: registration stays done', r.etapes[1].signatures[3].statut === 'FAIT');
t('TEST: M = 3', r.restantes === 3, String(r.restantes));
t('TEST: button "Signature 1 of 3 · Permit2 (again)"', N.libelleContinue(r).l2 === 'Signature 1 of 3 · Permit2 (again)', N.libelleContinue(r).l2);
/* 6. same with a live permit: next = open, M = 2 */
r = await lire({ ...test, blkP2: [OFFRE, NOW + 600] });
t('live permit: next = Open the market, M = 2', r.prochaine.cle === 'open' && r.restantes === 2);

/* 7. market open (range edge, getLiquidity 0 — no-seed birth): step 2 done, next = vault, M = 1 */
r = await lire({ ...test, sqrt: 1n << 96n, liq: 0, tickLiq: 5 });
t('open by range edge: step 2 done', r.etapes[1].statut === 'FAIT' && r.marcheOuvert === true);
t('open: next = vault, M = 1', r.prochaine.cle === 'vault' && r.restantes === 1);
/* the vault TBLOCK may already be spent: step 1 is judged done once the vault is paid */
r = await lire({ ...test, tbl: 0, sqrt: 1n << 96n, tickLiq: 5 }, { coffre: true });
t('all done: nothing next, M = 0, button Done', r.prochaine === null && r.restantes === 0 && N.libelleContinue(r).l1 === 'Done — see it on the map');

/* 8. never invent: unread price, unread vault, node errors */
r = await lire({ ...cree }, { part: null });
t('price not read: step 1 not judged, nothing next before it', r.prochaine === null && r.nonLu === true);
r = await lire({ ...test, sqrt: 1n << 96n, tickLiq: 5 }, { coffre: null });
t('vault not read: never "done", never next', r.etapes[2].statut !== 'FAIT' && r.prochaine === null && r.restantes === 1);
r = await lire(test, { panne: (m) => m === 'eth_call' });
t('node error: NON_MESURE, no step', r.etat === 'NON_MESURE' && /could not be read|launch state/.test(r.pourquoi));
t('busy button', N.libelleContinue(r).l1 === 'Waiting for Base nodes…');
r = await N.lireEtatNaissance({ rpc: noeud({}), compte: 'x', bloc: B });
t('bad wallet: NON_MESURE', r.etat === 'NON_MESURE');
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
