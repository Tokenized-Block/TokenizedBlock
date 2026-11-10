/* test-coeurs-20261110.mjs — hearts given / received / leaderboard from BlockLikes `Liked` logs (coeurs.js). */
import { TOPIC_LIKED, decoderLiked, dedoublonner, classement, vueCompte } from './coeurs.js';

let ok = 0, ko = 0;
const eq = (a, b, m) => { const s = (x) => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? v.toString() + 'n' : v)); if (s(a) === s(b)) ok++; else { ko++; console.log('KO', m, '\n   got', s(a), '\n  want', s(b)); } };

const LIKES = '0x343a289d5469a17726be9a0d219ee00721646f8a';
const pad = (a) => '0x' + a.slice(2).padStart(64, '0');
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const B1 = '0xb200000000000000000000000000000000000001', B2 = '0xb200000000000000000000000000000000000002', B3 = '0xb200000000000000000000000000000000000003';
const ALICE = '0x00000000000000000000000000000000000a11ce', BOB = '0x0000000000000000000000000000000000000b0b', CAROL = '0x00000000000000000000000000000000000ca201';
const E18 = 10n ** 18n;
let seq = 0;
const log = (bloc, liker, likes, { at = LIKES, t0 = TOPIC_LIKED, bn = 100, tx = null, idx = 0 } = {}) => ({
  address: at, topics: [t0, pad('0x0'), pad(bloc), pad(liker)], data: '0x' + u(likes) + u(BigInt(likes) * 86000n * E18),
  blockNumber: '0x' + bn.toString(16), transactionHash: tx || ('0x' + (++seq).toString(16).padStart(64, '0')), logIndex: '0x' + idx.toString(16),
});

/* decode */
eq(TOPIC_LIKED, '0x5a8c645cdaefe2660dc84621f436ca9648ca52cc47cf7172930c34f95d1c6f26', 'topic = the one read on mainnet 2026-11-10');
const d = decoderLiked(log(B1, ALICE, 2), LIKES);
eq([d.bloc, d.liker, d.likes, d.burned], [B1, ALICE, 2n, 172000n * E18], 'decodes block, liker, likes, burned');
eq(decoderLiked(log(B1, ALICE, 2, { at: '0x000000000000000000000000000000000000beef' }), LIKES), null, 'a Liked from ANOTHER contract is refused');
eq(decoderLiked(log(B1, ALICE, 2, { t0: '0x' + '11'.repeat(32) }), LIKES), null, 'another topic is refused');
eq(decoderLiked({ ...log(B1, ALICE, 1), data: '0x1234' }, LIKES), null, 'malformed data is refused');
eq(decoderLiked({ ...log(B1, ALICE, 1), topics: [TOPIC_LIKED] }, LIKES), null, 'missing indexed topics refused');
eq(decoderLiked(log(B1, ALICE, 1), null), null, 'no BlockLikes address = nothing accepted');

/* dedupe */
const same = log(B1, ALICE, 1, { tx: '0x' + 'ab'.repeat(32), idx: 3 });
eq(dedoublonner([decoderLiked(same, LIKES), decoderLiked(same, LIKES)]).length, 1, 'the same log read twice counts once');
eq(dedoublonner([decoderLiked(log(B1, ALICE, 1, { tx: '0x' + 'ab'.repeat(32), idx: 3 }), LIKES), decoderLiked(log(B1, ALICE, 1, { tx: '0x' + 'ab'.repeat(32), idx: 4 }), LIKES)]).length, 2, 'two logs of one tx both count');

/* leaderboard */
const H = [
  log(B1, ALICE, 1, { bn: 10 }), log(B2, ALICE, 1, { bn: 11 }),      /* alice 2 hearts */
  log(B1, BOB, 2, { bn: 5 }),                                       /* bob 2 hearts, earlier */
  log(B3, CAROL, 5, { bn: 20 }),                                    /* carol 5 */
].map((l) => decoderLiked(l, LIKES));
const c = classement(H);
eq(c.map((e) => e.liker), [CAROL, BOB, ALICE], 'ranked by TBLOCK burned; a tie goes to who came FIRST (bob block 5 before alice block 10)');
eq([c[2].likes, c[2].blocs, c[0].rang], [2n, 2, 1], 'alice: 2 hearts on 2 blocks; rank starts at 1');
eq(classement(H, 1).length, 1, 'max respected');
const desordre = [log(B1, ALICE, 1, { bn: 10 }), log(B2, ALICE, 1, { bn: 3 }), log(B1, BOB, 2, { bn: 5 })].map((l) => decoderLiked(l, LIKES));
eq(classement(desordre).map((e) => e.liker), [ALICE, BOB], 'logs out of order: alice\'s EARLIEST heart (block 3) is what breaks the tie');
eq(classement([]), [], 'no heart yet = empty board (mainnet today: 0 Liked)');

/* one wallet: given / received / given back */
const createurs = new Map([[B1, ALICE], [B2, BOB], [B3, ALICE]]);
const crDe = (b) => createurs.get(b) || null;
const W = [
  log(B1, BOB, 3), log(B3, CAROL, 1), log(B1, ALICE, 4), /* alice hearts her own block: not "received" */
  log(B2, ALICE, 2),                                    /* alice gives back 2 to bob's block */
].map((l) => decoderLiked(l, LIKES));
const va = vueCompte(W, ALICE.toUpperCase().replace('0X', '0x'), crDe);
eq(va.recus.likes, 4n, 'alice received 3 (bob) + 1 (carol); her own heart is not received');
eq(va.recus.de, [{ liker: BOB, likes: 3n, rendus: 2n }, { liker: CAROL, likes: 1n, rendus: 0n }], 'per giver: hearts received and hearts given back to their blocks');
eq([va.donnes.likes, va.donnes.vers], [6n, [{ bloc: B1, likes: 4n }, { bloc: B2, likes: 2n }]], 'alice gave 6 hearts: 4 to B1, 2 to B2');
const vb = vueCompte(W, BOB, crDe);
eq([vb.recus.likes, vb.recus.de[0].rendus], [2n, 3n], 'bob received 2 from alice and had given 3 to alice\'s blocks');
const vx = vueCompte(W, CAROL, () => null);
eq([vx.recus.likes, vx.blocsSansCreateur, vx.donnes.likes], [0n, 3, 1n], 'unknown creators: nothing counted as received, and the count of such blocks is said');
let threw = false; try { vueCompte(W, 'nope', crDe); } catch (_) { threw = true; }
eq(threw, true, 'a non-address wallet throws');

console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
