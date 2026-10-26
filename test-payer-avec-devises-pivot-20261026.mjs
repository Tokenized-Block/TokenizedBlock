/* test-payer-avec-devises-pivot-20261026.mjs — « PAY WITH » DE LA FICHE OFFRE EURC, cbBTC ET WETH LA OU LE SERVEUR LES ROUTE.
 *
 * GAP mesure en prod game51 (375 px, block 0xb200…579e cote en ETH) : #peDevise offrait ETH, USDC, OUSD et 20 actions — ni EURC,
 *   ni WETH, et cbBTC seulement dans « Not offered yet — no route » — alors que depuis game48 /api/rails/plan route WETH, cbBTC et
 *   EURC vers un block cote en ETH ou en USDC (lotPivotUsdcVersBloc ; EURC -> ce block mesure PRET en prod ; banc fork 64/0).
 *
 * CE BANC EXECUTE LES VRAIES FONCTIONS DE app.html (extraites telles quelles) dans un `vm`, avec les VRAIS modules de decision
 *   (devises-dentree.js, paires.js, entree-vers-bloc.js — celui que rails-api.js re-exporte) et un faux DOM :
 *   A. block cote en ETH, sans wallet : EURC, cbBTC, WETH apparaissent (« — routed »), selectionnables ; cbBTC ne figure plus dans
 *      « Not offered yet » ; ETH reste la valeur par defaut et deviseDentree reste null (chemin historique intact) ;
 *   B. MEME SOURCE QUE LE SERVEUR : chaque pivot offert est un PIVOT_AERODROME pour entreeVersBloc ; un block cote en USDC les offre
 *      aussi ; un block cote dans une action ne les offre PAS (le serveur refuserait) ;
 *   C. wallet : les soldes des pivots sont lus UNE fois (balanceOf), un pivot tenu reste selectionnable, un pivot a 0 est grise
 *      avec sa raison (« you hold none ») ; un solde illisible ne grise rien ;
 *   D. choisir EURC : deviseDentree porte le rail serveur, l etiquette dit « Buy — EURC to spend », la note dit le chemin et le
 *      panneau, et ne promet pas le bareme 0,2 % du rail multi-sauts ;
 *   E. Prepare buy (payerParRailServeur) : 0 EURC tenu -> refus qui dit le solde, AUCUN plan demande ; solde suffisant -> le chemin
 *      du panneau (bcProposerSwap, celui du Market et du Swap du Wallet) avec EXACTEMENT { de: EURC, vers: le block, montant brut } ;
 *      solde illisible -> le panneau (qui relit le solde) ;
 *   F. preparerEchange aiguille le rail serveur AVANT le multi-sauts et le chemin historique (sinon l etiquette dirait EURC et le
 *      wallet signerait de l ETH) ;
 *   G. le garde du retour fiat tient avec les pivots dans la liste : 15 rebatissages gardent USDC + le montant ; choisir EURC le retire ;
 *   I-L (revue adverse de 0b18fb3, defaut DEJA en prod game51) : le choix de la personne SURVIT aux rebatissages — USDC, une
 *      action (NVDAc), OUSD, EURC : choix + « 25 » tape + 44 rebatissages = toujours cet actif, son etiquette, le montant ; un choix
 *      qui n est plus offert (ou grise, ou une autre fiche) RETIRE le montant tape et dit pourquoi ; preparerEchange EXECUTE prend
 *      le choix AU CLIC (un reset pendant l await de pret ne change ni le chemin ni les decimales) ;
 *   H. chaque regle tue son mutant (copies EN MEMOIRE de app.html, jamais le fichier).
 * serie-delai-s: 900 — 266 s SEUL (2026-10-26, avant les cas S) puis davantage avec 48 mutants ; tue a 300 s dans une serie a 3.
 * NE PROUVE PAS : un vrai wallet, un vrai plan (le banc fork banc-devises-pivot-vers-bloc-fork-20261026 le fait cote serveur), les
 *   pixels (mesure navigateur a part).
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { devisesDentree, peutEtreAssemblee, phraseDevise, resumeDesNonOffertes } from './devises-dentree.js';
import { pairesProposees } from './paires.js';
import { devisesPivotVersBloc, entreeVersBloc } from './entree-vers-bloc.js';
import { entreeVersBloc as entreeServeur } from './rails-api.js';
import { formaterUnites, montantHumain } from './montants.js';
import { USDC_BASE, formaterEthCourt } from './frais-creation.js';

/* TB_APP_HTML : rejouer le banc sur un AUTRE app.html (ex. `git show 0b18fb3:app.html`) pour mesurer le rouge d avant */
const APP = readFileSync(process.env.TB_APP_HTML || new URL('./app.html', import.meta.url), 'utf8');
const ETH = '0x0000000000000000000000000000000000000000';
const USDC = USDC_BASE.toLowerCase();
const EURC = '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42';
const CBBTC = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf';
const WETH = '0x4200000000000000000000000000000000000006';
const OUSD = String(pairesProposees(8453).find((p) => p.symbole === 'OUSD').adr).toLowerCase();
const NVDA = String(pairesProposees(8453).find((p) => p.symbole === 'NVDAc').adr).toLowerCase();
const BLOC = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const WALLET = '0x00000000000000000000000000000000c0ffee77';
const FONCTIONS = ['majDevisesDentree', 'majDevisesDentreeCorps', 'majEtiquetteDeviseDentree', 'garderPrefillFiat', 'deviseDuChampBuy',
  'pivotsPourPayWith', 'lireSoldesPivots', 'payerParRailServeur', 'garderChoixPayWith', 'preparerEchange', 'noterPayWith', 'effacerNotePayWith',
  'retirerNotePayWith', 'retirerActionsPreparees', 'direActionsRetirees', 'cleEtapePreparee', 'gardeClicEtape',
  'symboleDuChampBuy', 'majPucesPremier', 'cliquerPucePremier',
  'avancerIntention', 'retirerTexteEtape', 'intentionChangee', 'nouvelleIntention', 'intentionVivante', 'ajouterEtape',
  'afficherPlanMultiSauts', 'ligneFraisMultiSauts'];
const PHRASE_ETIQ = (s) => 'Buy — ' + s + ' to spend';

/* une fonction de premier niveau : de `function NOM(` a la premiere `}` en colonne 0 ; absente = '' */
const extraire = (src, nom) => {
  const m = new RegExp('\\n(async )?function ' + nom + '\\(').exec(src);
  if (!m) return '';
  const i = m.index + 1;
  const f = /\r?\n\}\r?\n/.exec(src.slice(i));
  return f ? src.slice(i, i + f.index + f[0].length) : '';
};

class El {
  constructor(id) { this.id = id; this.hidden = false; this._value = ''; this.textContent = ''; this.title = ''; this.className = ''; this.dataset = {}; this.onchange = null; this.label = null; this.ecoute = {}; }
  get value() { return this._value; }
  set value(v) { this._value = String(v); }
  closest() { return this.label; }
  /* #peActions : de vrais enfants (les boutons prepares) ; innerHTML = '' les retire, comme le DOM */
  get children() { return this._enfants || (this._enfants = []); }
  get innerHTML() { return this._html || ''; }
  set innerHTML(h) { this._html = String(h); this._enfants = []; }
  appendChild(o) { this.children.push(o); return o; }
  addEventListener(t, f) { (this.ecoute[t] ||= []).push(f); }
  /* une frappe de la personne : la valeur, puis les ecouteurs `input` REELS de app.html (voir ecouteursChamps) */
  taper(v) { this.value = v; for (const f of this.ecoute.input || []) f({ target: this }); }
}
class Sel extends El {
  constructor(id) { super(id); this.options = []; this.idx = -1; }
  get value() { return this.idx >= 0 ? this.options[this.idx].value : ''; }
  set value(v) { this.idx = this.options.findIndex((o) => o.value === String(v)); }
  set innerHTML(h) { this.options = []; this.idx = -1; }
  get innerHTML() { return ''; }
  appendChild(o) { this.options.push(o); if (this.idx < 0) this.idx = 0; }
  choisir(v) { this.value = v; if (typeof this.onchange === 'function') this.onchange({ target: this }); }
}

