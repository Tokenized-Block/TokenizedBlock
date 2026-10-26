/* test-ticket-market-regles-20261026.mjs — LE TICKET BUY DU MARKET SUIT LES REGLES DU PANNEAU BUY DE LA FICHE.
 *
 * Mesure du testeur (prod game54, block UNIT 0xb2000000000000000000007afa7ed748b0874f27, 375 px, onglet Market > Buy) :
 *   (a) USDC + « 25 » tient 30 s ; (b) passer la devise a ETH GARDAIT « 25 », sans un mot : un montant tape en USDC se lisait 25 ETH ;
 *   (c) apres « Review the buy of UNIT » la carte du Chat remplace le formulaire ; (d) la liste offrait ETH, USDC et les actions, mais
 *   NI cbBTC, NI WETH, NI AUDF (les pivots que /api/rails/plan route depuis game48/54) ; EURC absent a raison.
 *
 * CE BANC EXECUTE LES VRAIES FONCTIONS DE app.html (extraites telles quelles) dans un `vm`, avec le vrai module des pivots
 *   (entree-vers-bloc.js#devisesPivotVersBloc, celui du serveur), le vrai analyseur du Chat (commandes-panel.js) et un faux DOM :
 *   A. (a) USDC + 25 tient a travers 30 repeints (dont l arrivee de l index) ;
 *   B. (b) la PERSONNE passe de USDC a ETH : le montant est RETIRE et la note est LA phrase de la fiche (phraseMontantRetire) ;
 *      a la vente (montant en block) changer ce qu on recoit ne retire rien ; un autre block vide le champ ; une liste relue qui
 *      n offre plus la devise retire le montant et le dit ;
 *   C. (d) AUDF, cbBTC, WETH offerts (valeurs = devisesPivotVersBloc), EURC jamais ; pas de pivot pour acheter une action ;
 *   D. les puces nomment l actif choisi, n existent pas pour un actif sans montant mesure, et refusent sous un autre actif ;
 *   E. l intention prise au clic « Review » : la garde tient tant que rien ne bouge ; frappe, devise, sens, nouveau Review, autre
 *      block, autre compte = refus avec sa raison ; un wallet connecte APRES le clic devient celui de l intention ;
 *      bcExecuterTexte transmet la garde a bcProposerSwap ;
 *   F. bcProposerSwap EXECUTE : sans garde, le plan pret ouvre le wallet (une fois) ; garde fausse = ni plan ni wallet ; garde qui
 *      tombe pendant le plan = pas de wallet ; pendant les approbations = pas de second plan ; les deux trades de repli portent la garde ;
 *   H. chaque regle tue son mutant (copies EN MEMOIRE de app.html, jamais le fichier).
 * TB_APP_HTML : rejouer sur un autre app.html (ex. `git show c1e8b08:app.html`) pour mesurer le rouge d avant.
 * NE PROUVE PAS : un vrai wallet, un vrai plan serveur pour un pivot (banc fork banc-devises-pivot-vers-bloc-fork-20261026, cote
 *   serveur), les pixels (mesure navigateur a part).
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { devisesPivotVersBloc } from './entree-vers-bloc.js';
import { analyserCommande, enUnitesBrutes } from './commandes-panel.js';

const APP = readFileSync(process.env.TB_APP_HTML || new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ETH = '0x0000000000000000000000000000000000000000';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const AUDF = '0xd2a530170d71a9cfe1651fb468e2b98f7ed7456b';
const CBBTC = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf';
const WETH = '0x4200000000000000000000000000000000000006';
const EURC = '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42';
const NVDA = '0x' + '1'.repeat(40);
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const AUTRE = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const W1 = '0x00000000000000000000000000000000c0ffee77', W2 = '0x00000000000000000000000000000000c0ffee88';

const extraire = (src, nom) => {
  const m = new RegExp('\\n(async )?function ' + nom + '\\(').exec(src);
  if (!m) return '';
  const i = m.index + 1;
  const f = /\n\}\n/.exec(src.slice(i));
  return f ? src.slice(i, i + f.index + 3) : '';
};

/* ── un faux DOM, juste ce que le ticket touche ── */
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
  /* un geste de la personne : la valeur, puis l evenement `change` */
  choisir(v) { this.value = v; this.emettre('change'); }
}
const bcEl = (tag, o = {}, kids = []) => { const e = new El(tag); if (o.value !== undefined) e.value = o.value; if (o.text !== undefined) e.textContent = o.text; if (o.cls) e.className = o.cls; for (const k of kids) e.append(k); return e; };

