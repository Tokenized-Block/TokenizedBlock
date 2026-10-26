/* test-retour-fiat-garde-actif-20261026.mjs — LE MONTANT LIVRE NE RESTE JAMAIS SOUS UN AUTRE ACTIF. EXECUTE, PAS LU.
 *
 * Revue adverse de 400020e (2026-10-26), reproduite 3 fois a 375 px : apres un retour USDC (?block=<block cote ETH>&actif=USDC)
 * `reprendreRetourFiat` basculait « Pay with » sur l USDC et preremplissait 0.001752 ; ~3,5 s plus tard `majDevisesDentree`
 * rebatissait #peDevise ~15 fois, chacune le remettant sur l ETH et `deviseDentree` a null. Le montant restait sous
 * « Buy — ETH to spend » : ~2000 fois la valeur arrivee, dans un autre actif, sous une note qui disait « arrived in USDC ».
 * Les benches de 400020e ne lisaient que le TEXTE de app.html : ils ne pouvaient pas voir un etat qui change 3,5 s plus tard.
 *
 * ⇒ CE BANC EXECUTE LES VRAIES FONCTIONS DE app.html (extraites telles quelles, rien de recopie) dans un contexte `vm` :
 *   un faux DOM minimal (select fidele : une valeur absente des options vaut ''), des lectures de solde injectees, et une
 *   horloge `dormir` pilotee. Les modules purs (retour-fiat.js, montants.js, frais-creation.js) sont les vrais.
 *
 * NE PROUVE PAS : le rendu navigateur (mesure a part, onglet a 375 px), un vrai achat Coinbase, ni le vrai cadencement des
 * lectures de prix. Aucune signature n est exercee : il n y en a aucune dans ce parcours.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { actifCarte, repereValide, verdictArrivee } from './retour-fiat.js';
import { formaterUnites } from './montants.js';
import { formaterEthCourt, USDC_BASE } from './frais-creation.js';
import { corpsReponseOptions } from './onramp-session.js';

let n = 0;
const ko = [];
const cas = async (titre, f) => { n += 1; try { await f(); } catch (e) { ko.push(titre); console.error('KO ' + titre + ' — ' + String(e.message).split('\n')[0]); } };

const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const nuSrv = srv.replace(/\/\*[\s\S]*?\*\//g, ' ');
/* une fonction de premier niveau, telle qu elle est dans app.html : de `function NOM(` a la premiere `}` en colonne 0.
 * ⛔ Absente = '' (le cas qui en a besoin rougit), jamais le reste du fichier. */
const extraire = (nom) => {
  const m = new RegExp('\\n(async )?function ' + nom + '\\(').exec(app);
  if (!m) return '';
  const i = m.index + 1;
  const f = /\r?\n\}\r?\n/.exec(app.slice(i));
  return f ? app.slice(i, i + f.index + f[0].length) : '';
};
const FONCTIONS = ['majDevisesDentree', 'majDevisesDentreeCorps', 'majEtiquetteDeviseDentree', 'garderPrefillFiat', 'deviseDuChampBuy',
  'reprendreRetourFiat', 'montantLisibleFiat', 'actifCarteCourant', 'cablerFundActifs', 'peindreBridgeBlocks', 'repeindreFundApresHub'];
const sources = Object.fromEntries(FONCTIONS.map((f) => [f, extraire(f)]));

const ETH = '0x0000000000000000000000000000000000000000';
const USDC = USDC_BASE.toLowerCase();
const BLOC = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const AUTRE_BLOC = '0xb20000000000000000000066242d4067724cb7a1';
const BLOC_USDC = '0x' + '5'.repeat(40);
const WALLET = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const D_ETH = { devise: ETH, etat: 'DIRECTE', symbole: 'ETH' };
const D_USDC = { devise: USDC, etat: 'ROUTEE', symbole: 'USDC', tx: 1 };