/** Un monde par cas : le code de `src` (app.html ou un mutant), un DOM faux, une chaine factice qui ne repond qu a balanceOf. */
function monde(src, { quote = ETH, compte = null, soldes = {}, soldeIllisible = false } = {}) {
  const els = {};
  for (const id of ['profil', 'peAchat', 'peDeviseBloc', 'peDeviseNote', 'peRetourFiat', 'peEtat', 'peActions', 'peLignes', 'peVente', 'peMaxEth', 'peMaxBloc', 'peUsdcEth', 'peRecoit']) els['#' + id] = new El(id);
  els['#peDevise'] = new Sel('peDevise');
  els['#peAchat'].label = { firstChild: { nodeType: 3, textContent: 'Buy — ETH to spend' } };
  els['#peRetourFiat'].hidden = true;
  els['#profil'].dataset.block = BLOC;
  /* les puces « premier acheteur » : les trois de app.html (ETH) + une puce TEMOIN en USDC (la fonction est generique : son
   *   etiquette doit nommer SON actif — tue le mutant « etiquette en dur ETH ») */
  const puce = (montant, actif) => ({ attrs: { 'data-premier': montant, 'data-actif': actif }, hidden: false, disabled: false, textContent: montant + ' ' + actif,
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, closest() { return this; } });
  const puces = [puce('0.001', 'ETH'), puce('0.005', 'ETH'), puce('0.02', 'ETH'), puce('5', 'USDC')];
  const premier = new El('pePremier');
  premier.querySelectorAll = () => puces;
  premier.querySelector = (q) => premier.children.find((x) => q === '.premierActif' && x.className === 'note premierActif') || null;
  els['#pePremier'] = premier;
  els['#peAcheter'] = new El('peAcheter');
  const etat = { balanceOf: [], panneau: [], ouvert: 0, repeints: 0, historique: [], multi: [], sansUsdc: false, surPret: null, decimales: [], prepare: 0,
    qui: [], plans: [], delais: [], sautsOk: false, delaiSolde: 0, pendantSolde: null, refuses: [] };
  els['#peAcheter'].click = () => { etat.prepare += 1; };
  const v = quote === ETH ? { etat: 'LUE', paire: 'ETH', cle: { hooks: '0x' + '1'.repeat(40) } } : { etat: 'LUE', paire: 'DEVISE', deviseAdr: quote, cle: { hooks: '0x' + '1'.repeat(40) } };
  const ctx = {
    console, JSON, String, Number, BigInt, Array, Set, Map, Object, Promise, Math, RegExp, Error, Date,
    $: (s) => els[s] || null,
    document: { createElement: () => { const o = { value: '', textContent: '', dataset: {}, disabled: false, title: '', style: {}, className: '', ecoute: {},
      addEventListener(t, f) { (this.ecoute[t] ||= []).push(f); } }; o.closest = () => o; return o; }, activeElement: null },
    deviseDentree: null, deviseEchange: null, fiatRetenu: null, quotePourCarte: null, offertsPourCarte: [], symProfil: 'IB022',
    compte, CHAINE: 8453, ETH_ADR: ETH, USDC_BASE,
    marcheParAdr: new Map(), faitsPoolLus: new Map([[BLOC, { famille: 'uniswap-v4' }], [CBBTC, { famille: 'aerodrome' }], [NVDA, { famille: 'uniswap-v4' }]]),
    faitsBlockEnVol: new Set(), devisesSansFaitsEnVol: new Set(), soldesPivots: new Map(), soldesPivotsDemandes: new Set(), choixPayWith: null,
    pairesProposees, devisesDentree, peutEtreAssemblee, resumeDesNonOffertes, phraseDevise, devisesPivotVersBloc, formaterUnites, montantHumain,
    prixUsdDevise: async () => {}, majEntreeCarte: () => {}, etape: () => {}, court: (a) => String(a).slice(0, 6),
    /* une action a pool v4 USDC (NVDAc) pour le cas « une action » ; `sansUsdc` retire le pont ETH/USDC (USDC et l action ne sont plus offerts) */
    aretesMesurees: () => (etat.sansUsdc ? [] : [{ de: ETH, vers: USDC_BASE, famille: 'uniswap-v4' }, { de: ETH, vers: USDC_BASE, famille: 'aerodrome' }])
      .concat([{ de: USDC, vers: OUSD, famille: 'uniswap-v4' }, { de: USDC_BASE, vers: CBBTC, famille: 'aerodrome' }, { de: USDC, vers: NVDA, famille: 'uniswap-v4' }]),
    /* ce dont preparerEchange a besoin jusqu a son aiguillage ; le chemin historique et le multi-sauts sont ENREGISTRES puis arretes */
    marcheProfil: null, etatVieProfil: 'LUE', profilEnLecture: false, echangeCourant: null, restaurationPayWith: false, listePayWithLue: false,
    genAchat: 0, intentionCourante: null, etatParSignature: false, champBlocBuy: null,
    echangeAutorise: () => true, fraisEstDynamique: () => false,
    direPrealable: () => {}, texteRefusConnexion: (t) => t, texteRefusEchange: () => 'refused',
    pret: async () => { if (etat.surPret) etat.surPret(); return true; },
    decimalesDe: async (a) => { etat.decimales.push(String(a).toLowerCase()); return [EURC, USDC, OUSD].includes(String(a).toLowerCase()) ? 6 : String(a).toLowerCase() === CBBTC ? 8 : 18; },
    clesReellesDe: async () => [], prixUsdDeviseLus: new Map(), LIQ_MIN_BUY_USD: 1000, FEE_WALLET: '0x' + 'a'.repeat(40), RESEAUX: {},
    planEchange: async (x) => { etat.historique.push(x); throw new Error('historique arrete par le banc'); },
    /* `etat.sautsOk` : les sauts sont batis (apres `etat.delais.shift()` ms), puis planEchangeMultiSauts rend APPROBATIONS — le rendu
     *   REEL d afficherPlanMultiSauts pose alors « Approval 1 of 1 » (D3 : deux Prepare qui se chevauchent) */
    sautsDepuisChemin: async (x) => {
      const rang = etat.multi.length;
      etat.multi.push(x);
      if (!etat.sautsOk) return { etat: 'REFUSE', pourquoi: 'arrete par le banc' };
      await new Promise((r) => setTimeout(r, etat.delais.length ? etat.delais.shift() : 0));
      /* `etat.refuses` : les appels (par rang) dont les sauts reviennent REFUSES, tard */
      if (etat.refuses.includes(rang)) return { etat: 'REFUSE', pourquoi: 'late refusal of call ' + rang };
      return { etat: 'OK', sauts: [{ cle: { hooks: ETH } }] };
    },
    planEchangeMultiSauts: async (x) => { etat.plans.push(String(x.montant)); return { etat: 'APPROBATIONS', etapes: [{ nom: 'Allow Permit2 for ' + x.montant, to: USDC, data: '0x' }] }; },
    rpc: async (methode, [call]) => {
      if (methode !== 'eth_call' || !String(call.data).startsWith('0x70a08231')) throw new Error('unexpected ' + methode);
      etat.balanceOf.push(String(call.to).toLowerCase());
      /* une macro-tache par lecture, et une borne : une boucle repeint -> relecture (le mutant « relus a chaque repeint ») ne doit ni
       *   affamer les minuteries du banc ni tourner pour toujours — au-dela de 60 lectures, la chaine factice ne repond plus */
      await new Promise((r) => setTimeout(r, etat.delaiSolde || 0));
      if (etat.pendantSolde) { const f = etat.pendantSolde; etat.pendantSolde = null; f(); }
      if (etat.balanceOf.length > 60) throw new Error('la chaine factice ne repond plus (borne du banc)');
      if (soldeIllisible) throw new Error('429');
      const s = soldes[String(call.to).toLowerCase()];
      return '0x' + BigInt(s || 0).toString(16);
    },
    bcOuvrirPop: () => { etat.ouvert += 1; },
    bcProposerSwap: async (qui, classe, arg) => { etat.panneau.push(arg); etat.qui.push(qui); },
    /* MAX : soldes lus (2 ETH), la reserve de gas, le formateur reel */
    soldesDex: { eth: 2n * 10n ** 18n, bloc: 5n * 10n ** 18n, decimales: 18, devise: null }, RESERVE_GAS_WEI: 300000000000000n, formaterEthCourt,
    Event: class { constructor(t) { this.type = t; } },
  };
  /* un dispatchEvent minimal : les ecouteurs du type, comme le DOM (utilise par MAX) */
  for (const el of Object.values(els)) el.dispatchEvent = (ev) => { for (const f of el.ecoute[ev.type] || []) f({ target: el, preventDefault() {} }); return true; };
  vm.createContext(ctx);
  const presentes = FONCTIONS.filter((f) => extraire(src, f));
  /* les ecouteurs `input` REELS de #peAchat / #peVente (et montantNulOuVide) : la tranche de app.html qui les pose, telle quelle */
  const iE = src.indexOf('const PHRASE_MONTANT_NUL'), fE = src.indexOf('async function preparerEthUsdc', iE);
  const ecouteursChamps = iE >= 0 && fE > iE ? src.slice(iE, fE) : '';
  /* les boutons MAX et la garde au clic de #peActions : la tranche de app.html qui les pose, telle quelle */
  const iM = src.indexOf('$(\'#peMaxEth\') && $(\'#peMaxEth\').addEventListener'), fM = src.indexOf('/* EN DIRECT, SANS BOUTON', iM);
  const iM0 = src.lastIndexOf('const ecrireMontantMax', iM);
  const tMax = iM >= 0 && fM > iM ? src.slice(iM0 >= 0 && iM - iM0 < 600 ? iM0 : iM, fM) : '';
  vm.runInContext(presentes.map((f) => extraire(src, f)).join('\n') + '\n' + ecouteursChamps + '\n' + tMax + '\nthis.__ = { ' + presentes.join(', ') + ' };', ctx);
  const opts = () => els['#peDevise'].options.map((o) => ({ v: String(o.value).toLowerCase(), t: o.textContent, off: !!o.disabled }));
  return { ctx, els, etat, v, f: ctx.__, opts, rebatir: () => ctx.__.majDevisesDentree(v) };
}
const attendre = () => new Promise((r) => setTimeout(r, 10));
const pivotsDe = (m) => m.opts().filter((o) => [EURC, CBBTC, WETH].includes(o.v));

