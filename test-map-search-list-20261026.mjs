/* test-map-search-list-20261026.mjs — THE MAP SEARCH (top left) SHOWS THE « FIND A BLOCK » LIST WHILE TYPING.
 *
 * QA game56 (Grok Super, read-only, screenshot check3-search-unit.png): typing « unit » in the Map field showed no list;
 *   « Find » jumped straight to the block. The suggestion list only existed in the panel's « Find a block ».
 * THIS BENCH RUNS THE REAL CODE OF app.html (extracted, extraction CHECKED, LF copy and normalised CRLF copy) inside a `vm`, fake DOM,
 *   simulated /api/recherche:
 *   A. typing in #trouver shows, after the typing delay, the list painted by peindreResultatsB20 (the Find a block function)
 *      in #mapResultats, without opening anything;
 *   B. picking a row of the list opens THAT block on the map (the jump) and closes the list;
 *   C. Enter and « Find » keep the chercherBlock jump; a pending keystroke does not repaint the list after the jump;
 *   D. clearing the field closes the list; a shortened address says its sentence;
 *   E. a single list painter in the page (peindreResultatsB20 defined once) and the Map field goes through
 *      brancherRechercheB20, the shared wiring (not a copy).
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const RAW = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const UNIT2 = '0xb2000000000000000000aaaaaaaaaaaaaaaaaaaa';

const extract = (src, name) => {
  const m = new RegExp('\\n(async )?function ' + name + '\\(').exec(src);
  if (!m) return '';
  const i = m.index + 1;
  const f = /\n\}\n/.exec(src.slice(i));
  return f ? src.slice(i, i + f.index + 3) : '';
};
const FN = ['peindreResultatsB20', 'brancherRechercheB20', 'choixEvidentB20', 'choixEvidentOuAdresseB20', 'phraseRechercheVide', 'libelleRangB20',
  'chercherAuServeur', 'adresseAbregee'];

class El {
  constructor(id = '') { this.id = id; this.listeners = {}; this.hidden = true; this._html = ''; this._t = ''; this.value = ''; this.onclick = null; this.clicks = 0; this.classList = { add() {}, remove() {} }; }
  set innerHTML(v) { this._html = String(v); this._t = ''; }
  get innerHTML() { return this._html; }
  set textContent(v) { this._t = String(v); this._html = ''; }
  get textContent() { return this._t || this._html.replace(/<[^>]+>/g, ''); }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  emit(t, ev = {}) { for (const f of this.listeners[t] || []) f({ target: this, key: ev.key, preventDefault() {} }); }
  replaceChildren(...xs) { this._html = xs.map((x) => x.textContent).join(''); }
  click() { this.clicks += 1; }
  scrollIntoView() {}
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function world(src) {
  const els = {};
  for (const id of ['trouver', 'bTrouver', 'mapResultats', 'mapNote', 'mapEtat']) els['#' + id] = new El(id);
  const state = { searches: [], chercherBlock: 0, opened: [] };
  const habitants = [];
  const ctx = {
    console, JSON, String, Number, Array, Set, Map, Object, Promise, Math, RegExp, Error, Date, encodeURIComponent, setTimeout, clearTimeout,
    $: (s) => els[s] || null,
    document: { querySelector: (s) => els[s] || null, addEventListener() {}, createElement: () => new El() },
    enTexte: (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    court: (a) => String(a).slice(0, 6) + '…' + String(a).slice(-4),
    phraseAdresseAbregee: 'This address is shortened (…). Paste the whole address: 42 characters starting with 0x.',
    ADRESSE: /^0x[0-9a-fA-F]{40}$/, habitants, anim: true, animer() {},
    creerHabitant: ({ jeton, symbole }) => { const h = { adr: jeton, sym: symbole, el: new El('bloc-' + jeton) }; habitants.push(h); return h; },
    direMap: (t) => { els['#mapNote'].textContent = t; },
    rechercheB20: async (q) => { state.searches.push(q); return { ok: true, etat: 'TROUVE', total: 2, plus: false,
      resultats: [{ adr: UNIT, sym: 'UNIT', nom: 'Unit', rang: 'SYMBOLE_DEBUT' }, { adr: UNIT2, sym: 'UNITY', nom: null, rang: 'SYMBOLE_DEBUT' }] }; },
    chercherBlock: () => { state.chercherBlock += 1; },
  };
  vm.createContext(ctx);
  const missing = FN.filter((f) => !extract(src, f));
  if (missing.length) throw new Error('EXTRACTION FAILED: ' + missing.join(', ') + ' not found');
  /* the Map field wiring: from the end of chercherAuServeur up to the doc comment of poserNosBlocks */
  const server = extract(src, 'chercherAuServeur');
  const i = server ? src.indexOf(server) + server.length : -1, f = i > 0 ? (() => { const k = src.slice(i).search(/\/\*\*\r?\n \* Pose NOS blocks/); return k < 0 ? -1 : i + k; })() : -1;
  if (!(i > 0 && f > i)) throw new Error('EXTRACTION FAILED: the #trouver wiring was not found');
  const open = extract(src, 'openOnMapB20');
  const wiring = src.slice(i, f);
  if (!/#trouver/.test(wiring)) throw new Error('EXTRACTION FAILED: #trouver missing from the extracted wiring');
  vm.runInContext(FN.map((n) => extract(src, n)).join('\n') + '\n' + open + '\n' + wiring, ctx);
  return { ctx, els, state, habitants, type: (v) => { els['#trouver'].value = v; els['#trouver'].emit('input'); },
    pick: (adr) => { const l = els['#mapResultats']; l.onclick({ target: { closest: () => ({ getAttribute: (k) => (k === 'data-rb-adr' ? adr : 'SYM') }) } }); } };
}