/* ── le faux DOM : juste ce que ces fonctions touchent ─────────────────────────────────────────── */
class El {
  constructor(id) {
    this.id = id; this.hidden = false; this._value = ''; this.textContent = ''; this._html = ''; this.className = '';
    this.dataset = {}; this.attrs = {}; this.ecoute = {}; this.onchange = null; this.onclick = null; this.label = null;
    const cl = new Set(); this.classes = cl;
    this.classList = { toggle: (c, on) => { if (on) cl.add(c); else cl.delete(c); }, add: (c) => cl.add(c), contains: (c) => cl.has(c) };
  }
  get value() { return this._value; }
  set value(v) { this._value = String(v); }
  get innerHTML() { return this._html; }
  set innerHTML(h) { this._html = String(h); this.textContent = String(h).replace(/<[^>]*>/g, ''); }
  addEventListener(t, f) { (this.ecoute[t] ||= []).push(f); }
  declencher(t) {
    for (const f of this.ecoute[t] || []) f({ preventDefault() {}, target: this });
    if (t === 'change' && typeof this.onchange === 'function') this.onchange({ target: this });
  }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  scrollIntoView() {}
  closest() { return this.label; }
}
/* un <select> fidele sur le point qui compte : poser une valeur absente des options le laisse a '' */
class Sel extends El {
  constructor(id) { super(id); this.options = []; this.idx = -1; }
  get value() { return this.idx >= 0 ? this.options[this.idx].value : ''; }
  set value(v) { this.idx = this.options.findIndex((o) => o.value === String(v)); }
  get innerHTML() { return this._html; }
  set innerHTML(h) {
    this._html = String(h);
    this.options = [...this._html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => ({ value: m[1], textContent: m[2], dataset: {} }));
    this.idx = this.options.length ? 0 : -1;
  }
  appendChild(o) { this.options.push(o); if (this.idx < 0) this.idx = 0; }
}

