/* test-market-buy-pivots-action-20261026.mjs — LE TICKET BUY OFFRE A UNE ACTION LES PIVOTS QUE LE SERVEUR ROUTE, ET DIT L ETAPE 2.
 *
 * QA game56 (Grok Super, lecture seule) : Market > Buy sur la ligne METAc n offrait que USDC / ETH, alors que UNIT offrait cbBTC, WETH
 *   et AUDF « routed » ; et apres « Review », aucune note d etape 2 n apparaissait sur le ticket.
 * CE BANC EXECUTE LES VRAIES FONCTIONS DE app.html (extraites, extraction VERIFIEE, copie LF et copie CRLF) dans un `vm` :
 *   P. METAc (table Aerodrome) : le ticket offre USDC, ETH et EXACTEMENT les pivots pour lesquels le VRAI planificateur du serveur
 *      (rails-api.js planRail, lecteur de chaine hors ligne) choisit une route (X -> USDC -> METAc, planAerodromeSegment) ;
 *   Q. AMDc (hors table Aerodrome) : aucun pivot, et planRail le REFUSE bien — rien n est offert que le serveur refuserait ;
 *   R. UNIT (block cote en ETH) garde ses pivots ; la vente n en offre aucun ;
 *   S. la fiche (pivotsPourPayWith avec la cible) suit la meme regle pour une action ;
 *   T. apres un Review accepte, la note « Step 2 — … » est sur le ticket, tient aux repeints, part a la frappe ; un Review refuse
 *      ne la pose pas.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as EVB from './entree-vers-bloc.js';
import { planRail } from './rails-api.js';

const BRUT = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
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

const extraire = (src, nom) => {
  const m = new RegExp('\\n(async )?function ' + nom + '\\(').exec(src);
  if (!m) return '';
  const i = m.index + 1;
  const f = /\n\}\n/.exec(src.slice(i));
  return f ? src.slice(i, i + f.index + 3) : '';
};

class El {
  constructor(tag = 'div', id = '') { this.tag = tag; this.id = id; this.enfants = []; this._t = ''; this.className = ''; this.dataset = {}; this.ecoute = {}; this.attrs = {}; this.disabled = false; this.hidden = false; this._v = ''; this.open = false; }
  get textContent() { return this._t || this.enfants.map((e) => e.textContent).join(''); }
  set textContent(v) { this._t = String(v); if (v === '') this.enfants = []; }
  get value() { return this._v; }
  set value(v) { this._v = String(v); }
  append(...xs) { for (const x of xs) this.enfants.push(x); }
  addEventListener(t, f) { (this.ecoute[t] ||= []).push(f); }
  emettre(t) { for (const f of this.ecoute[t] || []) f({ target: this, preventDefault() {} }); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  focus() {}
  remove() {}
  get classList() { return { contains: () => false }; }
}
class Sel extends El {
  constructor(id) { super('select', id); this.selectedIndex = -1; }
  get options() { return this.enfants; }
  get value() { return this.selectedIndex >= 0 && this.enfants[this.selectedIndex] ? this.enfants[this.selectedIndex].value : ''; }
  set value(v) { this.selectedIndex = this.enfants.findIndex((o) => o.value === String(v)); }
  set textContent(v) { this.enfants = []; this.selectedIndex = -1; }
  get textContent() { return ''; }
  append(...xs) { for (const x of xs) { this.enfants.push(x); if (this.selectedIndex < 0 && !x.disabled) this.selectedIndex = this.enfants.length - 1; } }
  choisir(v) { this.value = v; this.emettre('change'); }
}
const bcEl = (tag, o = {}, kids = []) => { const e = new El(tag); if (o.value !== undefined) e.value = o.value; if (o.text !== undefined) e.textContent = o.text; if (o.cls) e.className = o.cls; for (const k of kids) e.append(k); return e; };

const TICKET_FN = ['phraseMontantRetire', 'bcAvancerTicket', 'bcSymTicket', 'bcIntentionTicket', 'bcGardeTicket', 'bcNoteMontantTicket',
  'bcTicketDeviseChangee', 'bcPeindreTicket', 'bcChoixPaiement', 'pivotsPourPayWith'];

function mondeTicket(src, { bloc = UNIT, compte = null, execOk = true } = {}) {
  const els = {};
  for (const id of ['bcMontant', 'bcRapides', 'bcTicketNote', 'bcTicketLib', 'bcTicketGo', 'bcTicketBrain', 'bcTicketRef', 'bcPosition', 'bcPop', 'bc-trade', 'bcTicket']) els['#' + id] = new El('div', id);
  els['#bcDevise'] = new Sel('bcDevise');
  const cotes = ['buy', 'sell'].map((c) => { const b = new El('button'); b.attrs['data-cote'] = c; return b; });
  const etat = { executes: [] };
  const actions = new Map([[METAC, { symbole: 'METAc' }], [AMDC, { symbole: 'AMDc' }]]);
  const ctx = {
    console, JSON, String, Number, BigInt, Array, Set, Map, Object, Promise, Math, RegExp, Error, Date,
    $: (s) => els[s] || null,
    document: { querySelectorAll: (q) => (q === '#bcTicket [data-cote]' ? cotes : []) },
    bc: { session: null, cote: 'buy', ticketDe: null, soldes: null, soldesLus: 0, soldesEnVol: false, nomEssai: new Map() },
    brainAdr: bloc, compte, ETH_ADR: ETH, CHAINE: 8453, marcheParAdr: new Map(),
    ACTIONS_PAR_ADR: actions, ACTIONS_COINBASE: [...actions].map(([adr, x]) => ({ adr, symbole: x.symbole })),
    POOLS_ACTIONS_AERODROME: new Map([[METAC, {}]]), bcActionsV4: () => new Set([AMDC]),
    bcCotation: (a) => (actions.has(a) ? { ok: true, adr: USDC, sym: 'USDC' } : { ok: true, adr: ETH, sym: 'ETH' }),
    bcResoudre: (r) => (r === 'USDC' ? { ok: true, adr: USDC, sym: 'USDC' } : /^0x[0-9a-fA-F]{40}$/.test(r) ? { ok: true, adr: r.toLowerCase(), sym: r.slice(0, 6) } : { ok: false }),
    devisesPivotVersBloc: EVB.devisesPivotVersBloc, devisesPivotVersAction: EVB.devisesPivotVersAction,
    soldesPivots: new Map(), bcIdentite: () => {}, bcEl,
    bcSnapDe: () => null, tacheAutorisee: () => ({ ok: true }), bcCerveauAttend: () => false, bcRaison: (x) => x,
    bcRefs: new Map(), phraseReference: () => ({ texte: '', alerte: false }), bcLireSoldes: async () => {}, bcLireReference: async () => {},
    connecter: async () => {}, bcUnites: (b) => String(b), bcDecimal: (b) => String(b), equivalentActions: () => null, court: (a) => String(a).slice(0, 6),
    bcExecuterTexte: async (texte, note, garde) => {
      etat.executes.push({ texte, garde });
      if (!execOk) { note.className = 'note wKo'; note.textContent = 'the decimals could not be read — try again'; return false; }
      note.className = 'note'; note.textContent = ''; return true;
    },
  };
  ctx.bcRepeindre = () => ctx.__.bcPeindreTicket(ctx.brainAdr, 'SYM', null, null);
  vm.createContext(ctx);
  const manquantes = TICKET_FN.filter((f) => !extraire(src, f));
  if (manquantes.length) throw new Error('EXTRACTION RATEE : ' + manquantes.join(', ') + ' introuvable(s) dans app.html');
  const iL = src.indexOf('/* ── le ticket de l onglet Trade ── */'), fL = src.indexOf('/* ── LE SWAP DU WALLET', iL);
  if (!(iL > 0 && fL > iL)) throw new Error('EXTRACTION RATEE : les ecouteurs du ticket sont introuvables');
  const rap = /const BC_RAPIDES = (\{[^\n]*\});/.exec(src);
  if (!rap) throw new Error('EXTRACTION RATEE : BC_RAPIDES introuvable');
  vm.runInContext('const BC_RAPIDES = ' + rap[1] + ';\n' + TICKET_FN.map((f) => extraire(src, f)).join('\n') + '\n' + src.slice(iL, fL)
    + '\nthis.__ = { ' + TICKET_FN.join(', ') + ' };', ctx);
  const s = els['#bcDevise'], champ = els['#bcMontant'];
  return {
    ctx, els, etat, s, champ, cotes,
    peindre: () => ctx.bcRepeindre(),
    vals: () => s.options.map((o) => o.value),
    taper: (v) => { champ.value = v; champ.emettre('input'); },
    soumettre: async () => { for (const f of els['#bcTicket'].ecoute.submit || []) await f({ preventDefault() {} }); },
  };
}

/* ce que le VRAI planificateur du serveur fait de (pivot -> cible), sans chaine : une route choisie, ou un refus */
const rpcHorsLigne = async () => { throw new Error('offline bench'); };
async function routeServeur(de, vers) {
  const p = await planRail({ de, vers, montant: '1000000', compte: W1 }, { rpc: rpcHorsLigne, chaine: 8453 });
  const routee = p.etat !== 'REFUSE' && p.via === 'planAerodromeSegment' && Array.isArray(p.chemin) && p.chemin.length === 2
    && p.chemin[0].de === de && p.chemin[0].vers === USDC && p.chemin[1].vers === vers;
  return { routee, refusee: p.etat === 'REFUSE', p };
}

