/* test-market-buy-stock-pivots-20261026.mjs — THE BUY TICKET OFFERS A STOCK THE PIVOTS THE SERVER ROUTES, AND STATES STEP 2.
 *
 * QA game56 (Grok Super, read-only): Market > Buy on the METAc row only offered USDC / ETH, while UNIT offered cbBTC, WETH
 *   and AUDF « routed »; and after « Review », no step 2 note appeared on the ticket.
 * THIS BENCH RUNS THE REAL FUNCTIONS OF app.html (extracted, extraction CHECKED, LF copy and CRLF copy) inside a `vm`:
 *   P. METAc (Aerodrome table): the ticket offers USDC, ETH and EXACTLY the pivots for which the server's REAL planner
 *      (rails-api.js planRail, offline chain reader) picks a route (X -> USDC -> METAc, planAerodromeSegment);
 *   Q. AMDc (outside the Aerodrome table): no pivot, and planRail does REFUSE it — nothing is offered that the server would refuse;
 *   R. UNIT (block quoted in ETH) keeps its pivots; selling offers none;
 *   S. the card (pivotsPourPayWith with the target) follows the same rule for a stock;
 *   T. after an accepted Review, the « Step 2 — … » note is on the ticket, survives repaints, goes away on typing; a refused Review
 *      does not set it.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as EVB from './entree-vers-bloc.js';
import { planRail } from './rails-api.js';

const RAW = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const ETH = '0x0000000000000000000000000000000000000000';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const AUDF = '0xd2a530170d71a9cfe1651fb468e2b98f7ed7456b';
const CBBTC = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf';
const WETH = '0x4200000000000000000000000000000000000006';
const METAC = '0xb2000000000000000000008bc8786b856e61707c';
const AMDC = '0xb2000000000000000000000d8ce462e99ee7a47b';
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const W1 = '0x00000000000000000000000000000000c0ffee77';
const PIVOTS = [AUDF, CBBTC, WETH];

const extract = (src, name) => {
  const m = new RegExp('\\n(async )?function ' + name + '\\(').exec(src);
  if (!m) return '';
  const i = m.index + 1;
  const f = /\n\}\n/.exec(src.slice(i));
  return f ? src.slice(i, i + f.index + 3) : '';
};

class El {
  constructor(tag = 'div', id = '') { this.tag = tag; this.id = id; this.children = []; this._t = ''; this.className = ''; this.dataset = {}; this.listeners = {}; this.attrs = {}; this.disabled = false; this.hidden = false; this._v = ''; this.open = false; }
  get textContent() { return this._t || this.children.map((e) => e.textContent).join(''); }
  set textContent(v) { this._t = String(v); if (v === '') this.children = []; }
  get value() { return this._v; }
  set value(v) { this._v = String(v); }
  append(...xs) { for (const x of xs) this.children.push(x); }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  emit(t) { for (const f of this.listeners[t] || []) f({ target: this, preventDefault() {} }); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  focus() {}
  remove() {}
  get classList() { return { contains: () => false }; }
}
class Sel extends El {
  constructor(id) { super('select', id); this.selectedIndex = -1; }
  get options() { return this.children; }
  get value() { return this.selectedIndex >= 0 && this.children[this.selectedIndex] ? this.children[this.selectedIndex].value : ''; }
  set value(v) { this.selectedIndex = this.children.findIndex((o) => o.value === String(v)); }
  set textContent(v) { this.children = []; this.selectedIndex = -1; }
  get textContent() { return ''; }
  append(...xs) { for (const x of xs) { this.children.push(x); if (this.selectedIndex < 0 && !x.disabled) this.selectedIndex = this.children.length - 1; } }
  pick(v) { this.value = v; this.emit('change'); }
}
const bcEl = (tag, o = {}, kids = []) => { const e = new El(tag); if (o.value !== undefined) e.value = o.value; if (o.text !== undefined) e.textContent = o.text; if (o.cls) e.className = o.cls; for (const k of kids) e.append(k); return e; };

const TICKET_FN = ['phraseMontantRetire', 'bcAvancerTicket', 'bcSymTicket', 'bcIntentionTicket', 'bcGardeTicket', 'bcNoteMontantTicket',
  'bcTicketDeviseChangee', 'bcPeindreTicket', 'bcChoixPaiement', 'pivotsPourPayWith'];

function ticketWorld(src, { block = UNIT, account = null, execOk = true } = {}) {
  const els = {};
  for (const id of ['bcMontant', 'bcRapides', 'bcTicketNote', 'bcTicketLib', 'bcTicketGo', 'bcTicketBrain', 'bcTicketRef', 'bcPosition', 'bcPop', 'bc-trade', 'bcTicket']) els['#' + id] = new El('div', id);
  els['#bcDevise'] = new Sel('bcDevise');
  const sides = ['buy', 'sell'].map((c) => { const b = new El('button'); b.attrs['data-cote'] = c; return b; });
  const state = { executed: [] };
  const stocks = new Map([[METAC, { symbole: 'METAc' }], [AMDC, { symbole: 'AMDc' }]]);
  const ctx = {
    console, JSON, String, Number, BigInt, Array, Set, Map, Object, Promise, Math, RegExp, Error, Date,
    $: (s) => els[s] || null,
    document: { querySelectorAll: (q) => (q === '#bcTicket [data-cote]' ? sides : []) },
    bc: { session: null, cote: 'buy', ticketDe: null, soldes: null, soldesLus: 0, soldesEnVol: false, nomEssai: new Map() },
    brainAdr: block, compte: account, ETH_ADR: ETH, CHAINE: 8453, marcheParAdr: new Map(),
    ACTIONS_PAR_ADR: stocks, ACTIONS_COINBASE: [...stocks].map(([adr, x]) => ({ adr, symbole: x.symbole })),
    POOLS_ACTIONS_AERODROME: new Map([[METAC, {}]]), bcActionsV4: () => new Set([AMDC]),
    bcCotation: (a) => (stocks.has(a) ? { ok: true, adr: USDC, sym: 'USDC' } : { ok: true, adr: ETH, sym: 'ETH' }),
    bcResoudre: (r) => (r === 'USDC' ? { ok: true, adr: USDC, sym: 'USDC' } : /^0x[0-9a-fA-F]{40}$/.test(r) ? { ok: true, adr: r.toLowerCase(), sym: r.slice(0, 6) } : { ok: false }),
    devisesPivotVersBloc: EVB.devisesPivotVersBloc, pivotCurrenciesForStock: EVB.pivotCurrenciesForStock,
    soldesPivots: new Map(), bcIdentite: () => {}, bcEl,
    bcSnapDe: () => null, tacheAutorisee: () => ({ ok: true }), bcCerveauAttend: () => false, bcRaison: (x) => x,
    bcRefs: new Map(), phraseReference: () => ({ texte: '', alerte: false }), bcLireSoldes: async () => {}, bcLireReference: async () => {},
    connecter: async () => {}, bcUnites: (b) => String(b), bcDecimal: (b) => String(b), equivalentActions: () => null, court: (a) => String(a).slice(0, 6),
    bcExecuterTexte: async (text, note, guard) => {
      state.executed.push({ text, guard });
      if (!execOk) { note.className = 'note wKo'; note.textContent = 'the decimals could not be read — try again'; return false; }
      note.className = 'note'; note.textContent = ''; return true;
    },
  };
  ctx.bcRepeindre = () => ctx.__.bcPeindreTicket(ctx.brainAdr, 'SYM', null, null);
  vm.createContext(ctx);
  const missing = TICKET_FN.filter((f) => !extract(src, f));
  if (missing.length) throw new Error('EXTRACTION FAILED: ' + missing.join(', ') + ' not found in app.html');
  const iL = src.indexOf('/* ── le ticket de l onglet Trade ── */'), fL = src.indexOf('/* ── LE SWAP DU WALLET', iL);
  if (!(iL > 0 && fL > iL)) throw new Error('EXTRACTION FAILED: the ticket listeners were not found');
  const quick = /const BC_RAPIDES = (\{[^\n]*\});/.exec(src);
  if (!quick) throw new Error('EXTRACTION FAILED: BC_RAPIDES not found');
  vm.runInContext('const BC_RAPIDES = ' + quick[1] + ';\n' + TICKET_FN.map((f) => extract(src, f)).join('\n') + '\n' + src.slice(iL, fL)
    + '\nthis.__ = { ' + TICKET_FN.join(', ') + ' };', ctx);
  const s = els['#bcDevise'], field = els['#bcMontant'];
  return {
    ctx, els, state, s, field, sides,
    paint: () => ctx.bcRepeindre(),
    vals: () => s.options.map((o) => o.value),
    type: (v) => { field.value = v; field.emit('input'); },
    submit: async () => { for (const f of els['#bcTicket'].listeners.submit || []) await f({ preventDefault() {} }); },
  };
}

/* what the server's REAL planner makes of (pivot -> target), without a chain: a chosen route, or a refusal */
const offlineRpc = async () => { throw new Error('offline bench'); };
async function serverRoute(from, to) {
  const p = await planRail({ de: from, vers: to, montant: '1000000', compte: W1 }, { rpc: offlineRpc, chaine: 8453 });
  const routed = p.etat !== 'REFUSE' && p.via === 'planAerodromeSegment' && Array.isArray(p.chemin) && p.chemin.length === 2
    && p.chemin[0].de === from && p.chemin[0].vers === USDC && p.chemin[1].vers === to;
  return { routed, refused: p.etat === 'REFUSE', p };
}