/** Un monde neuf par cas : le vrai code de app.html, un DOM faux, des soldes et une horloge injectes. */
function monde({ devises = [D_ETH, D_USDC], solde = 1752n, avant = '0', actif = 'USDC', panneauApresMs = 0, lectureFinitMs = 0,
  surDormir = null, marches = [] } = {}) {
  const els = {};
  const el = (id, C = El) => (els['#' + id] = new C(id));
  for (const id of ['profil', 'pEchange', 'peAchat', 'peRetourFiat', 'peDeviseBloc', 'peDeviseNote', 'brFundWallet', 'brFundActifNote', 'brBlockNote']) el(id);
  el('peDevise', Sel); el('brBlock', Sel);
  els['#peAchat'].label = { firstChild: { nodeType: 3, textContent: 'Buy — ETH to spend' } };
  els['#pEchange'].hidden = true; els['#peRetourFiat'].hidden = true;
  const fundBtns = ['ETH', 'USDC'].map((a) => { const b = new El('fund' + a); b.attrs['data-fund-actif'] = a; return b; });
  const stock = new Map();
  if (avant !== null) stock.set('tb.fiat.avant', JSON.stringify({ adr: WALLET, actif, solde: String(avant), t: Date.now() }));
  const etat = { horloge: 0, lectures: 0, replis: [], rails: [], devises, solde };
  const v = { etat: 'LUE', paire: 'ETH' };
  const ctx = {
    console, JSON, String, Number, BigInt, Array, Set, Map, Object, Promise, Date, Math, RegExp, Error, AbortSignal,
    $: (s) => els[s] || null,
    document: {
      createElement: () => ({ value: '', textContent: '', dataset: {} }),
      querySelectorAll: (s) => (s === '[data-fund-actif]' ? fundBtns : []),
      activeElement: null,
    },
    window: { addEventListener() {} },
    localStorage: { getItem: (k) => (stock.has(k) ? stock.get(k) : null), setItem: (k, x) => stock.set(k, String(x)), removeItem: (k) => stock.delete(k) },
    deviseDentree: null, deviseEchange: null, fiatRetenu: null, quotePourCarte: null, offertsPourCarte: [], symProfil: 'IB022',
    profilEnLecture: false, compte: WALLET, CHAINE: 8453, ETH_ADR: ETH, USDC_BASE, RESERVE_GAS_WEI: 300000000000000n,
    CLE_FIAT_AVANT: 'tb.fiat.avant', mouvementReduit: true, actifs: [], repeindreDefautFund: null,
    marcheParAdr: new Map(marches), faitsPoolLus: new Map([[BLOC, { famille: 'uniswap-v4' }]]), faitsBlockEnVol: new Set(), devisesSansFaitsEnVol: new Set(),
    pairesProposees: () => [], prixUsdDevise: async () => {}, devisesDentree: () => ({ etat: 'OK', devises: etat.devises }),
    aretesMesurees: () => [], peutEtreAssemblee: () => ({ ok: true, par: 'v4', court: null }), resumeDesNonOffertes: () => [],
    phraseDevise: () => '', majEntreeCarte: () => {}, etape: () => {},
    decimalesDe: async () => 6,
    lireSoldeActifFiat: async () => { etat.lectures += 1; return etat.solde; },
    peindreMarcheUnreadRetry: (b) => { etat.replis.push(b); },
    ouvrirRailFiat: (e, lien, a) => { etat.rails.push(a); },
    lireBridgeBlock: () => etat.hubSauve || '', ecrireBridgeBlock: () => {}, enTexte: (t) => String(t),
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, blocks: etat.blocksDe || [] }) }),
    repereValide, verdictArrivee, formaterUnites, formaterEthCourt, actifCarte,
    dormir: async (ms) => {
      etat.horloge += ms;
      if (lectureFinitMs && etat.horloge >= lectureFinitMs) ctx.profilEnLecture = false;
      if (panneauApresMs && etat.horloge >= panneauApresMs) els['#pEchange'].hidden = false;
      if (surDormir) surDormir(ms, ctx, els, etat);
    },
  };
  /* la fiche : comme `lireProfil`, elle pose le block puis (marche lu) montre le panneau et rebatit « Pay with » */
  ctx.ouvrirProfil = async (b) => {
    els['#profil'].dataset.block = b;
    if (!panneauApresMs) els['#pEchange'].hidden = false;
    ctx.__.majDevisesDentree(v);
  };
  vm.createContext(ctx);
  const presentes = FONCTIONS.filter((f) => sources[f]);
  vm.runInContext(presentes.map((f) => sources[f]).join('\n') + '\nthis.__ = { ' + presentes.join(', ') + ' };', ctx);
  const champ = () => String(ctx.deviseDentree ? ctx.deviseDentree.devise : (ctx.deviseEchange ? ctx.deviseEchange.adr : ETH)).toLowerCase();
  return { ctx, els, etat, v, f: ctx.__, champ, fundBtns, rebatir: () => ctx.__.majDevisesDentree(v) };
}
/* l invariant de la revue : un montant n est jamais sous un autre actif que celui qui est arrive */
const jamaisSousUnAutreActif = (m, livre, quand) => {
  const val = m.els['#peAchat'].value;
  assert.ok(val === '' || m.champ() === livre,
    quand + ' : « ' + val + ' » est dans le champ Buy sous ' + (m.champ() === ETH ? 'ETH' : m.champ()) + ' alors que l actif livre est ' + (livre === ETH ? 'ETH' : 'USDC'));
};

/* ── 1. LE DEFAUT DE LA REVUE : 15 rebatissages apres le retour USDC ─────────────────────────────── */
await cas('(1) retour USDC sur un block cote ETH : 15 rebatissages de « Pay with » gardent l USDC ET le montant', async () => {
  const m = monde();
  assert.ok(m.f.reprendreRetourFiat && m.f.majDevisesDentree, 'fonctions introuvables dans app.html');
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  assert.equal(m.els['#peAchat'].value, '0.001752', 'le montant arrive n est pas prerempli : ' + m.els['#peRetourFiat'].textContent);
  assert.equal(m.champ(), USDC);
  for (let i = 1; i <= 15; i += 1) {
    m.rebatir();
    jamaisSousUnAutreActif(m, USDC, 'rebatissage ' + i);
  }
  assert.equal(m.els['#peAchat'].value, '0.001752', 'le montant a disparu alors que l USDC reste offert');
  assert.equal(m.els['#peDevise'].value, USDC, '« Pay with » est revenu sur ' + m.els['#peDevise'].value);
  assert.equal(m.els['#peAchat'].label.firstChild.textContent, 'Buy — USDC to spend');
  assert.match(m.els['#peRetourFiat'].textContent, /^Arrived in your wallet: 0\.001752 USDC \(read on chain\)\. The Buy amount is prefilled/);
});