/** Toutes les regles sur un texte donne : rend la liste des violations (vide = vert). Le MEME code juge app.html et ses mutants. */
async function verifier(src) {
  const ko = [];
  const cas = async (titre, f) => { try { await f(); } catch (e) { ko.push(titre + ' — ' + String(e.message).split('\n')[0]); } };

  await cas('A block cote ETH sans wallet : EURC, cbBTC, WETH offerts et selectionnables', async () => {
    const m = monde(src); m.rebatir();
    const p = pivotsDe(m);
    assert.deepEqual(p.map((o) => o.v).sort(), [EURC, CBBTC, WETH].sort(), 'pivots offerts : ' + JSON.stringify(m.opts().map((o) => o.t)));
    assert.ok(p.every((o) => !o.off && / — routed$/.test(o.t)), JSON.stringify(p));
    assert.ok(['ETH', 'USDC — routed', 'OUSD — routed'].every((t) => m.opts().some((o) => o.t === t)), 'les offres d avant restent : ' + JSON.stringify(m.opts().map((o) => o.t)));
    assert.equal(m.els['#peDevise'].value, ETH, 'la valeur par defaut n est plus la devise de la pool');
    assert.equal(m.ctx.deviseDentree, null, 'le defaut doit rester le chemin historique');
    assert.equal(m.els['#peDeviseBloc'].hidden, false);
    assert.ok(!/cbBTC/.test(m.els['#peDeviseNote'].title || ''), 'cbBTC est offert ET dit « not offered » : ' + m.els['#peDeviseNote'].title);
    assert.deepEqual(m.etat.balanceOf, [], 'sans wallet, aucune lecture de solde');
  });
  await cas('B meme source que le serveur : USDC-cote offre, action-cotee n offre pas', async () => {
    for (const q of [ETH, USDC]) {
      const m = monde(src, { quote: q }); m.rebatir();
      const p = pivotsDe(m);
      assert.equal(p.length, 3, 'cote ' + q + ' : ' + p.length + ' pivots');
      for (const o of p) {
        assert.equal(entreeVersBloc({ de: o.v, quote: q }), 'PIVOT_AERODROME');
        assert.equal(entreeServeur({ de: o.v, quote: q }), 'PIVOT_AERODROME', 'le serveur refuserait ' + o.t);
      }
    }
    const m = monde(src, { quote: NVDA }); m.rebatir();
    assert.equal(pivotsDe(m).length, 0, 'block cote en NVDAc : le serveur refuse les pivots, la fiche les offre : ' + JSON.stringify(pivotsDe(m)));
  });
  await cas('C wallet : un pivot tenu reste selectionnable, un pivot a 0 est grise avec sa raison ; lus une fois', async () => {
    const m = monde(src, { compte: WALLET, soldes: { [WETH]: 5n * 10n ** 17n } });
    m.rebatir(); await attendre(); await attendre();
    const p = Object.fromEntries(pivotsDe(m).map((o) => [o.v, o]));
    assert.ok(p[WETH] && !p[WETH].off && / — routed$/.test(p[WETH].t), 'WETH tenu : ' + JSON.stringify(p[WETH]));
    assert.ok(p[EURC] && p[EURC].off && /you hold none/.test(p[EURC].t), 'EURC a 0 : ' + JSON.stringify(p[EURC]));
    assert.ok(p[CBBTC] && p[CBBTC].off, 'cbBTC a 0 : ' + JSON.stringify(p[CBBTC]));
    assert.deepEqual([...m.etat.balanceOf].sort(), [EURC, CBBTC, WETH].sort(), 'lectures : ' + JSON.stringify(m.etat.balanceOf));
    for (let i = 0; i < 5; i += 1) m.rebatir();
    await attendre();
    assert.equal(m.etat.balanceOf.length, 3, '5 repeints relisent les soldes : ' + m.etat.balanceOf.length);
    const i = monde(src, { compte: WALLET, soldeIllisible: true }); i.rebatir(); await attendre(); await attendre();
    assert.ok(pivotsDe(i).length === 3 && pivotsDe(i).every((o) => !o.off), 'un solde illisible a grise un pivot : ' + JSON.stringify(pivotsDe(i)));
  });
  await cas('D choisir EURC : rail serveur, etiquette, note du chemin', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peDevise'].choisir(EURC);
    const d = m.ctx.deviseDentree;
    assert.ok(d && d.devise === EURC && d.parRailServeur === true && d.symbole === 'EURC', JSON.stringify(d));
    assert.equal(m.els['#peAchat'].label.firstChild.textContent, 'Buy — EURC to spend');
    const n = m.els['#peDeviseNote'].textContent;
    assert.ok(/USDC/.test(n) && /Chat panel/.test(n) && !/0\.2%/.test(n) && !/Not computed/.test(n), 'note : ' + n);
    m.els['#peDevise'].choisir(ETH);
    assert.equal(m.ctx.deviseDentree, null);
  });
  await cas('E Prepare buy : 0 EURC tenu = refus sans plan ; tenu = le panneau, entree exacte ; illisible = le panneau', async () => {
    const m = monde(src, { compte: WALLET });
    m.rebatir(); m.els['#peDevise'].choisir(EURC);
    assert.ok(m.f.payerParRailServeur, 'payerParRailServeur absente');
    const e = m.els['#peEtat'];
    const r0 = await m.f.payerParRailServeur({ d: m.ctx.deviseDentree, block: BLOC, montant: 2500000n, dec: 6, e });
    assert.equal(r0, 'SOLDE');
    assert.equal(m.etat.panneau.length, 0, 'un plan a ete demande pour un wallet sans EURC');
    assert.ok(/holds 0 EURC/.test(e.textContent) && /not enough/.test(e.textContent) && /nothing to sign/i.test(e.textContent), e.textContent);
    assert.equal(e.className, 'note wKo');
    const t = monde(src, { compte: WALLET, soldes: { [EURC]: 3000000n } });
    t.rebatir(); t.els['#peDevise'].choisir(EURC);
    const r1 = await t.f.payerParRailServeur({ d: t.ctx.deviseDentree, block: BLOC, montant: 2500000n, dec: 6, e: t.els['#peEtat'] });
    assert.equal(r1, 'PANNEAU');
    assert.equal(t.etat.panneau.length, 1);
    const a = t.etat.panneau[0];
    assert.ok(a.de.adr === EURC && a.de.sym === 'EURC' && a.vers.adr === BLOC && a.vers.sym === 'IB022' && a.montant === '2500000', JSON.stringify(a));
    assert.equal(t.etat.ouvert, 1, 'le panneau n est pas ouvert');
    const i = monde(src, { compte: WALLET, soldeIllisible: true });
    i.rebatir(); i.els['#peDevise'].choisir(EURC);
    assert.equal(await i.f.payerParRailServeur({ d: i.ctx.deviseDentree, block: BLOC, montant: 1n, dec: 6, e: i.els['#peEtat'] }), 'PANNEAU');
    assert.ok(/could not be read/.test(i.els['#peEtat'].textContent), i.els['#peEtat'].textContent);
  });
  await cas('F preparerEchange aiguille le rail serveur avant le multi-sauts et le chemin historique', async () => {
    const pe = extraire(src, 'preparerEchange');
    const iRail = pe.search(/choix\.parRailServeur === true\)\s*\{?\s*return payerParRailServeur\(/);
    const iMulti = pe.indexOf('Array.isArray(choix.chemin)');
    const iHist = pe.indexOf('p = await planEchange({');
    assert.ok(iRail > 0 && iMulti > iRail && iHist > iRail, 'rail ' + iRail + ' multi ' + iMulti + ' historique ' + iHist);
  });
  await cas('G garde du retour fiat avec les pivots : USDC + montant tiennent ; choisir EURC retire le montant', async () => {
    const m = monde(src);
    m.ctx.fiatRetenu = { block: BLOC, devise: USDC, actif: 'USDC', montant: '0.001752', pose: null, debut: 'Arrived.', phrasePose: 'Prefilled.', choixPersonne: false };
    for (let i = 0; i < 15; i += 1) m.rebatir();
    assert.equal(m.els['#peDevise'].value, USDC);
    assert.equal(m.els['#peAchat'].value, '0.001752');
    m.els['#peDevise'].choisir(EURC);
    assert.equal(m.els['#peAchat'].value, '', 'le montant USDC reste sous EURC');
    assert.match(m.els['#peRetourFiat'].textContent, /no longer paid in USDC/);
  });

  /* ── I-L : la revue adverse de 0b18fb3 — le choix de la personne survit aux rebatissages, pour TOUTES les devises ── */
  for (const [nom, adr] of [['USDC', USDC], ['NVDAc', NVDA], ['OUSD', OUSD], ['EURC', EURC]]) {
    await cas('I choix ' + nom + ' + « 25 » tape : 44 rebatissages (et les lectures de solde) gardent ' + nom + ', son etiquette et le montant', async () => {
      const m = monde(src, { compte: WALLET, soldes: { [EURC]: 10n ** 9n } });
      m.rebatir();
      assert.ok(m.opts().some((o) => o.v === adr && !o.off), nom + ' n est pas offert dans le banc : ' + JSON.stringify(m.opts().map((o) => o.t)));
      m.els['#peDevise'].choisir(adr);
      m.els['#peAchat'].value = '25';
      for (let i = 0; i < 44; i += 1) { m.rebatir(); if (i % 11 === 0) await attendre(); }
      await attendre();
      assert.equal(m.els['#peDevise'].value, adr, 'apres 44 rebatissages le selecteur est sur ' + m.els['#peDevise'].value);
      assert.ok(m.ctx.deviseDentree && m.ctx.deviseDentree.devise === adr, 'deviseDentree = ' + JSON.stringify(m.ctx.deviseDentree && m.ctx.deviseDentree.devise));
      assert.equal(m.els['#peAchat'].label.firstChild.textContent, PHRASE_ETIQ(nom));
      assert.equal(m.els['#peAchat'].value, '25');
    });
  }
  await cas('J le choix n est plus offert : le montant tape est RETIRE, la note dit pourquoi, le champ revient a la devise de la pool', async () => {
    const m = monde(src);
    m.rebatir();
    m.els['#peDevise'].choisir(USDC);
    m.els['#peAchat'].value = '25';
    m.etat.sansUsdc = true;
    m.rebatir();
    assert.ok(!m.opts().some((o) => o.v === USDC), 'le banc devait retirer USDC de la liste');
    assert.equal(m.ctx.deviseDentree, null);
    assert.equal(m.els['#peAchat'].value, '', '« 25 » tape en USDC reste sous ' + m.els['#peAchat'].label.firstChild.textContent);
    assert.match(m.els['#peEtat'].textContent, /typed was in USDC.*no longer offers it.*taken out/);
    m.etat.sansUsdc = false; m.rebatir();
    assert.equal(m.els['#peDevise'].value, ETH, 'un choix oublie ne doit pas revenir tout seul');
  });
  await cas('J2 un pivot devenu « you hold none » : le montant tape sous lui est retire', async () => {
    const m = monde(src, { compte: WALLET });
    m.rebatir();
    m.els['#peDevise'].choisir(EURC);
    m.els['#peAchat'].value = '25';
    await attendre(); await attendre();
    assert.ok(pivotsDe(m).find((o) => o.v === EURC).off, 'EURC aurait du etre grise (solde lu 0)');
    assert.equal(m.els['#peAchat'].value, '');
    assert.match(m.els['#peEtat'].textContent, /holds none/);
  });
  await cas('K une autre fiche : un montant tape sous EURC ne reste pas sous l ETH de l autre block', async () => {
    const m = monde(src);
    m.rebatir();
    m.els['#peDevise'].choisir(EURC);
    m.els['#peAchat'].value = '25';
    m.els['#profil'].dataset.block = '0xb20000000000000000000066242d4067724cb7a1';
    m.rebatir();
    assert.equal(m.els['#peAchat'].value, '');
    assert.match(m.els['#peEtat'].textContent, /another block/);
  });
  await cas('L preparerEchange EXECUTE : EURC choisi -> bcProposerSwap recoit EURC (6 decimales), jamais le chemin ETH ; un reset pendant pret ne change rien', async () => {
    const m = monde(src, { compte: WALLET, soldes: { [EURC]: 10n ** 9n } });
    assert.ok(m.f.preparerEchange, 'preparerEchange introuvable');
    m.rebatir();
    m.els['#peDevise'].choisir(EURC);
    m.els['#peAchat'].value = '2.5';
    /* les lectures de solde reglees AVANT le clic : aucun repeint en attente ne vient re-poser le choix pendant l await (sinon le
     *   garde masquerait la course que ce cas mesure) */
    await attendre(); await attendre();
    /* 2026-10-26 (intention) : un rebatissage PENDANT l await de pret — la variable vivante remise a la devise de la pool, puis
     *   le garde du choix la remet sur EURC (le cas reel). Le chemin reste EURC, les decimales celles d EURC. */
    m.etat.surPret = () => { m.ctx.deviseDentree = null; m.els['#peDevise'].value = ETH; m.rebatir(); };
    try { await m.f.preparerEchange('ACHAT'); } catch (_) { /* la suite hors aiguillage n est pas sous test */ }
    assert.deepEqual(m.etat.historique, [], 'le chemin historique (ETH) a ete pris');
    assert.equal(m.etat.panneau.length, 1, 'bcProposerSwap appele ' + m.etat.panneau.length + ' fois');
    const a = m.etat.panneau[0];
    assert.ok(a.de.adr === EURC && a.montant === '2500000' && a.vers.adr === BLOC, JSON.stringify(a));
    assert.deepEqual(m.etat.decimales, [EURC], 'decimales lues : ' + JSON.stringify(m.etat.decimales));
    /* le temoin : sans choix, le meme clic prend le chemin historique (le banc sait le voir) */
    const t = monde(src); t.rebatir(); t.els['#peAchat'].value = '0.01';
    try { await t.f.preparerEchange('ACHAT'); } catch (_) {}
    assert.equal(t.etat.historique.length, 1, 'temoin : le chemin historique n a pas ete vu');
    assert.equal(t.etat.panneau.length, 0);
    /* et un reset SANS remise (l ecran dit maintenant ETH) : ni le plan EURC ni le chemin ETH — on se tait */
    const s = monde(src, { compte: WALLET, soldes: { [EURC]: 10n ** 9n } });
    s.rebatir(); s.els['#peDevise'].choisir(EURC); s.els['#peAchat'].value = '2.5';
    await attendre(); await attendre();
    s.etat.surPret = () => { s.ctx.deviseDentree = null; s.ctx.choixPayWith = null; s.els['#peDevise'].value = ETH; };
    try { await s.f.preparerEchange('ACHAT'); } catch (_) {}
    assert.deepEqual(s.etat.historique, [], 'reset sans remise : le chemin ETH a ete pris');
    assert.equal(s.etat.panneau.length, 0, 'reset sans remise : le plan EURC est parti vers le panneau');
  });
  await cas('L2 preparerEchange EXECUTE : USDC (route multi-sauts) garde SA route meme si un reset arrive pendant pret', async () => {
    const m = monde(src, { compte: WALLET });
    m.rebatir();
    m.els['#peDevise'].choisir(USDC);
    m.els['#peAchat'].value = '25';
    await attendre(); await attendre();
    m.etat.surPret = () => { m.ctx.deviseDentree = null; m.rebatir(); };
    try { await m.f.preparerEchange('ACHAT'); } catch (_) {}
    assert.deepEqual(m.etat.historique, [], 'le chemin historique (ETH) a ete pris pour un choix USDC');
    assert.equal(m.etat.multi.length, 1, 'le multi-sauts USDC n a pas ete construit');
    assert.equal(m.etat.multi[0].montant, 25000000n, 'montant en decimales USDC : ' + m.etat.multi[0].montant);
  });

  /* ── P1-P4 : suite de la revue de 4a6018e ── */
  await cas('P1 la personne passe d USDC (25 tape) a ETH : 25 est RETIRE, la note le dit ; revenir a USDC ne le ressuscite pas', async () => {
    const m = monde(src);
    m.rebatir();
    m.els['#peDevise'].choisir(USDC);
    m.els['#peAchat'].taper('25');
    m.els['#peDevise'].choisir(ETH);
    assert.equal(m.els['#peAchat'].value, '', '25 tape en USDC reste sous ' + m.els['#peAchat'].label.firstChild.textContent);
    assert.match(m.els['#peEtat'].textContent, /typed was in USDC, so it was taken out when you picked ETH/);
    m.els['#peDevise'].choisir(USDC);
    assert.equal(m.els['#peAchat'].value, '', 'le montant retire est revenu');
    /* une action, puis un pivot : meme regle */
    m.els['#peAchat'].taper('3');
    m.els['#peDevise'].choisir(NVDA);
    assert.equal(m.els['#peAchat'].value, '');
    assert.match(m.els['#peEtat'].textContent, /typed was in USDC, so it was taken out when you picked NVDAc/);
    m.els['#peAchat'].taper('4');
    m.els['#peDevise'].choisir(EURC);
    assert.equal(m.els['#peAchat'].value, '');
    assert.match(m.els['#peEtat'].textContent, /typed was in NVDAc/);
  });
  await cas('P1b les remises du choix (44 rebatissages) ne retirent rien ; le meme actif re-choisi ne retire rien', async () => {
    const m = monde(src);
    m.rebatir();
    m.els['#peDevise'].choisir(USDC);
    m.els['#peAchat'].taper('25');
    for (let i = 0; i < 44; i += 1) m.rebatir();
    m.els['#peDevise'].choisir(USDC);
    assert.equal(m.els['#peAchat'].value, '25');
  });
  await cas('P3 la note « taken out » s en va a la frappe d un nouveau montant, et a un nouveau choix', async () => {
    const m = monde(src);
    m.rebatir();
    m.els['#peDevise'].choisir(USDC);
    m.els['#peAchat'].taper('25');
    m.els['#peDevise'].choisir(EURC);
    assert.match(m.els['#peEtat'].textContent, /taken out/);
    m.els['#peAchat'].taper('2');
    assert.equal(m.els['#peEtat'].textContent, '', 'note perimee a cote du nouveau montant : ' + m.els['#peEtat'].textContent);
    m.els['#peAchat'].value = '';
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('9'); m.els['#peDevise'].choisir(ETH);
    assert.match(m.els['#peEtat'].textContent, /taken out/);
    m.els['#peDevise'].choisir(OUSD);
    assert.equal(m.els['#peEtat'].textContent, '', 'note perimee apres un nouveau choix (champ vide, rien retire) : ' + m.els['#peEtat'].textContent);
    /* une autre phrase (un refus) n est PAS effacee par une frappe */
    m.els['#peEtat'].textContent = 'Not prepared: the cheapest pool charges 9%.';
    m.els['#peAchat'].taper('5');
    assert.match(m.els['#peEtat'].textContent, /^Not prepared/);
  });
  await cas('P4 liste NON LUE (marche illisible) : le choix ATTEND, 25 reste, etiquette USDC, Prepare buy refuse ; relue : USDC revient ; relue sans USDC : retire', async () => {
    const m = monde(src);
    m.rebatir();
    m.els['#peDevise'].choisir(USDC);
    m.els['#peAchat'].taper('25');
    const nonLu = { etat: 'NON_LUE' };
    /* comme majDeviseEchange, qui remet l etiquette sur la devise de la pool AVANT chaque rebatissage (M11) */
    for (let i = 0; i < 3; i += 1) { m.els['#peAchat'].label.firstChild.textContent = PHRASE_ETIQ('ETH'); m.f.majDevisesDentree(nonLu); }
    assert.equal(m.els['#peDeviseBloc'].hidden, true, 'le banc devait cacher la liste');
    assert.equal(m.els['#peAchat'].value, '25', 'un rebatissage NON LU a retire le montant');
    assert.equal(m.els['#peAchat'].label.firstChild.textContent, PHRASE_ETIQ('USDC'));
    assert.ok(m.ctx.choixPayWith && m.ctx.choixPayWith.devise === USDC && m.ctx.choixPayWith.attente === true, JSON.stringify(m.ctx.choixPayWith));
    try { await m.f.preparerEchange('ACHAT'); } catch (_) {}
    assert.deepEqual(m.etat.historique, [], 'Prepare buy a pris le chemin ETH pendant l attente');
    assert.deepEqual(m.etat.multi, []);
    assert.match(m.els['#peEtat'].textContent, /being read again.*in USDC/);
    m.rebatir();
    assert.equal(m.els['#peDevise'].value, USDC);
    assert.equal(m.els['#peAchat'].value, '25');
    /* M12 : relue, l attente est levee — Prepare buy construit le chemin USDC au lieu de refuser pour toujours */
    try { await m.f.preparerEchange('ACHAT'); } catch (_) {}
    assert.equal(m.etat.multi.length, 1, 'apres relecture, Prepare buy refuse encore : ' + m.els['#peEtat'].textContent);
    m.etat.sansUsdc = true; m.rebatir();
    assert.equal(m.els['#peAchat'].value, '', 'une liste LUE sans USDC doit retirer le montant');
    /* M12, le cas ou la remise ne repasse pas par onchange : le choix EST la devise de la pool (ETH choisi explicitement) */
    const p = monde(src);
    p.rebatir();
    p.els['#peDevise'].choisir(ETH); p.els['#peAchat'].taper('0.01');
    p.f.majDevisesDentree(nonLu);
    assert.equal(p.ctx.choixPayWith && p.ctx.choixPayWith.attente, true);
    p.rebatir();
    try { await p.f.preparerEchange('ACHAT'); } catch (_) {}
    assert.equal(p.etat.historique.length, 1, 'ETH choisi, liste relue : Prepare buy refuse encore (« ' + p.els['#peEtat'].textContent + ' »)');
  });

  /* ── Q : une etape preparee ne se clique que pour l actif / le montant / le block pour lesquels elle a ete preparee ── */
  /* un bouton d etape, pose par le VRAI chemin (ajouterEtape : il porte son intention et sa propre garde) */
  const bouton = (m, nom) => {
    const b = { textContent: nom, clics: 0, dataset: {}, ecoute: {}, surClic() { this.clics += 1; },
      addEventListener(t, f) { (this.ecoute[t] ||= []).push(f); } };
    b.closest = () => b;
    m.f.ajouterEtape(b);
    return b;
  };
  /* un clic comme le DOM : les ecouteurs de #peActions (capture) d abord, puis ceux du bouton ; le gestionnaire du bouton seulement
   *   si personne n a arrete l evenement. `detache` : le bouton n est plus dans #peActions (seuls SES ecouteurs entendent le clic) */
  const cliquer = (m, b, detache = false) => {
    const ev = { target: b, arrete: false, preventDefault() {}, stopImmediatePropagation() { this.arrete = true; } };
    if (!detache) for (const f of m.els['#peActions'].ecoute.click || []) { if (!ev.arrete) f(ev); }
    for (const f of b.ecoute.click || []) { if (!ev.arrete) f(ev); }
    if (!ev.arrete) b.surClic();
    return !ev.arrete;
  };
  const preparer = async (m) => { try { await m.f.preparerEchange('ACHAT'); } catch (_) { /* la suite n est pas sous test */ } };
  const maxEth = (m) => { for (const f of m.els['#peMaxEth'].ecoute.click || []) f({ target: m.els['#peMaxEth'], preventDefault() {} }); };
  await cas('Q1 MAX apres Prepare : le montant change PAR UN EVENEMENT, l etape preparee est retiree', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peAchat'].taper('0.01');
    await preparer(m); bouton(m, 'Sign the buy');
    maxEth(m);
    assert.equal(m.els['#peAchat'].value, formaterEthCourt(2n * 10n ** 18n - 300000000000000n), 'MAX n a pas ecrit le solde moins la reserve');
    assert.equal(m.els['#peActions'].children.length, 0, 'l etape preparee pour 0.01 reste cliquable apres MAX');
    assert.match(m.els['#peEtat'].textContent, /removed because the amount changed/);
  });
  await cas('Q1b MAX avec « Pay with » sur USDC (marche cote ETH) : refuse, rien n est ecrit sous USDC', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('25');
    m.els['#peEtat'].textContent = 'Sent, not confirmed yet — do not sign it again.';
    maxEth(m); maxEth(m);
    assert.equal(m.els['#peAchat'].value, '25', 'MAX a ecrit un solde ETH sous « Buy — USDC to spend »');
    assert.equal(m.els['#peEtat'].textContent, 'Sent, not confirmed yet — do not sign it again. MAX reads this market’s own currency; with “Pay with” on another currency, type the amount.',
      'la phrase MAX a ecrase (ou repete) l etat « sent » : ' + m.els['#peEtat'].textContent);
  });
  await cas('Q2 une puce de montant apres Prepare (valeur + input, comme le gestionnaire data-premier) : etape retiree', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peAchat'].taper('0.01');
    await preparer(m); bouton(m, 'Sign the buy');
    m.els['#peAchat'].value = '0.005'; m.els['#peAchat'].dispatchEvent(new m.ctx.Event('input'));
    assert.equal(m.els['#peActions'].children.length, 0);
  });
  await cas('Q3 au clic : montant, devise ou block change SANS evenement -> clic ARRETE, etape retiree, raison dite', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('25');
    await preparer(m);
    let b = bouton(m, 'Approval 1 of 2');
    m.els['#peAchat'].value = '30'; /* ecrit sans evenement (retour fiat, intention, chemin oublie) */
    assert.equal(cliquer(m, b), false, 'le clic est passe pour 30 alors que l etape etait pour 25');
    assert.equal(b.clics, 0);
    assert.equal(m.els['#peActions'].children.length, 0);
    assert.match(m.els['#peEtat'].textContent, /amount changed since it was prepared \(it was for 25\) — nothing was sent/);
    m.els['#peAchat'].value = '25'; await preparer(m); b = bouton(m, 'Approval 1 of 2');
    m.ctx.deviseDentree = null; /* la devise vivante change sans remise */
    assert.equal(cliquer(m, b), false); assert.match(m.els['#peEtat'].textContent, /currency changed/);
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('25'); await preparer(m); b = bouton(m, 'Approval 1 of 2');
    m.els['#profil'].dataset.block = '0xb20000000000000000000066242d4067724cb7a1';
    assert.equal(cliquer(m, b), false); assert.match(m.els['#peEtat'].textContent, /another block/);
  });
  await cas('Q4 meme actif, meme montant, meme block : 44 rebatissages (et un reset pendant pret) laissent le clic passer', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('25');
    m.etat.surPret = () => { m.ctx.deviseDentree = null; };
    await preparer(m);
    m.etat.surPret = null;
    const b = bouton(m, 'Approval 1 of 2');
    for (let i = 0; i < 44; i += 1) m.rebatir();
    assert.equal(cliquer(m, b), true, 'une etape preparee pour USDC 25 est refusee alors que rien n a change : ' + m.els['#peEtat'].textContent);
    assert.equal(b.clics, 1);
  });
  await cas('Q4c le choix est PERDU pendant la preparation : rien n est bati, aucun bouton ne se pose (ni USDC ni ETH)', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('25');
    await attendre();
    m.etat.surPret = () => { m.ctx.deviseDentree = null; m.ctx.choixPayWith = null; };
    await preparer(m);
    m.etat.surPret = null;
    assert.equal(m.etat.multi.length, 0, 'un plan USDC a ete bati alors que l ecran dit ETH');
    assert.deepEqual(m.etat.historique, [], 'le chemin ETH a ete pris');
    bouton(m, 'Approval 1 of 2');
    assert.equal(m.els['#peActions'].children.length, 0, 'une etape s est posee pour une intention morte');
  });
  await cas('Q4b retour fiat : le plan prepare pour l actif livre et son montant survit aux rebatissages (bascules)', async () => {
    const m = monde(src);
    m.ctx.fiatRetenu = { block: BLOC, devise: USDC, actif: 'USDC', montant: '0.001752', pose: null, debut: 'Arrived.', phrasePose: 'Prefilled.', choixPersonne: false };
    m.rebatir();
    assert.equal(m.els['#peAchat'].value, '0.001752');
    await preparer(m);
    const b = bouton(m, 'Approval 1 of 2');
    for (let i = 0; i < 15; i += 1) m.rebatir();
    assert.equal(m.els['#peActions'].children.length, 1, 'la bascule du retour fiat a retire le plan');
    assert.equal(cliquer(m, b), true, m.els['#peEtat'].textContent);
  });

  /* ── R : les puces de montant nomment l actif du champ, et ne servent que sous lui ── */
  for (const [nom, adr] of [['ETH', null], ['USDC', USDC], ['NVDAc', NVDA], ['EURC', EURC]]) {
    await cas('R puces sous ' + nom + ' : chaque puce visible porte le symbole du champ ; une puce d un autre actif ne remplit ni ne prepare', async () => {
      const m = monde(src); m.rebatir();
      /* AUCUN appel direct : les puces doivent suivre d elles-memes le rebatissage et le choix de la personne */
      if (adr) m.els['#peDevise'].choisir(adr);
      const symChamp = m.els['#peAchat'].label.firstChild.textContent.replace(/^Buy — (.*) to spend$/, '$1');
      assert.equal(symChamp, nom, 'etiquette du champ : ' + m.els['#peAchat'].label.firstChild.textContent);
      const puces = m.els['#pePremier'].querySelectorAll('[data-premier]');
      const visibles = puces.filter((p) => !p.hidden);
      assert.ok(visibles.length > 0 || nom !== 'ETH', 'sous ETH, aucune puce visible');
      for (const p of visibles) assert.ok(p.textContent.endsWith(' ' + symChamp), 'puce « ' + p.textContent + ' » visible sous un champ en ' + symChamp);
      if (nom === 'USDC') assert.equal(visibles.map((p) => p.textContent).join('|'), '5 USDC', 'sous USDC : ' + visibles.map((p) => p.textContent).join('|'));
      if (nom !== 'ETH') {
        const note = m.els['#pePremier'].children.find((x) => x.className === 'note premierActif');
        assert.ok(note && /These amounts are in ETH; “Pay with” is on/.test(note.textContent), 'aucune ligne ne dit pourquoi les puces ETH sont cachees');
      }
      /* un clic sur la puce 0.005 ETH (meme cachee : un clic programme) */
      m.els['#peAchat'].value = '7';
      m.f.cliquerPucePremier({ target: puces[1] });
      if (nom === 'ETH') {
        assert.equal(m.els['#peAchat'].value, '0.005'); assert.equal(m.etat.prepare, 1);
      } else {
        assert.equal(m.els['#peAchat'].value, '7', 'la puce ETH a rempli le champ en ' + nom);
        assert.equal(m.etat.prepare, 0, 'la puce ETH a presse Prepare sous ' + nom);
        assert.match(m.els['#peEtat'].textContent, new RegExp('That amount is in ETH, and the Buy field is in ' + nom + ' — nothing was filled or prepared'));
      }
    });
  }

  /* ── S : l intention du panneau Buy (revue de 4f0994c..7ed7e93 : D3, D4, D1b, D5, m03, m06, m08, lignes perimees) ── */
  await cas('S-D3 deux Prepare qui se chevauchent (le 1er plus lent) : seul le 2e pose une etape, pour 30 ; le 1er se tait', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('25');
    m.etat.sautsOk = true; m.etat.delais = [40, 5];
    const p1 = preparer(m);
    await new Promise((r) => setTimeout(r, 5));
    m.els['#peAchat'].taper('30');
    const p2 = preparer(m);
    await Promise.all([p1, p2]); await attendre();
    const bts = m.els['#peActions'].children;
    assert.equal(bts.length, 1, bts.length + ' etapes posees : ' + bts.map((b) => b.textContent).join(' | '));
    assert.equal(JSON.parse(bts[0].dataset.intention).montant, '30', 'l etape porte ' + bts[0].dataset.intention);
    assert.match(bts[0].textContent, /30000000/, 'l etape posee vient du plan a 25 : ' + bts[0].textContent);
    /* et un 1er Prepare dont les sauts reviennent REFUSES, tard : son refus ne s ecrit pas sous l etape du 2e */
    const r = monde(src); r.rebatir();
    r.els['#peDevise'].choisir(USDC); r.els['#peAchat'].taper('25');
    r.etat.sautsOk = true; r.etat.delais = [40, 5]; r.etat.refuses = [0];
    const q1 = preparer(r);
    await new Promise((x) => setTimeout(x, 5));
    r.els['#peAchat'].taper('30');
    await Promise.all([q1, preparer(r)]); await attendre();
    assert.ok(!/refused/.test(r.els['#peEtat'].textContent), 'le refus tardif du 1er Prepare s ecrit sous le 2e : ' + r.els['#peEtat'].textContent);
    assert.equal(r.els['#peActions'].children.length, 1);
    /* un DOUBLE clic sur Prepare, meme montant : une seule etape (le compteur, pas la cle, distingue les deux) */
    const d = monde(src); d.rebatir();
    d.els['#peDevise'].choisir(USDC); d.els['#peAchat'].taper('25');
    d.etat.sautsOk = true; d.etat.delais = [30, 5];
    await Promise.all([preparer(d), preparer(d)]); await attendre();
    assert.equal(d.els['#peActions'].children.length, 1, 'double Prepare : ' + d.els['#peActions'].children.length + ' etapes');
  });
  await cas('S-D3b detache : un bouton retire de l ecran, clique quand meme apres un changement de montant, est ARRETE par SA garde', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('25');
    await preparer(m);
    const b = bouton(m, 'Approval 1 of 2');
    m.els['#peAchat'].value = '30';
    m.els['#peActions'].innerHTML = '';
    assert.equal(cliquer(m, b, true), false, 'un bouton detache a signe pour 25 sous un ecran a 30');
    assert.equal(b.clics, 0);
  });
  await cas('S-D4 EURC, passe a ETH pendant la lecture du solde : aucun plan vers le panneau ; sinon le panneau en mode PROPOSITION (jamais « You »)', async () => {
    const m = monde(src, { compte: WALLET, soldes: { [EURC]: 10n ** 9n } });
    m.rebatir(); m.els['#peDevise'].choisir(EURC); m.els['#peAchat'].taper('2.5');
    await attendre(); await attendre();
    m.etat.delaiSolde = 20;
    m.etat.pendantSolde = () => m.els['#peDevise'].choisir(ETH);
    await preparer(m);
    assert.equal(m.etat.panneau.length, 0, 'le plan EURC est parti vers le panneau apres le passage a ETH');
    const t = monde(src, { compte: WALLET, soldes: { [EURC]: 10n ** 9n } });
    t.rebatir(); t.els['#peDevise'].choisir(EURC); t.els['#peAchat'].taper('2.5');
    await attendre(); await attendre();
    await preparer(t);
    assert.equal(t.etat.panneau.length, 1);
    assert.deepEqual(t.etat.qui, ['Buy panel'], 'le panneau recoit ' + JSON.stringify(t.etat.qui) + ' : « You » ouvre le wallet tout seul');
    assert.match(t.els['#peEtat'].textContent, /Paying with EURC/);
    t.els['#peDevise'].choisir(ETH);
    assert.ok(!/Paying with EURC/.test(t.els['#peEtat'].textContent), 'la phrase EURC reste sous ETH : ' + t.els['#peEtat'].textContent);
  });
  await cas('S-D1b une frappe « 0 » apres un refus du wallet ou un « Sent » : la phrase s AJOUTE, et repart seule', async () => {
    for (const statut of ['Not done: you declined in your wallet.', 'Sent, not confirmed yet — do not sign it again.']) {
      const m = monde(src); m.rebatir();
      m.els['#peEtat'].textContent = statut; m.ctx.etatParSignature = true;
      m.els['#peAchat'].taper('0');
      assert.equal(m.els['#peEtat'].textContent, statut + ' Enter an amount above zero.', 'D1b : ' + m.els['#peEtat'].textContent);
      m.els['#peAchat'].taper('0.0');
      assert.equal(m.els['#peEtat'].textContent, statut + ' Enter an amount above zero.', 'repetee : ' + m.els['#peEtat'].textContent);
      m.els['#peAchat'].taper('1');
      assert.equal(m.els['#peEtat'].textContent, statut, 'apres un bon montant : ' + m.els['#peEtat'].textContent);
    }
  });
  await cas('S-D5 ETH -> USDC : l etape porte SON intention (montant de #peUsdcEth) ; changee sans evenement -> clic arrete ; une frappe la retire', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peUsdcEth'].value = '0.1';
    m.f.nouvelleIntention('ETHUSDC');
    let b = bouton(m, 'Sign ETH to USDC');
    assert.equal(JSON.parse(b.dataset.intention).montant, '0.1');
    m.els['#peUsdcEth'].value = '0.2';
    assert.equal(cliquer(m, b), false, 'l etape ETH->USDC pour 0.1 a signe pour 0.2');
    m.els['#peUsdcEth'].value = '0.1'; m.f.nouvelleIntention('ETHUSDC'); b = bouton(m, 'Sign ETH to USDC');
    m.els['#peUsdcEth'].taper('0.3');
    assert.equal(m.els['#peActions'].children.length, 0, 'une frappe dans #peUsdcEth laisse l etape');
  });
  await cas('S-m03 une vente vers un autre block : changer « Receive » sans evenement arrete le clic', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peVente'].value = '5'; m.els['#peRecoit'].value = '0xb2000000000000000000000000000000000000aa';
    m.f.nouvelleIntention('VENTE');
    const b = bouton(m, 'Sign the sale');
    m.els['#peRecoit'].value = '0xb2000000000000000000000000000000000000bb';
    assert.equal(cliquer(m, b), false);
    assert.match(m.els['#peEtat'].textContent, /what you receive changed/);
  });
  await cas('S-m06/m08 un clic arrete et une puce refusee AJOUTENT leur phrase apres un « Sent » (jamais par-dessus)', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('25');
    await preparer(m);
    const b = bouton(m, 'Approval 1 of 2');
    m.els['#peEtat'].textContent = 'Sent, not confirmed yet — do not sign it again.'; m.ctx.etatParSignature = true;
    m.els['#peAchat'].value = '30';
    cliquer(m, b);
    assert.match(m.els['#peEtat'].textContent, /^Sent, not confirmed yet — do not sign it again\. The step prepared before was removed/);
    m.f.cliquerPucePremier({ target: m.els['#pePremier'].querySelectorAll()[1] });
    assert.match(m.els['#peEtat'].textContent, /^Sent, not confirmed yet — do not sign it again\. .*That amount is in ETH/);
  });
  await cas('S-lignes la phrase de preparation (« This token needs an approval first… ») part avec son etape', async () => {
    const m = monde(src); m.rebatir();
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('25');
    m.etat.sautsOk = true;
    await preparer(m);
    assert.equal(m.els['#peActions'].children.length, 1);
    assert.match(m.els['#peEtat'].textContent, /needs an approval first/);
    m.els['#peDevise'].choisir(NVDA);
    assert.equal(m.els['#peActions'].children.length, 0);
    assert.ok(!/needs an approval first/.test(m.els['#peEtat'].textContent), 'phrase perimee : ' + m.els['#peEtat'].textContent);
  });

  /* ── D1, D2 : revue adverse de 4f0994c ── */
  await cas('D1 apres la note « taken out », un refus du wallet ou un « sent » ecrit dans #peEtat SURVIT a une frappe', async () => {
    const m = monde(src);
    m.rebatir();
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('25'); m.els['#peDevise'].choisir(ETH);
    assert.match(m.els['#peEtat'].textContent, /taken out/);
    /* signerEchange ecrit son resultat par-dessus (sans connaitre la marque) */
    m.els['#peEtat'].textContent = 'Not done: you declined in your wallet.';
    m.els['#peAchat'].taper('1');
    assert.equal(m.els['#peEtat'].textContent, 'Not done: you declined in your wallet.', 'une frappe a efface le refus du wallet');
    /* un « sent » deja affiche, puis la personne change d actif avec un montant : la note s AJOUTE, puis la frappe ne retire qu elle */
    m.els['#peEtat'].textContent = 'Sent — waiting for the receipt.';
    m.els['#peDevise'].choisir(USDC);
    assert.match(m.els['#peEtat'].textContent, /^Sent — waiting for the receipt\. The amount you typed was in ETH/);
    m.els['#peAchat'].taper('2');
    assert.equal(m.els['#peEtat'].textContent, 'Sent — waiting for the receipt.', 'la frappe a efface l etat « sent »');
  });
  await cas('D2 une etape preparee est retiree quand la personne change d actif ou de montant ; jamais par les rebatissages', async () => {
    const m = monde(src);
    m.rebatir();
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('25');
    const preparer = () => { m.els['#peActions'].appendChild({ textContent: 'Approval 1 of 2 — Allow Permit2' }); m.els['#peLignes'].innerHTML = '<li>You pay: 25 USDC</li>'; };
    preparer();
    m.els['#peDevise'].choisir(ETH);
    assert.equal(m.els['#peActions'].children.length, 0, 'l approbation USDC reste cliquable sous ETH');
    assert.equal(m.els['#peLignes'].innerHTML, '');
    assert.match(m.els['#peEtat'].textContent, /removed because you picked ETH/);
    m.els['#peDevise'].choisir(USDC); m.els['#peAchat'].taper('25'); preparer();
    for (let i = 0; i < 44; i += 1) m.rebatir();
    assert.equal(m.els['#peActions'].children.length, 1, 'un rebatissage (remise du choix) a retire l etape preparee');
    m.els['#peAchat'].taper('30');
    assert.equal(m.els['#peActions'].children.length, 0, 'l etape preparee pour 25 reste cliquable pour 30');
    assert.match(m.els['#peEtat'].textContent, /removed because the amount changed/);
    /* une frappe de plus ne retire pas cette phrase (elle n est pas marquee) */
    m.els['#peAchat'].taper('31');
    assert.match(m.els['#peEtat'].textContent, /removed because the amount changed/);
  });
  return ko;
}