const RAPIDES = (/const BC_RAPIDES = (\{[^\n]*\});/.exec(APP) || [])[1] || '{}';
const TICKET_FN = ['phraseMontantRetire', 'bcAvancerTicket', 'bcSymTicket', 'bcIntentionTicket', 'bcGardeTicket', 'bcNoteMontantTicket',
  'bcTicketDeviseChangee', 'bcPeindreTicket', 'bcChoixPaiement', 'pivotsPourPayWith'];

/** un monde du ticket : le code de `src`, le faux DOM, UNIT cote en ETH, sans wallet */
function mondeTicket(src, { compte = null } = {}) {
  const els = {};
  for (const id of ['bcMontant', 'bcRapides', 'bcTicketNote', 'bcTicketLib', 'bcTicketGo', 'bcTicketBrain', 'bcTicketRef', 'bcPosition', 'bcPop', 'bc-trade', 'bcTicket']) els['#' + id] = new El('div', id);
  els['#bcDevise'] = new Sel('bcDevise');
  const cotes = ['buy', 'sell'].map((c) => { const b = new El('button'); b.attrs['data-cote'] = c; return b; });
  const etat = { executes: [], identites: [] };
  const marche = new Map([[UNIT, { quoteAdr: ETH }], [AUTRE, { quoteAdr: ETH }]]);
  const ctx = {
    console, JSON, String, Number, BigInt, Array, Set, Map, Object, Promise, Math, RegExp, Error, Date,
    $: (s) => els[s] || null,
    document: { querySelectorAll: (q) => (q === '#bcTicket [data-cote]' ? cotes : []) },
    bc: { session: null, cote: 'buy', ticketDe: null, soldes: null, soldesLus: 0, soldesEnVol: false, nomEssai: new Map() },
    brainAdr: UNIT, compte, ETH_ADR: ETH, CHAINE: 8453,
    marcheParAdr: new Map(), /* l index n est pas encore lu : il arrive pendant le cas A */
    ACTIONS_PAR_ADR: new Map([[NVDA, { symbole: 'NVDAc' }]]), ACTIONS_COINBASE: [{ adr: NVDA, symbole: 'NVDAc' }],
    POOLS_ACTIONS_AERODROME: new Set(), bcActionsV4: () => new Set([NVDA]),
    bcCotation: (a) => (a === NVDA ? { ok: true, adr: USDC, sym: 'USDC' } : { ok: true, adr: ETH, sym: 'ETH' }),
    bcResoudre: (r) => (r === 'USDC' ? { ok: true, adr: USDC, sym: 'USDC' } : /^0x[0-9a-fA-F]{40}$/.test(r) ? { ok: true, adr: r.toLowerCase(), sym: r.slice(0, 6) } : { ok: false }),
    devisesPivotVersBloc, soldesPivots: new Map(), bcIdentite: (a) => etat.identites.push(a), bcEl,
    bcSnapDe: () => null, tacheAutorisee: () => ({ ok: true }), bcCerveauAttend: () => false, bcRaison: (x) => x,
    bcRefs: new Map(), phraseReference: () => ({ texte: '', alerte: false }), bcLireSoldes: async () => {}, bcLireReference: async () => {},
    connecter: async () => {}, bcUnites: (b) => String(b), bcDecimal: (b) => String(b), equivalentActions: () => null, court: (a) => String(a).slice(0, 6),
    bcExecuterTexte: async (texte, note, garde) => { etat.executes.push({ texte, note, garde }); return true; },
  };
  ctx.bcRepeindre = () => ctx.__.bcPeindreTicket(ctx.brainAdr, ctx.brainAdr === UNIT ? 'UNIT' : 'OTHER', null, null);
  vm.createContext(ctx);
  const presentes = TICKET_FN.filter((f) => extraire(src, f));
  const iL = src.indexOf('/* ── le ticket de l onglet Trade ── */'), fL = src.indexOf('/* ── LE SWAP DU WALLET', iL);
  const ecouteurs = iL > 0 && fL > iL ? src.slice(iL, fL) : '';
  vm.runInContext('const BC_RAPIDES = ' + RAPIDES + ';\n' + presentes.map((f) => extraire(src, f)).join('\n') + '\n' + ecouteurs
    + '\nthis.__ = { ' + presentes.join(', ') + ' };', ctx);
  const s = els['#bcDevise'], champ = els['#bcMontant'];
  return {
    ctx, els, etat, s, champ, cotes, marche,
    peindre: () => ctx.bcRepeindre(),
    opts: () => s.options.map((o) => ({ v: o.value, t: o.textContent, off: !!o.disabled, sym: o.dataset.sym })),
    taper: (v) => { champ.value = v; champ.emettre('input'); },
    puces: () => els['#bcRapides'].enfants.filter((e) => e.className === 'puce'),
    soumettre: async () => { for (const f of els['#bcTicket'].ecoute.submit || []) await f({ preventDefault() {} }); },
  };
}