await cas('(1b) le rebatissage n offre plus l USDC : le montant est RETIRE, et la note dit pourquoi', async () => {
  const m = monde();
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  assert.equal(m.els['#peAchat'].value, '0.001752');
  m.etat.devises = [D_ETH];
  m.rebatir();
  jamaisSousUnAutreActif(m, USDC, 'rebatissage sans USDC');
  assert.equal(m.els['#peAchat'].value, '', 'le montant USDC reste dans un champ ETH');
  assert.match(m.els['#peRetourFiat'].textContent, /no longer paid in USDC .*taken out of it/);
  assert.match(m.els['#peRetourFiat'].textContent, /If USDC is offered here again, the amount comes back\.$/);
  /* 2026-10-26 (2e revue) : la note promet le retour ; le rebatissage qui re-offre l USDC le tient */
  m.etat.devises = [D_ETH, D_USDC];
  m.rebatir();
  assert.equal(m.champ(), USDC);
  assert.equal(m.els['#peAchat'].value, '0.001752', 'la note promettait que le montant revient, il n est pas revenu');
  assert.match(m.els['#peRetourFiat'].textContent, /The Buy amount is prefilled/);
});

await cas('(1c) la personne choisit ETH dans « Pay with » : le montant USDC pose sort du champ', async () => {
  const m = monde();
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  m.els['#peDevise'].value = ETH;
  m.els['#peDevise'].declencher('change');
  jamaisSousUnAutreActif(m, USDC, 'choix ETH de la personne');
  assert.equal(m.els['#peAchat'].value, '');
  assert.match(m.els['#peRetourFiat'].textContent, /you changed “Pay with”/);
  m.rebatir();
  assert.equal(m.champ(), ETH, 'un rebatissage a defait le choix de la personne');
  assert.equal(m.els['#peAchat'].value, '');
  assert.match(m.els['#peRetourFiat'].textContent, /Pick USDC in “Pay with” to use what arrived/);
});
await cas('(1f) la note dit « Pick USDC again » : la personne le fait, et le montant revient (mesure de la promesse)', async () => {
  const m = monde();
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  m.els['#peDevise'].value = ETH; m.els['#peDevise'].declencher('change');
  assert.match(m.els['#peRetourFiat'].textContent, /Pick USDC in “Pay with” again and the amount comes back\./);
  m.els['#peDevise'].value = USDC; m.els['#peDevise'].declencher('change');
  assert.equal(m.champ(), USDC);
  assert.equal(m.els['#peAchat'].value, '0.001752', 'la note promettait le retour du montant : le champ est vide');
  assert.match(m.els['#peRetourFiat'].textContent, /^Arrived in your wallet: 0\.001752 USDC .*The Buy amount is prefilled/);
  assert.ok(!/no longer paid/.test(m.els['#peRetourFiat'].textContent), 'la note dit encore « no longer paid in USDC » sous un champ en USDC');
  for (let i = 0; i < 5; i += 1) { m.rebatir(); jamaisSousUnAutreActif(m, USDC, 'rebatissage apres retour ' + i); }
  assert.equal(m.els['#peAchat'].value, '0.001752');
});
await cas('(1g) la personne corrige le montant APRES le prefill : 21 rebatissages ne le reecrivent pas', async () => {
  const m = monde();
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  m.els['#peAchat'].value = '0.0015';
  for (let i = 0; i < 21; i += 1) m.rebatir();
  assert.equal(m.els['#peAchat'].value, '0.0015', 'un rebatissage a ecrase la correction de la personne');
  assert.equal(m.champ(), USDC);
  m.els['#profil'].dataset.block = AUTRE_BLOC; m.rebatir();
  assert.equal(m.els['#peAchat'].value, '0.0015', 'en quittant le block, on a retire un montant que la personne a tape');
});
await cas('(1h) la personne corrige le montant puis passe « Pay with » sur ETH : sa correction reste, et la note le dit', async () => {
  const m = monde();
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  m.els['#peAchat'].value = '0.0015';
  m.els['#peDevise'].value = ETH; m.els['#peDevise'].declencher('change');
  assert.equal(m.els['#peAchat'].value, '0.0015', 'un montant corrige par la personne a ete retire');
  assert.match(m.els['#peRetourFiat'].textContent, /the amount in it is the one you typed\.$/);
  assert.equal(m.ctx.fiatRetenu, null);
});