async function check(src, copyName) {
  const ko = [];
  const kase = async (title, f) => { try { await f(); } catch (e) { ko.push(copyName + ' ' + title + ' — ' + String(e && e.message || e).split('\n')[0]); } };
  const must = (c, m) => { if (!c) throw new Error(m); };

  await kase('P0', async () => must(typeof EVB.pivotCurrenciesForStock === 'function', 'entree-vers-bloc.js does not export pivotCurrenciesForStock'));
  await kase('P METAc', async () => {
    const expected = [];
    for (const x of PIVOTS) { const r = await serverRoute(x, METAC); if (r.routed) expected.push(x); }
    must(expected.length === 3, 'P WITNESS: planRail routes only ' + expected.length + '/3 pivots to METAc');
    const w = ticketWorld(src, { block: METAC });
    w.paint();
    const vs = w.vals();
    must(vs.includes('USDC') && vs.includes('ETH'), 'P USDC / ETH are no longer offered for METAc: ' + JSON.stringify(vs));
    const offered = vs.filter((v) => PIVOTS.includes(v)).sort();
    must(JSON.stringify(offered) === JSON.stringify(expected.sort()), 'P METAc: pivots offered ' + JSON.stringify(offered) + ' instead of those the server routes ' + JSON.stringify(expected));
    const o = w.s.options.find((x) => x.value === CBBTC);
    must(o && /cbBTC — routed/.test(o.textContent) && o.dataset.sym === 'cbBTC', 'P the cbBTC option does not say « cbBTC — routed »');
    must(w.s.value === 'USDC', 'P the default for a stock is no longer USDC: ' + w.s.value);
  });
  await kase('Q AMDc', async () => {
    for (const x of PIVOTS) { const r = await serverRoute(x, AMDC); must(r.refused, 'Q WITNESS: planRail does not refuse ' + x + ' -> AMDc (' + r.p.etat + ')'); }
    const w = ticketWorld(src, { block: AMDC });
    w.paint();
    must(!w.vals().some((v) => PIVOTS.includes(v)), 'Q a pivot is offered for AMDc, which the server refuses: ' + JSON.stringify(w.vals()));
  });
  await kase('R UNIT', async () => {
    const w = ticketWorld(src, { block: UNIT });
    w.paint();
    must(PIVOTS.every((p) => w.vals().includes(p)), 'R UNIT lost its pivots: ' + JSON.stringify(w.vals()));
    const v = ticketWorld(src, { block: METAC }); v.paint(); v.sides[1].emit('click'); v.paint();
    must(!v.vals().some((x) => PIVOTS.includes(x)), 'R a pivot is offered when SELLING METAc');
  });
  await kase('S card', async () => {
    const w = ticketWorld(src, { block: UNIT });
    const pp = w.ctx.__.pivotsPourPayWith;
    must(pp(USDC, [], METAC).map((p) => p.devise).sort().join() === [...PIVOTS].sort().join(), 'S the METAc card does not offer the three pivots');
    must(pp(USDC, [], AMDC).length === 0, 'S the AMDc card offers a pivot the server refuses');
    must(pp(ETH, [], UNIT).length === 3, 'S the UNIT card lost its pivots');
  });
  await kase('T step 2', async () => {
    const w = ticketWorld(src, { block: METAC, account: W1 });
    w.paint(); w.s.pick('USDC'); w.paint(); w.type('5');
    await w.submit();
    must(w.state.executed.length === 1 && w.state.executed[0].text === 'buy this with 5 USDC',
      'T the Review command is not the USDC buy: ' + JSON.stringify(w.state.executed));
    const n = w.els['#bcTicketNote'];
    must(/^Step 2 — /.test(n.textContent) && /Chat/.test(n.textContent) && /wallet/.test(n.textContent), 'T no step 2 note after Review: « ' + n.textContent + ' »');
    must(!/wKo/.test(n.className), 'T the step 2 note is marked as an error');
    for (let i = 0; i < 5; i += 1) w.paint();
    must(/^Step 2 — /.test(n.textContent), 'T the step 2 note does not survive repaints');
    w.type('0.002');
    must(n.textContent === '', 'T the step 2 note stays after a new keystroke: « ' + n.textContent + ' »');
    const r = ticketWorld(src, { block: METAC, account: W1, execOk: false });
    r.paint(); r.type('5'); await r.submit();
    must(!/Step 2/.test(r.els['#bcTicketNote'].textContent) && /could not be read/.test(r.els['#bcTicketNote'].textContent), 'T a refused Review sets a step 2 note');
  });
  return ko;
}

const LF = RAW.replace(/\r\n/g, '\n');
const CRLF = LF.replace(/\n/g, '\r\n');
const ko = [...await check(LF, 'LF'), ...await check(CRLF.replace(/\r\n/g, '\n'), 'CRLF')];
if (!/\r\n/.test(CRLF)) ko.push('WITNESS: the CRLF copy has no CRLF');
console.log(ko.length ? ko.map((k) => 'KO ' + k).join('\n') : 'ok');
console.log('test-market-buy-stock-pivots-20261026: ' + ko.length + ' KO');
process.exit(ko.length ? 1 : 0);
