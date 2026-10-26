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
import { USDC_BASE } from './frais-creation.js';

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
  'pivotsPourPayWith', 'lireSoldesPivots', 'payerParRailServeur', 'garderChoixPayWith', 'preparerEchange'];
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
  constructor(id) { this.id = id; this.hidden = false; this._value = ''; this.textContent = ''; this.title = ''; this.className = ''; this.dataset = {}; this.onchange = null; this.label = null; }
  get value() { return this._value; }
  set value(v) { this._value = String(v); }
  closest() { return this.label; }
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
  for (const id of ['profil', 'peAchat', 'peDeviseBloc', 'peDeviseNote', 'peRetourFiat', 'peEtat', 'peActions', 'peLignes', 'peVente']) els['#' + id] = new El(id);
  els['#peDevise'] = new Sel('peDevise');
  els['#peAchat'].label = { firstChild: { nodeType: 3, textContent: 'Buy — ETH to spend' } };
  els['#peRetourFiat'].hidden = true;
  els['#profil'].dataset.block = BLOC;
  const etat = { balanceOf: [], panneau: [], ouvert: 0, repeints: 0, historique: [], multi: [], sansUsdc: false, surPret: null, decimales: [] };
  const v = quote === ETH ? { etat: 'LUE', paire: 'ETH', cle: { hooks: '0x' + '1'.repeat(40) } } : { etat: 'LUE', paire: 'DEVISE', deviseAdr: quote, cle: { hooks: '0x' + '1'.repeat(40) } };
  const ctx = {
    console, JSON, String, Number, BigInt, Array, Set, Map, Object, Promise, Math, RegExp, Error, Date,
    $: (s) => els[s] || null,
    document: { createElement: () => ({ value: '', textContent: '', dataset: {}, disabled: false, title: '' }), activeElement: null },
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
    marcheProfil: null, etatVieProfil: 'LUE', profilEnLecture: false, echangeCourant: null, PHRASE_MONTANT_NUL: 'zero',
    montantNulOuVide: (t) => !String(t || '').trim() || Number(t) === 0, echangeAutorise: () => true, fraisEstDynamique: () => false,
    direPrealable: () => {}, texteRefusConnexion: (t) => t, texteRefusEchange: () => 'refused',
    pret: async () => { if (etat.surPret) etat.surPret(); return true; },
    decimalesDe: async (a) => { etat.decimales.push(String(a).toLowerCase()); return [EURC, USDC, OUSD].includes(String(a).toLowerCase()) ? 6 : String(a).toLowerCase() === CBBTC ? 8 : 18; },
    clesReellesDe: async () => [], prixUsdDeviseLus: new Map(), LIQ_MIN_BUY_USD: 1000, FEE_WALLET: '0x' + 'a'.repeat(40), RESEAUX: {},
    planEchange: async (x) => { etat.historique.push(x); throw new Error('historique arrete par le banc'); },
    sautsDepuisChemin: async (x) => { etat.multi.push(x); return { etat: 'REFUSE', pourquoi: 'arrete par le banc' }; },
    rpc: async (methode, [call]) => {
      if (methode !== 'eth_call' || !String(call.data).startsWith('0x70a08231')) throw new Error('unexpected ' + methode);
      etat.balanceOf.push(String(call.to).toLowerCase());
      /* une macro-tache par lecture, et une borne : une boucle repeint -> relecture (le mutant « relus a chaque repeint ») ne doit ni
       *   affamer les minuteries du banc ni tourner pour toujours — au-dela de 60 lectures, la chaine factice ne repond plus */
      await new Promise((r) => setTimeout(r, 0));
      if (etat.balanceOf.length > 60) throw new Error('la chaine factice ne repond plus (borne du banc)');
      if (soldeIllisible) throw new Error('429');
      const s = soldes[String(call.to).toLowerCase()];
      return '0x' + BigInt(s || 0).toString(16);
    },
    bcOuvrirPop: () => { etat.ouvert += 1; },
    bcProposerSwap: async (qui, classe, arg) => { etat.panneau.push(arg); },
  };
  vm.createContext(ctx);
  const presentes = FONCTIONS.filter((f) => extraire(src, f));
  vm.runInContext(presentes.map((f) => extraire(src, f)).join('\n') + '\nthis.__ = { ' + presentes.join(', ') + ' };', ctx);
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
    /* le defaut de prod, rejoue A LA MAIN pendant l await de pret : la variable vivante remise a la devise de la pool */
    m.etat.surPret = () => { m.ctx.deviseDentree = null; m.els['#peDevise'].value = ETH; };
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
  });
  await cas('L2 preparerEchange EXECUTE : USDC (route multi-sauts) garde SA route meme si un reset arrive pendant pret', async () => {
    const m = monde(src, { compte: WALLET });
    m.rebatir();
    m.els['#peDevise'].choisir(USDC);
    m.els['#peAchat'].value = '25';
    await attendre(); await attendre();
    m.etat.surPret = () => { m.ctx.deviseDentree = null; };
    try { await m.f.preparerEchange('ACHAT'); } catch (_) {}
    assert.deepEqual(m.etat.historique, [], 'le chemin historique (ETH) a ete pris pour un choix USDC');
    assert.equal(m.etat.multi.length, 1, 'le multi-sauts USDC n a pas ete construit');
    assert.equal(m.etat.multi[0].montant, 25000000n, 'montant en decimales USDC : ' + m.etat.multi[0].montant);
  });
  return ko;
}

let n = 0;
const vu = (c, msg) => { assert.ok(c, msg); n += 1; console.log('ok  ' + msg); };
const ko = await verifier(APP);
for (const k of ko) console.log('KO  ' + k);
if (ko.length) { console.log('ROUGE sur app.html : ' + ko.length + ' regles'); process.exit(1); }
vu(true, 'app.html : toutes les regles (A-L) passent');

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
  ['le montant tape reste sous un choix perdu', (s) => s.replace("  champ.value = '';\n  const e = $('#peEtat');", "  const e = $('#peEtat');").replace("  champ.value = '';\r\n  const e = $('#peEtat');", "  const e = $('#peEtat');")],
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