/* ── le monde de bcProposerSwap : les VRAIES fonctions de la carte, un faux wallet et un faux planificateur ── */
function mondeSwap(src, { plans, garde = null, surFetch = null, surSigner = null, lot = null }) {
  const etat = { fetchs: 0, signes: 0, lots: 0, etapes: [], boutons: [], ops: [] };
  const m = new El('div');
  const ctx = {
    console, JSON, String, Number, BigInt, Array, Set, Map, Object, Promise, Math, RegExp, Error, Date,
    brainAdr: UNIT, compte: W1, ETH_ADR: ETH, CHAINE: 8453, RESEAUX: { 8453: { explorateur: 'x' } }, window: { ethereum: {} },
    ACTIONS_PAR_ADR: new Map(), ACTIONS_COINBASE: [], DEVISES_BASE: [{ adr: USDC, symbole: 'USDC' }], PHRASE_ACTIONS_HORS_US: '',
    AbortSignal: { timeout: () => null },
    bcDecimales: async () => 18, bcAvecDelai: (p) => p, bcMessage: () => m, bcOp: () => ({}), bcVue: () => {},
    bcSnapDe: () => ({ humeur: 'calm', tick: 1 }), tacheAutorisee: () => ({ ok: true }), bcCerveauAttend: () => false, bcRaison: (x) => x,
    bcNoter: () => {}, bcOpMaj: (op, e) => etat.ops.push(e), bcEtape: (mm, t) => { etat.etapes.push(String(t)); return { textContent: '', remove() {} }; },
    bcBoutons: (mm, l) => { etat.boutons = l; }, bcAvecWallet: async () => true, bcSolde: async () => 10n ** 30n,
    bcLigneSurete: async () => null, bcLigneEtatPlan: (p) => 'plan ' + p.etat, bcDevisRefuse: () => false, bcUnites: (b) => String(b),
    court: (a) => String(a).slice(0, 6), signalerPaye: () => {}, lieuTicketPaye: () => {}, messageEnvoi: () => 'not sent', bcJournal: () => {},
    bcEl, bcCotation: () => ({ ok: true, sym: 'ETH' }), rpc: async () => { throw new Error('no chain in this bench'); },
    fetch: async () => { etat.fetchs += 1; const p = plans[Math.min(etat.fetchs - 1, plans.length - 1)]; if (surFetch) surFetch(etat.fetchs); return { status: 200, json: async () => p }; },
    bcSigner: async () => { etat.signes += 1; if (surSigner) surSigner(etat.signes); return { ok: true, hash: '0x' + 'ab'.repeat(32), faits: 1 }; },
    envoyerLotAtomique: async () => { etat.lots += 1; return lot || { etat: 'ECHEC_ENVOI', pourquoi: 'no batch' }; },
  };
  vm.createContext(ctx);
  vm.runInContext(['bcProposerSwap', 'bcModeEnvoi', 'bcLibelleSigner', 'bcDeuxTrades'].map((f) => extraire(src, f)).join('\n')
    + '\nthis.__ = { bcProposerSwap };', ctx);
  const lancer = () => ctx.__.bcProposerSwap('You', '', { de: { ok: true, adr: USDC, sym: 'USDC' }, vers: { ok: true, adr: UNIT, sym: 'UNIT' }, montant: '25000000' }, null, null, garde);
  return { ctx, etat, lancer };
}
/* attendre un ETAT, pas une duree (sous charge, 5 ms ne garantissent rien) ; borne 3 s, puis le cas juge ce qu il voit */
const attendreQue = async (cond) => { for (let i = 0; i < 300 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 10)); };
/* « rien ne doit arriver » : on laisse passer le temps que la carte mettrait a arriver au wallet (120 ms, tout est en micro-taches) */
const attendre = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const PRET = { etat: 'PRET', aSigner: [{ to: USDC, data: '0x' }], resume: {} };
const APPRO = { etat: 'APPROBATIONS', aSigner: [{ to: USDC, data: '0x', nom: 'approve' }], resume: {} };