await cas('(1d) l USDC n est pas offert au retour : rien n est pose sous l ETH ; il l est quand « Pay with » l offre', async () => {
  const m = monde({ devises: [D_ETH] });
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  jamaisSousUnAutreActif(m, USDC, 'retour sans USDC offert');
  assert.equal(m.els['#peAchat'].value, '', 'le garde d actif a saute : montant USDC pose sous l ETH');
  assert.match(m.els['#peRetourFiat'].textContent, /not paid in USDC here, so nothing was prefilled/);
  m.etat.devises = [D_ETH, D_USDC];
  m.rebatir();
  assert.equal(m.champ(), USDC, 'l USDC livre n est pas remis dans « Pay with » quand il devient offert');
  assert.equal(m.els['#peAchat'].value, '0.001752');
});

await cas('(1e) un montant deja tape par la personne n est pas ecrase', async () => {
  const m = monde({ devises: [D_ETH] });
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  m.els['#peAchat'].value = '5';
  m.etat.devises = [D_ETH, D_USDC];
  m.rebatir();
  assert.equal(m.els['#peAchat'].value, '5');
  assert.equal(m.champ(), ETH, 'la devise a ete changee sous le montant que la personne a tape');
  assert.match(m.els['#peRetourFiat'].textContent, /already holds an amount you typed/);
});

/* ── 2. le montant pose en ETH garde la reserve de gas ─────────────────────────────────────────── */
await cas('(2) retour ETH : le champ recoit ce qui est arrive MOINS la reserve de gas', async () => {
  const m = monde({ actif: 'ETH', solde: 10n ** 16n, avant: '0' });
  await m.f.reprendreRetourFiat(BLOC, 'ETH');
  assert.equal(m.els['#peAchat'].value, formaterEthCourt(10n ** 16n - 300000000000000n), 'la reserve de gas n est pas gardee : ' + m.els['#peAchat'].value);
  assert.equal(m.els['#peAchat'].value, '0.0097');
  for (let i = 0; i < 5; i += 1) { m.rebatir(); jamaisSousUnAutreActif(m, ETH, 'rebatissage ETH ' + i); }
  assert.equal(m.els['#peAchat'].value, '0.0097');
});

/* ── 3. la relecture s arrete quand une autre fiche s ouvre ────────────────────────────────────── */
await cas('(3) achat encore en route, puis la personne ouvre un autre block : plus aucune lecture, rien d ecrit', async () => {
  const m = monde({ solde: 0n, surDormir: (ms, ctx, els) => { if (ms === 15000) els['#profil'].dataset.block = AUTRE_BLOC; } });
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  assert.equal(m.etat.lectures, 1, 'le solde a ete relu ' + m.etat.lectures + ' fois apres que la fiche a change');
  assert.match(m.els['#peRetourFiat'].textContent, /still arriving/);
  assert.equal(m.els['#peAchat'].value, '');
});

await cas('(3b) le retour appartient a SON block : apres un detour par une autre fiche, rien ne se repose', async () => {
  const m = monde({ devises: [D_ETH] });
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  assert.match(m.els['#peRetourFiat'].textContent, /nothing was prefilled/);
  m.els['#profil'].dataset.block = AUTRE_BLOC; m.rebatir();
  m.els['#profil'].dataset.block = BLOC; m.etat.devises = [D_ETH, D_USDC]; m.rebatir();
  assert.equal(m.els['#peAchat'].value, '', 'un retour oublie a ete repose apres un detour par une autre fiche');
  assert.equal(m.champ(), ETH);
});

