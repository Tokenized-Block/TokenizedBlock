/* test-revue-instantane-du-block-20261010.mjs - LA REVUE D UN ECHANGE NE JUGE PAS AVEC LE CERVEAU D UN AUTRE BLOCK (re-QA Grok Super, prod
 * 20261010-p1-panneau-live, IB022 : 'Its brain (calm) accepts.' / 'Connect your wallet first.' avec Price et Liquidity a '-').
 * EXECUTE bcSnapDe et la ligne du ticket extraites d app.html (TB_APP = ancienne) ; lit la porte de bcProposerSwap.
 * AFFIRME : un instantane d un AUTRE block ne sert pas (ni 'accepts' ni humeur) ; celui du block sert ; la porte du swap lit snapMoi ;
 * sans wallet, la revue dit 'Not measured ... Nothing was sent.' NE PROUVE PAS : le rendu navigateur ; d ou venait 'calm' (NON mesure).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const L = html.split(/\r?\n/);
const l1 = L.find((l) => l.startsWith('function bcSnapDe('));
assert.ok(l1, 'bcSnapDe absente : l instantane global juge n importe quel block');
const l2 = L.find((l) => l.startsWith('function bcMarcheLue('));
const l3 = L.find((l) => l.startsWith('function bcCerveauAttend('));
assert.ok(l3, 'bcCerveauAttend absente : la porte et le ticket ne partagent pas le meme predicat d attente');
const window = {};
const { bcSnapDe, bcMarcheLue, bcCerveauAttend } = new Function('window', l1 + '\n' + l2 + '\n' + l3 + '; return { bcSnapDe, bcMarcheLue, bcCerveauAttend };')(window);
const IB = '0x' + 'b2'.repeat(20), DJ = '0x' + 'd1'.repeat(20);
const djtc = { address: DJ, tick: 5, phase: 'CALME', humeur: 'calm', marche: { etatVie: 'LUE', vie: 2 } };
window.__TB_BRAIN_SNAPSHOT__ = djtc;
assert.equal(bcSnapDe(IB), null, 'l instantane de DJTc juge IB022');
assert.equal(bcSnapDe(DJ), djtc);
assert.equal(bcSnapDe(IB.toUpperCase().replace('0X', '0x')), null);
/* ticket : avec l instantane de DJTc ouvert sur IB022 -> jamais 'accepts' */
const iT = L.findIndex((l) => l.includes("snap = bcSnapDe(a, snap);"));
assert.ok(iT > 0, 'le ticket ne filtre pas l instantane');
const lt = L.find((l) => l.includes("!aBattu ? 'Brain: waking up")).trim();
const ticket = (a, snap) => new Function('a', 'snap', 'bcSnapDe', 'bcMarcheLue', 'bcCerveauAttend', 'tacheAutorisee', 'ACTIONS_PAR_ADR', 'bcRaison',
  L[iT].trim() + "\nconst g = tacheAutorisee('trade_tblock', snap || {}), humeur = (snap && snap.humeur) || 'unread';\nconst aBattu = !!snap && snap.tick !== null && snap.tick !== undefined;\nconst estAction = false;\n" + lt + '; return t;')(
  a, snap, bcSnapDe, bcMarcheLue, bcCerveauAttend, () => ({ ok: true }), new Set(), (x) => x);
assert.doesNotMatch(ticket(IB, djtc), /accepts|calm/, 'ticket IB022 juge avec DJTc');
assert.match(ticket(DJ, djtc), /calm .* accepts/);
/* porte de la revue */
const k = html.indexOf('async function bcProposerSwap(');
const corps = html.slice(k, html.indexOf('const refuser = ()', k));
assert.ok(corps.includes('const snapMoi = bcSnapDe(moi);') && corps.includes("tacheAutorisee('trade_tblock', snapMoi || {})"), 'la revue juge avec l instantane global');
/* 2026-10-10 : la condition passe par bcCerveauAttend (NON_LU attend aussi) ; on EXECUTE qu une revue sans instantane du block attend */
assert.ok(corps.includes('if (bcCerveauAttend(snapMoi, g))'), 'la porte de la revue ne passe pas par bcCerveauAttend');
assert.equal(bcCerveauAttend(null, { ok: true }), true, 'la revue peut dire accepts sans instantane du block');
assert.equal(bcCerveauAttend(bcSnapDe(IB), { ok: true }), true, 'la revue juge IB022 avec l instantane de DJTc');
assert.ok(!/__TB_BRAIN_SNAPSHOT__/.test(corps), 'la revue lit encore l instantane global');
const plan = html.slice(html.indexOf('const planifier = async () => {', k), html.indexOf('const planifier = async () => {', k) + 400);
assert.match(plan, /Not measured \\u2014 no wallet connected, so no plan was built\. Nothing was sent\./, 'sans wallet, aucun etat du plan');
console.log('ok revue-instantane-du-block - un autre block ne juge jamais ; etat sans wallet ; NE PROUVE PAS le rendu navigateur');