async function verifier(src) {
  const ko = [];
  const cas = async (titre, f) => { try { await f(); } catch (e) { ko.push(titre + ' — ' + String(e && e.message || e).split('\n')[0]); } };
  const exige = (c, m) => { if (!c) throw new Error(m); };

  /* ── A. (a) USDC + 25 tient ── */
  await cas('A', async () => {
    const w = mondeTicket(src);
    w.peindre();
    w.s.choisir('USDC'); w.peindre();
    w.taper('25');
    for (let i = 0; i < 30; i += 1) {
      if (i === 10) for (const [k, v] of w.marche) w.ctx.marcheParAdr.set(k, v); /* l index arrive : la cle du ticket change, la liste se rebatit */
      w.peindre();
    }
    exige(w.s.value === 'USDC' && w.champ.value === '25', 'A USDC + 25 ne tient pas 30 repeints : ' + w.s.value + ' / ' + w.champ.value);
  });

  /* ── B. (b) le montant n est jamais porte vers un autre actif ── */
  await cas('B1', async () => {
    const w = mondeTicket(src);
    w.peindre(); w.s.choisir('USDC'); w.peindre(); w.taper('25');
    w.s.choisir('ETH'); w.peindre();
    exige(w.champ.value === '', 'B1 USDC -> ETH : « ' + w.champ.value + ' » reste dans le champ (25 USDC se lirait 25 ETH)');
    const attendu = 'The amount you typed was in USDC, so it was taken out when you picked ETH — an amount is never carried over to another currency.';
    exige(w.els['#bcTicketNote'].textContent === attendu, 'B1 la note n est pas la phrase de la fiche : « ' + w.els['#bcTicketNote'].textContent + ' »');
    exige(/wKo/.test(w.els['#bcTicketNote'].className), 'B1 la note n est pas marquee');
    /* la phrase est LA fonction de la fiche, executee */
    const p = extraire(src, 'phraseMontantRetire');
    exige(p && vm.runInNewContext(p + ';phraseMontantRetire("USDC","ETH")') === attendu, 'B1 phraseMontantRetire absente ou differente');
    exige(/noterPayWith\(phraseMontantRetire\(symAvant, /.test(src), 'B1 la fiche n utilise plus phraseMontantRetire (deux phrases)');
    /* revenir en arriere ne ressuscite rien ; un nouveau choix fait partir l ancienne note */
    w.s.choisir('USDC'); w.peindre();
    exige(w.champ.value === '' && w.els['#bcTicketNote'].textContent === '', 'B1 retour a USDC : montant ressuscite ou ancienne note restee');
  });
  await cas('B2', async () => {
    const w = mondeTicket(src);
    w.peindre(); w.s.choisir('USDC'); w.peindre(); w.taper('25');
    w.s.choisir(CBBTC); w.peindre();
    exige(w.champ.value === '' && /typed was in USDC, so it was taken out when you picked cbBTC/.test(w.els['#bcTicketNote'].textContent), 'B2 USDC -> cbBTC ne retire pas / ne nomme pas cbBTC');
  });
  await cas('B3', async () => {
    /* a la vente, le montant est en block : changer ce qu on recoit ne le retire pas */
    const w = mondeTicket(src);
    w.peindre(); w.cotes[1].emettre('click'); w.peindre();
    w.taper('1000');
    const autre = w.s.options.find((o) => o.value !== w.s.value);
    exige(!!autre, 'B3 TEMOIN : une seule sortie a la vente');
    w.s.choisir(autre.value); w.peindre();
    exige(w.champ.value === '1000', 'B3 vente : changer ce qu on recoit a retire le montant en block');
  });
  await cas('B4', async () => {
    /* un autre block : le montant ne le suit pas */
    const w = mondeTicket(src);
    w.peindre(); w.s.choisir('USDC'); w.peindre(); w.taper('25');
    w.ctx.brainAdr = AUTRE; w.peindre();
    exige(w.champ.value === '', 'B4 autre block : « ' + w.champ.value + ' » est reste dans le champ');
  });
  await cas('B5', async () => {
    /* la liste relue n offre plus la devise (le pivot devient « you hold none ») : le montant est retire, et c est dit */
    const w = mondeTicket(src, { compte: W1 });
    w.peindre(); w.s.choisir(CBBTC); w.peindre(); w.taper('0.5');
    w.ctx.soldesPivots.set(W1 + '|' + CBBTC, 0n);
    for (const [k, v] of w.marche) w.ctx.marcheParAdr.set(k, v); /* rebatissage */
    w.peindre();
    exige(w.s.value !== CBBTC, 'B5 TEMOIN : cbBTC (0 tenu) reste choisi');
    exige(w.champ.value === '', 'B5 la liste relue n offre plus cbBTC et « ' + w.champ.value + ' » passe a ' + w.s.value);
    exige(/typed was in cbBTC/.test(w.els['#bcTicketNote'].textContent), 'B5 le retrait n est pas dit');
  });

  /* ── C. (d) les pivots ── */
  await cas('C1', async () => {
    const w = mondeTicket(src);
    w.peindre();
    const vs = w.opts().map((o) => o.v);
    for (const [nom, adr] of [['AUDF', AUDF], ['cbBTC', CBBTC], ['WETH', WETH]]) exige(vs.includes(adr), 'C1 ' + nom + ' absent de la liste : ' + JSON.stringify(vs));
    exige(!vs.includes(EURC), 'C1 EURC (banni) offert');
    const attendus = devisesPivotVersBloc(ETH).map((p) => p.adr).sort();
    const offerts = vs.filter((v) => [AUDF, CBBTC, WETH, EURC].includes(v)).sort();
    exige(JSON.stringify(attendus) === JSON.stringify(offerts), 'C1 les pivots ne sont pas ceux de devisesPivotVersBloc : ' + JSON.stringify(offerts));
    exige(vs.includes('ETH') && vs.includes('USDC') && vs.includes(NVDA), 'C1 ETH / USDC / action ne sont plus offerts');
    exige(w.s.value === 'ETH', 'C1 la valeur par defaut n est plus ETH : ' + w.s.value);
    const o = w.opts().find((x) => x.v === CBBTC);
    exige(o.sym === 'cbBTC' && /cbBTC/.test(o.t), 'C1 l option cbBTC ne porte pas son symbole');
  });
  await cas('C2', async () => {
    /* acheter une ACTION : pas de pivot ; vendre : pas de pivot */
    const w = mondeTicket(src);
    w.ctx.brainAdr = NVDA; w.peindre();
    exige(!w.opts().some((o) => [AUDF, CBBTC, WETH].includes(o.v)), 'C2 un pivot est offert pour acheter une action');
    const v = mondeTicket(src); v.peindre(); v.cotes[1].emettre('click'); v.peindre();
    exige(!v.opts().some((o) => [AUDF, CBBTC, WETH].includes(o.v)), 'C2 un pivot est offert a la vente');
  });
  await cas('C3', async () => {
    /* un pivot choisi ecrit une commande que le Chat lit (adresse entiere) ; game57 : sans wallet le ticket ne part plus -> W1 */
    const w = mondeTicket(src, { compte: W1 });
    w.peindre(); w.s.choisir(AUDF); w.peindre(); w.taper('25');
    await w.soumettre();
    exige(w.etat.executes.length === 1, 'C3 aucune commande');
    const a = analyserCommande(w.etat.executes[0].texte);
    exige(a.ok && a.commande.type === 'swap' && String(a.commande.de).toLowerCase() === AUDF && a.commande.vers === 'this',
      'C3 la commande AUDF n est pas un achat de ce block en AUDF : ' + JSON.stringify(a));
  });

  /* ── D. les puces ── */
  await cas('D', async () => {
    const w = mondeTicket(src);
    w.peindre();
    exige(w.puces().map((p) => p.textContent).join('|') === '0.0005 ETH|0.002 ETH|0.01 ETH', 'D puces ETH : ' + w.puces().map((p) => p.textContent).join('|'));
    const vieille = w.puces()[1];
    w.s.choisir('USDC'); w.peindre();
    exige(w.puces().map((p) => p.textContent).join('|') === '1 USDC|5 USDC|20 USDC', 'D puces USDC : ' + w.puces().map((p) => p.textContent).join('|'));
    /* une puce ETH restee (clic programme, ecran perime) ne remplit rien sous USDC */
    vieille.emettre('click');
    exige(w.champ.value === '', 'D une puce ETH a rempli « ' + w.champ.value + ' » sous USDC');
    w.s.choisir(CBBTC); w.peindre();
    exige(w.puces().length === 0, 'D des puces sous cbBTC (aucun montant mesure pour lui)');
    exige(/No quick amounts in cbBTC/.test(w.els['#bcRapides'].textContent), 'D l absence de puces sous cbBTC n est pas dite');
  });

  /* ── E. l intention du clic Review ── */
  const intention = async (geste, raison) => {
    const w = mondeTicket(src, { compte: W1 });
    w.peindre(); w.s.choisir('USDC'); w.peindre(); w.taper('25');
    await w.soumettre();
    const g = w.etat.executes[0] && w.etat.executes[0].garde;
    exige(typeof g === 'function', 'E la garde n est pas passee a bcExecuterTexte');
    exige(g() === null, 'E la garde refuse sans que rien ait bouge : ' + g());
    if (!geste) return;
    geste(w);
    const r = g();
    exige(typeof r === 'string' && raison.test(r), 'E apres « ' + raison + ' » la garde rend ' + JSON.stringify(r));
  };
  await cas('E0', () => intention(null, null));
  await cas('E1', () => intention((w) => w.taper('30'), /amount changed/));
  await cas('E2', () => intention((w) => { w.s.choisir('ETH'); w.peindre(); }, /currency you pay with changed/));
  await cas('E3', () => intention((w) => { w.cotes[1].emettre('click'); }, /Buy and Sell/));
  await cas('E4', () => intention((w) => { w.ctx.brainAdr = AUTRE; }, /another block/));
  await cas('E5', () => intention((w) => { w.ctx.compte = W2; }, /wallet changed/));
  await cas('E6', () => intention((w) => { w.puces()[0] && w.puces()[0].emettre('click'); }, /amount changed/));
  await cas('E7', async () => {
    /* un second Review rend la premiere carte refusee ; le wallet connecte apres le clic devient celui de l intention.
     * game57 : sans wallet, Review ne pose plus de carte (test-ticket-montant-visible-sans-wallet-20261026.mjs) ; l intention sans
     *   compte est donc prise ici directement (bcIntentionTicket / bcGardeTicket, le vrai code) pour garder la liaison au wallet (M21). */
    const w = mondeTicket(src);
    w.peindre(); w.s.choisir('USDC'); w.peindre(); w.taper('25');
    const g1 = w.ctx.__.bcGardeTicket(w.ctx.__.bcIntentionTicket('USDC', '25'));
    w.ctx.compte = W1;
    exige(g1() === null, 'E7 un wallet connecte apres le clic fait refuser : ' + g1());
    w.ctx.compte = W2;
    exige(/wallet changed/.test(String(g1())), 'E7 apres liaison a W1, W2 n est pas refuse');
    w.ctx.compte = W1;
    w.taper('30'); await w.soumettre();
    exige(/newer Review/.test(String(g1())), 'E7 la premiere carte tient encore apres un second Review : ' + g1());
    exige(w.etat.executes[0].garde() === null, 'E7 la seconde carte ne tient pas');
  });
  await cas('E8', async () => {
    /* bcExecuterTexte EXECUTE transmet la garde a bcProposerSwap */
    const f = extraire(src, 'bcExecuterTexte');
    const vu = [];
    const ctx = { console, String, Number, BigInt, Map, Set, Promise, analyserCommande, enUnitesBrutes, $: () => null, ETH_ADR: ETH,
      bcResoudre: (r) => (r === 'this' ? { ok: true, adr: UNIT, sym: 'UNIT' } : { ok: true, adr: USDC, sym: 'USDC' }),
      bcCotation: () => ({ ok: true, adr: ETH, sym: 'ETH' }), bcAvecDelai: (p) => p, bcDecimales: async () => 6,
      bcProposerSwap: (...a) => { vu.push(a); } };
    vm.createContext(ctx);
    vm.runInContext(f + '\nthis.__ = bcExecuterTexte;', ctx);
    const garde = () => null;
    await ctx.__('buy this with 25 USDC', { className: '', textContent: '' }, garde);
    exige(vu.length === 1 && vu[0][5] === garde, 'E8 bcExecuterTexte ne passe pas la garde a bcProposerSwap');
  });

  /* ── F. bcProposerSwap execute ── */
  await cas('F1', async () => {
    const w = mondeSwap(src, { plans: [PRET] });
    await w.lancer(); await attendreQue(() => w.etat.signes >= 1); await attendre();
    exige(w.etat.fetchs === 1 && w.etat.signes === 1, 'F1 sans garde : plan ' + w.etat.fetchs + ', wallet ' + w.etat.signes + ' (attendu 1 / 1)');
  });
  await cas('F2', async () => {
    const w = mondeSwap(src, { plans: [PRET], garde: () => 'the amount changed since you pressed Review' });
    await w.lancer(); await attendre();
    exige(w.etat.fetchs === 0 && w.etat.signes === 0, 'F2 garde fausse : plan ' + w.etat.fetchs + ', wallet ' + w.etat.signes);
    exige(w.etat.etapes.some((t) => /^Stopped: the amount changed since you pressed Review — nothing was sent/.test(t)), 'F2 le refus n est pas dit');
  });
  await cas('F3', async () => {
    let raison = null;
    const w = mondeSwap(src, { plans: [PRET], garde: () => raison, surFetch: () => { raison = 'the connected wallet changed since you pressed Review'; } });
    await w.lancer(); await attendre();
    exige(w.etat.fetchs === 1 && w.etat.signes === 0, 'F3 la garde tombe pendant le plan : le wallet s ouvre quand meme (' + w.etat.signes + ')');
  });
  await cas('F4', async () => {
    let raison = null;
    const w = mondeSwap(src, { plans: [APPRO, PRET], garde: () => raison, surSigner: () => { raison = 'the amount changed since you pressed Review'; } });
    await w.lancer(); await attendreQue(() => w.etat.signes >= 1); await attendre();
    exige(w.etat.signes === 1 && w.etat.fetchs === 1, 'F4 apres les approbations, la garde tombee : plans ' + w.etat.fetchs + ', signatures ' + w.etat.signes);
  });
  await cas('F5', async () => {
    /* le repli en deux trades : ses boutons ouvrent des cartes qui portent la MEME garde */
    let raison = null;
    const LOT = { etat: 'PRET', atomique: true, aSigner: [{ to: USDC, data: '0x' }, { to: UNIT, data: '0x' }], resume: { pivot: USDC, pivotAuMoins: '5' } };
    const bouton1 = async (w) => {
      await w.lancer(); await attendreQue(() => w.etat.boutons.some((x) => /^1 · Sell/.test(x[0])));
      exige(w.etat.lots === 1, 'F5 TEMOIN : ' + w.etat.lots + ' lot(s) partis, attendu 1 (' + w.etat.etapes.join(' / ').slice(0, 300) + ')');
      const b = w.etat.boutons.find((x) => /^1 · Sell/.test(x[0]));
      exige(!!b, 'F5 TEMOIN : pas de bouton « 1 · Sell »');
      return b;
    };
    /* temoin : la garde tient, le bouton planifie bien */
    const t = mondeSwap(src, { plans: [LOT], garde: () => null });
    const bt = await bouton1(t), avantT = t.etat.fetchs;
    bt[1](); await attendreQue(() => t.etat.fetchs > avantT);
    exige(t.etat.fetchs > avantT, 'F5 TEMOIN : le bouton « 1 · Sell » ne planifie rien meme quand la garde tient');
    const w = mondeSwap(src, { plans: [LOT], garde: () => raison });
    const b = await bouton1(w);
    raison = 'a newer Review was pressed since you pressed Review';
    const avant = w.etat.fetchs;
    b[1](); await attendre();
    exige(w.etat.fetchs === avant, 'F5 le bouton du repli planifie malgre la garde tombee');
  });

  return ko;
}

let n = 0, nko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { nko += 1; console.log('KO  ' + m); } };
const vraie = await verifier(APP);
ok(vraie.length === 0, 'app.html : toutes les regles A-F tiennent' + (vraie.length ? '\n      ' + vraie.join('\n      ') : ''));

if (!process.env.TB_APP_HTML) {
  const remplace = (de, vers) => (h) => { if (!h.includes(de)) throw new Error('cible du mutant absente : ' + de.slice(0, 70)); return h.replace(de, vers); };
  const MUTANTS = [
    ['M1 le changement de devise garde le montant', remplace("  champ.value = '';\n  bcNoteMontantTicket(phraseMontantRetire(avant.sym, apres.sym));", "  bcNoteMontantTicket(phraseMontantRetire(avant.sym, apres.sym));")],
    ['M2 la note du ticket est une autre phrase', remplace('bcNoteMontantTicket(phraseMontantRetire(avant.sym, apres.sym));', "bcNoteMontantTicket('Amount cleared.');")],
    ['M3 plus de pivots dans le ticket', remplace('for (const p of pivotsPourPayWith(q.adr, deja)) {', 'for (const p of []) {')],
    ['M4 pivots offerts aussi pour une action', remplace("if (achat && !ACTIONS_PAR_ADR.has(a) && q && q.ok) {", 'if (achat && q && q.ok) {')],
    ['M5 la garde ignore le compte', remplace("if (moi !== i.compte) return 'the connected wallet changed since you pressed Review';", '')],
    ['M6 la garde ignore le compteur', remplace("if ((bc.genTicket || 0) !== i.gen) return", 'if (false) return')],
    ['M7 la garde ignore le block', remplace("if (ici !== i.block) return 'the panel now shows another block';", '')],
    ['M8 la frappe n avance pas l intention', remplace("$('#bcMontant').addEventListener('input', () => { bcAvancerTicket('the amount changed'); });", '')],
    ['M9 le signer ne reverifie pas', remplace("      if (!tient()) return;\n      bcOpMaj(op, 'signing');", "      bcOpMaj(op, 'signing');")],
    ['M10 le plan ne reverifie pas', remplace('    if (!tient()) return;\n    if (!(await bcAvecWallet(m, planifier))) {', '    if (!(await bcAvecWallet(m, planifier))) {')],
    ['M11 bcExecuterTexte ne transmet pas la garde', remplace("void bcProposerSwap('You', '', { de, vers, montant: brut.toString() }, null, null, garde);", "void bcProposerSwap('You', '', { de, vers, montant: brut.toString() }, null);")],
    ['M12 le ticket ne passe pas la garde', remplace(", note, bcGardeTicket(intention))) {", ', note)) {')],
    ['M13 la puce remplit sous un autre actif', remplace("if (actif && $('#bcDevise').value !== actif) {", 'if (false) {')],
    ['M14 la puce dit ETH en dur', remplace("puce(v + ' ' + bcSymTicket(s), v, s.value);", "puce(v + ' ETH', v, s.value);")],
    ['M15 la liste relue porte le montant', remplace("    if (!garde && avant && achat && memeSens && !autreBloc && String($('#bcMontant').value || '').trim() !== '') {\n      $('#bcMontant').value = '';", "    if (!garde && avant && achat && memeSens && !autreBloc && String($('#bcMontant').value || '').trim() !== '') {")],
    ['M16 un autre block garde le montant', remplace("if (autreBloc) { $('#bcMontant').value = ''; ", 'if (autreBloc) { ')],
    ['M17 le repli en deux trades perd la garde', remplace('montant: x.montant }, null, null, garde)', 'montant: x.montant }, null)')],
    ['M18 la vente retire aussi le montant', remplace("if (bc.cote !== 'buy' || !avant ||", 'if (!avant ||')],
    ['M21 le wallet connecte apres le clic n est pas lie', remplace('if (i.compte === null && moi) i.compte = moi;', '')],
    ['M22 la fiche a sa propre phrase', remplace('noterPayWith(phraseMontantRetire(symAvant, (d && d.symbole) || \'another currency\'));', "noterPayWith('The amount you typed was in ' + symAvant + ', so it was taken out.');")],
  ];
  for (const [nom, muter] of MUTANTS) {
    let copie;
    try { copie = muter(APP); } catch (e) { ok(false, nom + ' — ' + e.message); continue; }
    const v = await verifier(copie);
    ok(v.length > 0, nom + ' : tue (' + (v[0] || 'SURVIT').slice(0, 100) + ')');
  }
  console.log(n + ' assertions, ' + nko + ' KO — ' + MUTANTS.length + ' mutants');
} else console.log(n + ' assertions, ' + nko + ' KO (TB_APP_HTML : ' + process.env.TB_APP_HTML + ', mutants sautes)');
console.log('NE PROUVE PAS : un vrai wallet, un vrai plan serveur pour un pivot, les pixels (mesure navigateur a part).');
process.exit(nko ? 1 : 0);