let n = 0;
const vu = (c, msg) => { assert.ok(c, msg); n += 1; console.log('ok  ' + msg); };
const ko = await verifier(APP);
for (const k of ko) console.log('KO  ' + k);
if (ko.length) { console.log('ROUGE sur app.html : ' + ko.length + ' regles'); process.exit(1); }
vu(true, 'app.html : toutes les regles (A-L, P1-P4) passent');

/* ── H. les mutants, sur des COPIES en memoire ── */
const mutants = [
  ['pivots retires de la liste', (s) => s.replace('const pivots = pivotsPourPayWith(deviseDeLaPool, cliquables);', 'const pivots = [];')],
  ['pivots offerts quelle que soit la cotation', (s) => s.replace('for (const p of devisesPivotVersBloc(quote))', 'for (const p of devisesPivotVersBloc(ETH_ADR))')],
  ['un pivot a 0 n est plus grise', (s) => s.replace('o.disabled = d.tenu === false;', 'o.disabled = false;')],
  ['le refus du solde saute', (s) => s.replace('if (solde !== null && solde < montant) {', 'if (false) {')],
  ['preparerEchange ne branche plus le rail serveur', (s) => s.replace('choix && choix.parRailServeur === true)', 'choix && choix.parRailServeur === "x")')],
  ['M1 : la branche pivot en VENTE seulement', (s) => s.replace("if (sens === 'ACHAT' && choix && choix.parRailServeur === true)", "if (sens === 'VENTE' && choix && choix.parRailServeur === true)")],
  ['la branche pivot relit la variable vivante (course)', (s) => s.replace('if (sens === \'ACHAT\' && choix && choix.parRailServeur === true) {\n    return payerParRailServeur({ d: choix,', 'if (sens === \'ACHAT\' && deviseDentree && deviseDentree.parRailServeur === true) {\n    return payerParRailServeur({ d: deviseDentree,').replace("if (sens === 'ACHAT' && choix && choix.parRailServeur === true) {\r\n    return payerParRailServeur({ d: choix,", "if (sens === 'ACHAT' && deviseDentree && deviseDentree.parRailServeur === true) {\r\n    return payerParRailServeur({ d: deviseDentree,")],
  ['le multi-sauts relit la variable vivante (course)', (s) => s.replace("if (sens === 'ACHAT' && choix && Array.isArray(choix.chemin))", "if (sens === 'ACHAT' && deviseDentree && Array.isArray(deviseDentree.chemin))")],
  ['le garde du choix n est plus appele', (s) => s.replace('try { garderChoixPayWith(); } catch (_)', 'try { void 0; } catch (_)')],
  ['le choix n est plus retenu', (s) => s.replace('choixPayWith = { block: String(block).toLowerCase(),', 'void { block: String(block).toLowerCase(),')],
  ['le montant tape reste sous un choix perdu', (s) => s.replace("  champ.value = '';\n  noterPayWith('The amount you typed was in ' + c.sym", "  noterPayWith('The amount you typed was in ' + c.sym").replace("  champ.value = '';\r\n  noterPayWith('The amount you typed was in ' + c.sym", "  noterPayWith('The amount you typed was in ' + c.sym")],
  /* ── suite de la revue de 4a6018e (points 1, 3, 4) ── */
  ['P1 la personne change d actif : le montant tape reste', (s) => s.replace("          champ.value = '';\n          noterPayWith('The amount you typed was in ' + symAvant", "          noterPayWith('The amount you typed was in ' + symAvant").replace("          champ.value = '';\r\n          noterPayWith('The amount you typed was in ' + symAvant", "          noterPayWith('The amount you typed was in ' + symAvant")],
  ['P1 une remise du choix est traitee comme un geste de la personne', (s) => s.replace('const parLaPersonne = !bascule && !restaurationPayWith;', 'const parLaPersonne = !bascule;')],
  ['P3 un nouveau choix ne retire pas la vieille note', (s) => s.replace('        effacerNotePayWith();\n', '').replace('        effacerNotePayWith();\r\n', '')],
  ['P3 une frappe ne retire pas la vieille note', (s) => s.replace("if (typeof retirerNotePayWith === 'function') retirerNotePayWith(e);", 'void 0;')],
  ['D1 la note se retire sans verifier son texte', (s) => s.replace('  if (!t.endsWith(n)) return;', '  if (false) return;')],
  ['D1 la note ecrase l etat deja affiche', (s) => s.replace("  e.textContent = base ? base + ' ' + texte : texte;", '  e.textContent = texte;')],
  ['D2 changer d actif garde l etape preparee', (s) => s.replace('if (parLaPersonne && String(d ? d.devise : sel.value).toLowerCase() !== avant) {', 'if (false) {')],
  ['D2 une remise du choix retire l etape preparee', (s) => s.replace('if (parLaPersonne && String(d ? d.devise : sel.value).toLowerCase() !== avant) {', 'if (String(d ? d.devise : sel.value).toLowerCase() !== avant) {')],
  ['D2 changer le montant garde l etape preparee', (s) => s.replace("if (typeof intentionChangee === 'function') intentionChangee('the amount changed');", 'void 0;')],
  ['M11 l attente n ecrit plus l etiquette', (s) => s.replace("    if (lab && lab.firstChild && lab.firstChild.nodeType === 3) lab.firstChild.textContent = 'Buy — ' + c.sym + ' to spend';\n    return 'ATTEND';", "    return 'ATTEND';").replace("    if (lab && lab.firstChild && lab.firstChild.nodeType === 3) lab.firstChild.textContent = 'Buy — ' + c.sym + ' to spend';\r\n    return 'ATTEND';", "    return 'ATTEND';")],
  ['M12 l attente n est jamais levee', (s) => s.replace('    c.attente = false;\n', '').replace('    c.attente = false;\r\n', '')],
  /* ── R : les puces ── */
  ['R etiquette des puces en dur ETH', (s) => s.replace("btn.textContent = btn.getAttribute('data-premier') + ' ' + actif;", "btn.textContent = btn.getAttribute('data-premier') + ' ETH';")],
  ['R puces jamais cachees', (s) => s.replace('btn.hidden = actif !== sym;', 'btn.hidden = false;')],
  ['R le clic d une puce sans garde d actif', (s) => s.replace("if (b.getAttribute('data-actif') !== symboleDuChampBuy()) {", 'if (false) {')],
  ['R les puces ne suivent pas le choix', (s) => s.replace('      try { majPucesPremier(); } catch (_) {}\n', '').replace('      try { majPucesPremier(); } catch (_) {}\r\n', '')],
  /* ── Q : la verification au clic ── */
  /* (la garde du CONTENEUR #peActions double celle du bouton : la retirer seule est un mutant equivalent ; on retire celle du BOUTON) */
  ['Q le bouton ne porte pas sa propre garde', (s) => s.replace("  try { bt.addEventListener('click', gardeClicEtape, true); } catch (_) { /* element factice */ }", '')],
  ['Q la garde au clic laisse tout passer', (s) => s.replace('  if (p && intentionVivante(p)) return true;', '  return true;')],
  ['Q le bouton ne porte pas son intention', (s) => s.replace('  if (bt.dataset) bt.dataset.intention = JSON.stringify(i);', '')],
  /* ── S : l intention ── */
  ['S ajouterEtape pose meme pour une intention morte', (s) => s.replace('  if (!intentionVivante(i)) return bt; /* une preparation perimee ne pose rien */', '')],
  ['S pas de controle apres les sauts (D3)', (s) => s.replace('    if (!intentionVivante(intention)) { profilEnLecture = false; return; }', '')],
  ['S les controles de rendu de preparerEchange retires (D3)', (s) => s.split("if ($('#profil').dataset.block !== adr || !intentionVivante(intention)) return;").join("if ($('#profil').dataset.block !== adr) return;").replace('    if (!intentionVivante(intention)) { profilEnLecture = false; return; }', '').replace('  if (!intentionVivante(intention)) return;\n  const m = montantHumain(', '  const m = montantHumain(').replace('  if (!intentionVivante(intention)) return;\r\n  const m = montantHumain(', '  const m = montantHumain(')],
  ['S le pivot en mode DIRECT (D4)', (s) => s.replace("void bcProposerSwap('Buy panel',", "void bcProposerSwap('You',")],
  ['S pas de controle apres le solde du pivot (D4)', (s) => s.replace("  if (intention && !intentionVivante(intention)) return 'PERIME';", '')],
  ['S la demande de montant ecrase (D1b)', (s) => s.replace("e.textContent = (base ? base + ' ' : '') + PHRASE_MONTANT_NUL;", 'e.textContent = PHRASE_MONTANT_NUL;')],
  ['S #peUsdcEth sans ecouteur (D5)', (s) => s.replace("for (const id of ['#peAchat', '#peVente', '#peUsdcEth'])", "for (const id of ['#peAchat', '#peVente'])")],
  ['S m03 la reception sort de la cle', (s) => s.replace("    recoit: sens === 'VENTE' ? String((rec && rec.value) || '').toLowerCase() : null,", '    recoit: null,')],
  ['S m06 l etape retiree ecrase', (s) => s.replace("e.textContent = (base ? base + ' ' : '') + 'The step prepared before was removed because '", "e.textContent = 'The step prepared before was removed because '")],
  ['S m08 la puce refusee ecrase', (s) => s.replace("e.textContent = (base ? base + ' ' : '') + t; }", 'e.textContent = t; }')],
  ['S la phrase de preparation reste avec l etape retiree', (s) => s.replace("  if (e && !etatParSignature) { e.textContent = ''; e.className = 'note'; if (e.dataset) delete e.dataset.notePayWith; }", '')],
  ['S la phrase « Paying with EURC » n est pas marquee', (s) => s.replace('  if (e.dataset) e.dataset.texteEtape = e.textContent;', '')],
  /* (« un changement d actif ne fait pas avancer le compteur » est EQUIVALENT ici : la cle compare l actif, et un aller-retour
   *   A -> B -> A vide le montant tape (P1), donc la cle differe quand meme ; et la frappe suivante fait avancer le compteur) */
  ['S une frappe ne fait pas avancer l intention', (s) => s.replace('function avancerIntention() { genAchat += 1; return genAchat; }', 'function avancerIntention() { return genAchat; }')],
  ['Q MAX ecrit sans evenement', (s) => s.replace("const ecrireMontantMax = (champ, valeur) => { champ.value = valeur; champ.dispatchEvent(new Event('input', { bubbles: true })); };", 'const ecrireMontantMax = (champ, valeur) => { champ.value = valeur; };')],
  ['Q MAX ecrit sous une autre devise', (s) => s.replace('  if (deviseDuChampBuy() !== attendu) {', '  if (false) {')],
  ['P4 une liste NON LUE fait oublier le choix', (s) => s.replace('if (ici === c.block && !listePayWithLue) {', 'if (false) {')],
  ['P4 Prepare buy part pendant l attente', (s) => s.replace('if (sens === \'ACHAT\' && choixPayWith && choixPayWith.attente === true', 'if (false && choixPayWith && choixPayWith.attente === true')],
  ['les soldes relus a chaque repeint', (s) => s.replace('if (soldesPivotsDemandes.has(k)) continue;', '')],
  ['cbBTC reste dit « not offered »', (s) => s.replace('r.devises.filter((d) => !pivots.some((x) => x.devise === d.devise))', 'r.devises')],
];
for (const [nom, muter] of mutants) {
  if (process.env.SEUL_MUTANT && !nom.includes(process.env.SEUL_MUTANT)) continue;
  const m = muter(APP);
  vu(m !== APP, 'mutant « ' + nom + ' » applique');
  const k = await verifier(m);
  vu(k.length > 0, 'mutant « ' + nom + ' » TUE (' + k.map((x) => x.split(' ')[0]).join(',') + ')');
}
console.log(n + ' ok / 0 KO');
/* un mutant « relus a chaque repeint » laisse une boucle de lectures (bornee, mais vivante) : on sort explicitement */
process.exit(0);