async function verifier(src, nomCopie) {
  const ko = [];
  const cas = async (titre, f) => { try { await f(); } catch (e) { ko.push(nomCopie + ' ' + titre + ' — ' + String(e && e.message || e).split('\n')[0]); } };
  const exige = (c, m) => { if (!c) throw new Error(m); };

  await cas('P0', async () => exige(typeof EVB.devisesPivotVersAction === 'function', 'entree-vers-bloc.js n exporte pas devisesPivotVersAction'));
  await cas('P METAc', async () => {
    const attendus = [];
    for (const x of PIVOTS) { const r = await routeServeur(x, METAC); if (r.routee) attendus.push(x); }
    exige(attendus.length === 3, 'P TEMOIN : planRail ne route que ' + attendus.length + '/3 pivots vers METAc');
    const w = mondeTicket(src, { bloc: METAC });
    w.peindre();
    const vs = w.vals();
    exige(vs.includes('USDC') && vs.includes('ETH'), 'P USDC / ETH ne sont plus offerts pour METAc : ' + JSON.stringify(vs));
    const offerts = vs.filter((v) => PIVOTS.includes(v)).sort();
    exige(JSON.stringify(offerts) === JSON.stringify(attendus.sort()), 'P METAc : pivots offerts ' + JSON.stringify(offerts) + ' au lieu de ceux que le serveur route ' + JSON.stringify(attendus));
    const o = w.s.options.find((x) => x.value === CBBTC);
    exige(o && /cbBTC — routed/.test(o.textContent) && o.dataset.sym === 'cbBTC', 'P l option cbBTC ne dit pas « cbBTC — routed »');
    exige(w.s.value === 'USDC', 'P le defaut d une action n est plus USDC : ' + w.s.value);
  });
  await cas('Q AMDc', async () => {
    for (const x of PIVOTS) { const r = await routeServeur(x, AMDC); exige(r.refusee, 'Q TEMOIN : planRail ne refuse pas ' + x + ' -> AMDc (' + r.p.etat + ')'); }
    const w = mondeTicket(src, { bloc: AMDC });
    w.peindre();
    exige(!w.vals().some((v) => PIVOTS.includes(v)), 'Q un pivot est offert pour AMDc, que le serveur refuse : ' + JSON.stringify(w.vals()));
  });
  await cas('R UNIT', async () => {
    const w = mondeTicket(src, { bloc: UNIT });
    w.peindre();
    exige(PIVOTS.every((p) => w.vals().includes(p)), 'R UNIT a perdu ses pivots : ' + JSON.stringify(w.vals()));
    const v = mondeTicket(src, { bloc: METAC }); v.peindre(); v.cotes[1].emettre('click'); v.peindre();
    exige(!v.vals().some((x) => PIVOTS.includes(x)), 'R un pivot est offert a la VENTE de METAc');
  });
  await cas('S fiche', async () => {
    const w = mondeTicket(src, { bloc: UNIT });
    const pp = w.ctx.__.pivotsPourPayWith;
    exige(pp(USDC, [], METAC).map((p) => p.devise).sort().join() === [...PIVOTS].sort().join(), 'S la fiche de METAc n offre pas les trois pivots');
    exige(pp(USDC, [], AMDC).length === 0, 'S la fiche de AMDc offre un pivot que le serveur refuse');
    exige(pp(ETH, [], UNIT).length === 3, 'S la fiche de UNIT a perdu ses pivots');
  });
  await cas('T etape 2', async () => {
    const w = mondeTicket(src, { bloc: METAC, compte: W1 });
    w.peindre(); w.s.choisir('USDC'); w.peindre(); w.taper('5');
    await w.soumettre();
    exige(w.etat.executes.length === 1 && w.etat.executes[0].texte === 'buy this with 5 USDC',
      'T la commande du Review n est pas l achat en USDC : ' + JSON.stringify(w.etat.executes));
    const n = w.els['#bcTicketNote'];
    exige(/^Step 2 — /.test(n.textContent) && /Chat/.test(n.textContent) && /wallet/.test(n.textContent), 'T pas de note d etape 2 apres Review : « ' + n.textContent + ' »');
    exige(!/wKo/.test(n.className), 'T la note d etape 2 est marquee comme une erreur');
    for (let i = 0; i < 5; i += 1) w.peindre();
    exige(/^Step 2 — /.test(n.textContent), 'T la note d etape 2 ne tient pas aux repeints');
    w.taper('0.002');
    exige(n.textContent === '', 'T la note d etape 2 reste apres une nouvelle frappe : « ' + n.textContent + ' »');
    const r = mondeTicket(src, { bloc: METAC, compte: W1, execOk: false });
    r.peindre(); r.taper('5'); await r.soumettre();
    exige(!/Step 2/.test(r.els['#bcTicketNote'].textContent) && /could not be read/.test(r.els['#bcTicketNote'].textContent), 'T un Review refuse pose une note d etape 2');
  });
  return ko;
}

const LF = BRUT.replace(/\r\n/g, '\n');
const CRLF = LF.replace(/\n/g, '\r\n');
const ko = [...await verifier(LF, 'LF'), ...await verifier(CRLF.replace(/\r\n/g, '\n'), 'CRLF')];
if (!/\r\n/.test(CRLF)) ko.push('TEMOIN : la copie CRLF n a pas de CRLF');
console.log(ko.length ? ko.map((k) => 'KO ' + k).join('\n') : 'ok');
console.log('test-market-buy-pivots-action-20261026: ' + ko.length + ' KO');
process.exit(ko.length ? 1 : 0);