async function check(src, name) {
  const ko = [];
  const kase = async (t, fn) => { try { await fn(); } catch (e) { ko.push(name + ' ' + t + ' — ' + String(e && e.message || e).split('\n')[0]); } };
  const must = (c, m) => { if (!c) throw new Error(m); };
  await kase('A list while typing', async () => {
    const w = world(src);
    w.type('unit'); await wait(350);
    const l = w.els['#mapResultats'];
    must(w.state.searches.join() === 'unit', 'A /api/recherche not queried while typing: ' + JSON.stringify(w.state.searches));
    must(!l.hidden && /data-rb-adr="0xb2000000000000000000007afa7ed748b0874f27"/.test(l.innerHTML) && /class="rbChoix"/.test(l.innerHTML),
      'A no list under the Map field (hidden=' + l.hidden + '): « ' + l.innerHTML.slice(0, 120) + ' »');
    must(/data-rb-adr="0xb2000000000000000000aaaaaaaaaaaaaaaaaaaa"/.test(l.innerHTML), 'A the second suggestion is missing');
    must(w.habitants.length === 0 && w.state.chercherBlock === 0, 'A typing opened a block without a pick');
  });
  await kase('B pick jumps', async () => {
    const w = world(src);
    w.type('unit'); await wait(350);
    must(typeof w.els['#mapResultats'].onclick === 'function', 'B the list has no clickable pick');
    w.pick(UNIT2);
    const h = w.habitants.find((x) => x.adr === UNIT2);
    must(h && h.el.clicks === 1, 'B picking UNITY did not open UNITY on the map');
    must(w.els['#mapResultats'].hidden, 'B the list stays open after the pick');
  });
  await kase('C Enter / Find', async () => {
    const w = world(src);
    w.type('unit');
    w.els['#trouver'].emit('keydown', { key: 'Enter' });
    must(w.state.chercherBlock === 1, 'C Enter does not call chercherBlock once: ' + w.state.chercherBlock);
    await wait(350);
    must(w.state.searches.length === 0 && w.els['#mapResultats'].hidden, 'C a pending keystroke repainted the list after the Enter jump');
    w.type('unit');
    w.els['#bTrouver'].emit('click');
    must(w.state.chercherBlock === 2, 'C « Find » does not call chercherBlock');
    await wait(350);
    must(w.state.searches.length === 0, 'C a pending keystroke repainted the list after « Find »');
  });
  await kase('D clear / shortened', async () => {
    const w = world(src);
    w.type('unit'); await wait(350);
    w.type(''); await wait(300);
    must(w.els['#mapResultats'].hidden, 'D clearing the field does not close the list');
    w.type('0xb200…4f27'); await wait(300);
    must(/shortened/.test(w.els['#mapResultats'].textContent), 'D a shortened address does not say its sentence');
  });
  await kase('E a single list', async () => {
    must((src.match(/\nfunction peindreResultatsB20\(/g) || []).length === 1, 'E peindreResultatsB20 is not defined exactly once');
    must(/brancherRechercheB20\(\{ champ: \$\('#trouver'\), liste: \$\('#mapResultats'\)/.test(src), 'E the Map field does not go through brancherRechercheB20');
  });
  return ko;
}

const LF = RAW.replace(/\r\n/g, '\n');
const CRLF = LF.replace(/\n/g, '\r\n');
if (!/\r\n/.test(CRLF)) throw new Error('WITNESS: the CRLF copy has no CRLF');
const ko = [...await check(LF, 'LF'), ...await check(CRLF.replace(/\r\n/g, '\n'), 'CRLF')];
console.log(ko.length ? ko.map((k) => 'KO ' + k).join('\n') : 'ok');
console.log('test-map-search-list-20261026: ' + ko.length + ' KO');
process.exit(ko.length ? 1 : 0);