await cas('(3c) prefill sur IB022, puis une AUTRE fiche s ouvre : le champ partage est vide (2e revue, reproduit au navigateur)', async () => {
  const m = monde();
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  assert.equal(m.els['#peAchat'].value, '0.001752');
  /* comme lireProfil : le block change, le panneau se repeint, « Pay with » se rebatit (cote ETH, sans USDC) */
  m.els['#profil'].dataset.block = AUTRE_BLOC; m.etat.devises = [D_ETH]; m.rebatir();
  assert.equal(m.els['#peAchat'].value, '', 'le montant pose pour IB022 reste dans le Buy d un autre block, sous ' + (m.champ() === ETH ? 'ETH' : m.champ()));
  assert.equal(m.ctx.fiatRetenu, null);
  for (let i = 0; i < 5; i += 1) m.rebatir();
  assert.equal(m.els['#peAchat'].value, '');
});

/* ── 4. l attente suit le panneau, pas une montre de 12 s ──────────────────────────────────────── */
await cas('(4) panneau ouvert a 36 s pendant une lecture de la fiche : le retour attend et preremplit', async () => {
  const m = monde({ panneauApresMs: 36000, lectureFinitMs: 36000 });
  m.ctx.profilEnLecture = true;
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  assert.deepEqual(m.etat.replis, [], 'le retour a abandonne a ' + m.etat.horloge + ' ms et peint « Market unread » sur un marche qui se lisait');
  assert.equal(m.els['#peAchat'].value, '0.001752');
});
await cas('(4b) lecture finie sans panneau : repli « Retry market » en quelques secondes, pas 3 minutes', async () => {
  const m = monde({ panneauApresMs: 10 ** 9, lectureFinitMs: 5000 });
  m.ctx.profilEnLecture = true;
  await m.f.reprendreRetourFiat(BLOC, 'USDC');
  assert.deepEqual(m.etat.replis, [BLOC]);
  assert.ok(m.etat.horloge <= 8000, 'le repli arrive a ' + m.etat.horloge + ' ms');
});

/* ── 5. Fund wallet du Bridge : le defaut est l actif du Buy du block choisi, et il suit le hub restaure ── */
const marches = [[BLOC_USDC, { quoteAdr: USDC_BASE, sym: 'SNDKc' }], [BLOC, { quoteAdr: ETH, sym: 'IB022' }]];
await cas('(5) Fund : hub cote USDC = USDC preselectionne, et le clic demande l USDC a Coinbase', async () => {
  const m = monde({ marches });
  assert.ok(m.f.cablerFundActifs, 'le cablage de Fund n est pas une fonction executable de app.html');
  const sel = m.els['#brBlock'];
  sel.innerHTML = '<option value="' + BLOC_USDC + '">SNDKc</option><option value="' + BLOC + '">IB022</option>';
  m.f.cablerFundActifs(sel);
  assert.equal(m.els['#brFundWallet'].textContent, 'Fund wallet — Get USDC on Base');
  assert.ok(m.fundBtns[1].classes.has('on') && !m.fundBtns[0].classes.has('on'));
  m.els['#brFundWallet'].declencher('click');
  assert.deepEqual(m.etat.rails, ['USDC']);
  sel.value = BLOC; sel.declencher('change');
  assert.equal(m.els['#brFundWallet'].textContent, 'Fund wallet — Get ETH on Base', 'le defaut ne suit pas le hub');
  m.fundBtns[1].declencher('click');
  sel.value = BLOC_USDC; sel.declencher('change'); sel.value = BLOC; sel.declencher('change');
  assert.equal(m.els['#brFundWallet'].textContent, 'Fund wallet — Get USDC on Base', 'un repeint du defaut a defait le choix de la personne');
});
await cas('(5b) Fund : le hub RESTAURE par peindreBridgeBlocks (sans evenement change) repeint le defaut', async () => {
  const m = monde({ marches });
  assert.ok(m.f.cablerFundActifs && m.f.peindreBridgeBlocks, 'fonctions introuvables');
  m.els['#profil'].dataset.block = BLOC; /* derniere fiche ouverte : cotee ETH */
  m.f.cablerFundActifs(m.els['#brBlock']);
  assert.equal(m.els['#brFundWallet'].textContent, 'Fund wallet — Get ETH on Base');
  m.etat.hubSauve = BLOC_USDC; m.etat.blocksDe = [BLOC_USDC];
  await m.f.peindreBridgeBlocks();
  assert.equal(m.els['#brBlock'].value, BLOC_USDC, 'le hub sauve n est pas restaure (banc faux)');
  assert.equal(m.els['#brFundWallet'].textContent, 'Fund wallet — Get USDC on Base', 'le defaut reste sur la derniere fiche, pas sur le hub restaure');
  m.ctx.compte = null; m.etat.hubSauve = BLOC;
  await m.f.peindreBridgeBlocks();
  assert.equal(m.els['#brFundWallet'].textContent, 'Fund wallet — Get ETH on Base', 'sans wallet, le hub sauve ne repeint pas le defaut');
});

/* ── 6. court=1 et le lien partage ──────────────────────────────────────────────────────────────── */
await cas('(6) /api/onramp/options : court=1 laisse la liste des actifs au serveur, le reste voyage', async () => {
  const r = { etat: 'OK', actifs: [{ symbol: 'ETH' }, { symbol: 'USDC' }], fiatsDeclares: ['EUR'], moyens: ['CARD'], moyensParFiat: { EUR: ['CARD'] }, pays: 'FR' };
  const court = corpsReponseOptions(r, { court: true });
  assert.ok(!('actifs' in court), 'court=1 renvoie encore la liste des actifs');
  assert.equal(court.n, 2); assert.deepEqual(court.moyens, ['CARD']); assert.equal(court.nFiats, 1);
  assert.deepEqual(corpsReponseOptions(r, {}).actifs, r.actifs, 'sans court, la liste des actifs manque');
  assert.equal(corpsReponseOptions({ etat: 'OK', actifs: [], fiatsDeclares: null, moyens: null }, {}).nFiats, null, 'un compte de fiats non lu devient 0');
  assert.equal(corpsReponseOptions({ etat: 'NON_MESURE', pourquoi: 'x' }).ok, false);
  const i = nuSrv.indexOf("chemin === '/api/onramp/options'");
  const route = nuSrv.slice(i, nuSrv.indexOf("chemin === '/api/onramp/session'", i));
  assert.ok(/corpsReponseOptions\(r, \{ court: q\.get\('court'\) === '1' \}\)/.test(route), 'la route ne passe pas court=1 au corps execute');
});
await cas('(6b) un retour de paiement n affiche pas la banniere du lien partage', async () => {
  assert.ok(/if \(blockLien && ADRESSE\.test\(blockLien\) && !retourFiat\) \{/.test(nu),
    'le garde !retourFiat a disparu : la personne qui revient de Coinbase lirait « Someone shared this block with you » et la fiche s ouvrirait deux fois');
  assert.ok(nu.indexOf('const retourFiat = lireRetourFiat(location.search)') < nu.indexOf('if (blockLien && ADRESSE.test(blockLien) && !retourFiat)'));
});

assert.equal(n, 18,'compte de cas inattendu : ' + n);
if (ko.length) { console.error(ko.length + ' / ' + n + ' KO'); process.exit(1); }
console.log('ok retour-fiat-garde-actif - ' + n + ' cas, vraies fonctions de app.html executees : 15 rebatissages, USDC retire,');
console.log('   choix de la personne, reserve de gas, relecture arretee, attente qui suit le panneau, Fund sur le hub restaure.');
console.log('NE PROUVE PAS : le rendu navigateur (mesure a part), un vrai achat, ni le vrai rythme des lectures de prix.');
