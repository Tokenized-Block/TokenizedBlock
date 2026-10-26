/* test-banque-un-par-action-20261025.mjs - UNE CARTE PAR ACTION DANS LA BANK ; PLUSIEURS MARCHES = DES OPTIONS NOMMEES.
 * Rapport de Phil (2026-10-25) : la liste Borrow/Lend montre GOOGLc DEUX fois (« up to 43.8 %, liquidation 62.5 %, costs 0.59 %, earns
 *   < 0.01 % » et « up to 53.9 %, liquidation 77 %, costs 5.51 %, earns 4.89 % ») - « which one to believe? ». Les deux sont vrais : deux
 *   marches Morpho Blue distincts pour la meme garantie (0x0cc78b1f… LLTV 62,5 %, utilisation ~0 ; 0xa3913d89… LLTV 77 %, 88,91 %).
 * DECISION : une carte par action ; plusieurs marches = des options nommees depuis la LLTV (« Safer — liquidation at 62.5 % »,
 *   « Riskier — liquidation at 77 % », jamais tapees par action), chacune avec borrow up to, liquidation, cout, gain, et l USDC
 *   disponible a emprunter (supply - borrow) ; une ligne dit la plus profonde ; Borrow / Lend agissent sur l option choisie (par defaut
 *   la plus profonde ouverte) ; les appels d argent d un marche donne sont inchanges ; une action a un seul marche reste comme avant.
 * SOURCE : fixture-morpho-marches-20261025.json = la reponse ENREGISTREE de blue-api.morpho.org le 2026-10-25 (lecture seule, la requete
 *   de l app + supplyAssets / borrowAssets bruts). Elle passe par le VRAI lireMarchesMorpho (banque-morpho.js, fetch remplace).
 * AFFIRME (EXECUTE bcBanqueGrouper, bcBanqueDispoDit, bcBanqueProfondDit, bcBanqueListes, bcBanqueChiffres, bcPct, bcBanqueGainDit et
 *   bcBanqueCharger d app.html sur un DOM minimal ; TB_APP = autre copie) :
 *   (1) sonde du champ : liquidityAssets == supplyAssets - borrowAssets pour les 19 marches enregistres ;
 *   (2) une carte par garantie listee, aucune action deux fois ; GOOGLc = UNE carte a deux options, nommees depuis la LLTV, rangees ;
 *   (3) chaque chiffre affiche = l API (cout, gain, LLTV, plafond, disponible = supply - borrow arrondi bas a 2 decimales) ;
 *   (4) les noms sortent de la LLTV LUE (3 niveaux -> Safer / Middle / Riskier ; 77 % / 86 % -> 77 % est « Safer » ; egalite numerotee ;
 *       l ordre d arrivee ne change rien ; aucun nom ne contient de symbole) ;
 *   (5) defaut = la plus profonde OUVERTE (GOOGLc : 62,5 %, 5 855,75 USDC) ; un jeu ou la plus risquee est la plus profonde la choisit ;
 *       une option vide ne passe pas devant une option basse ouverte ; rien de lu = la premiere ;
 *   (6) Borrow / Lend de la carte rendent a bcBanqueChoisir l OBJET marche choisi (le meme qu avant, par identite), avant et apres un
 *       changement d option ; une action a un marche n a ni options ni ligne « Most… » ; le choix est garde a la repeinture ;
 *   (7) les fonctions qui construisent les appels d argent (bcBanqueChoisir, bcBanqueProposer, bcBanqueProposerPanier, bcPanierPeindre,
 *       bcPanierMaj) ont EXACTEMENT le texte de d07afc5 (sha256, fins de ligne normalisees).
 * NE PROUVE PAS : le rendu navigateur reel (DOM minimal ici) ; que l API soit juste demain ; un vrai wallet (aucun plan, aucune signature).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { lireMarchesMorpho } from './banque-morpho.js';

const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const brut = JSON.parse(readFileSync(new URL('./fixture-morpho-marches-20261025.json', import.meta.url), 'utf8'));
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => {
  const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete);
  const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length);
};
const instruction = (debut, fin) => { const i = html.indexOf(debut); assert.ok(i > 0, 'introuvable : ' + debut); const j = html.indexOf(fin, i); assert.ok(j > i, 'fin introuvable : ' + fin); return html.slice(i, j); };
const bloc = (debut) => { const i = html.indexOf(debut); assert.ok(i > 0, 'introuvable : ' + debut); const f = /\r?\n\};/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length); };
const sans = (s) => String(s).replace(/\s/g, ' ');
const GOOGL_SUR = '0x0cc78b1f4993015116e90626a18a1ba0e1ca73d0b75781b231d02fa5536e62a5';
const GOOGL_RISQUE = '0xa3913d896b7e9c0e0a84f1be27d376cf2065616101cb7c44674af8a154e684cc';

/* ── (1) la sonde du champ : « disponible » = supply - borrow, dans la reponse meme ─────────────────────────────────────────────── */
const items = brut.data.markets.items;
vu(items.length === 19, 'la fixture n a pas les 19 marches enregistres : ' + items.length);
for (const m of items) vu(BigInt(m.state.liquidityAssets) === BigInt(m.state.supplyAssets) - BigInt(m.state.borrowAssets), m.marketId.slice(0, 10) + ' : liquidityAssets != supply - borrow');

/* ── les marches, par le VRAI lecteur de l app ──────────────────────────────────────────────────────────────────────────────── */
const lu = await lireMarchesMorpho({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => brut }) });
vu(lu.ok === true && Array.isArray(lu.marches) && lu.marches.length === 19, 'lireMarchesMorpho ne lit pas la fixture');

/* ── les fonctions d app.html ───────────────────────────────────────────────────────────────────────────────────────────────── */
const bcPct = new Function(instruction('const bcPct = ', '/* insecable') + '\nreturn bcPct;')();
const bcBas2 = new Function(instruction('const bcBas2 = ', '/** Les soldes du wallet') + '\nreturn bcBas2;')();
const bcBanqueChiffres = new Function(fonction('function bcBanqueChiffres(mk) {') + '\nreturn bcBanqueChiffres;')();
const bcBanqueGainDit = new Function('bcPct', fonction('function bcBanqueGainDit(mk) {') + '\nreturn bcBanqueGainDit;')(bcPct);
const bcBanqueGrouper = new Function('bcBanqueChiffres', fonction('function bcBanqueGrouper(listes) {') + '\nreturn bcBanqueGrouper;')(bcBanqueChiffres);
const bcBanqueDispoDit = new Function('bcBas2', fonction('function bcBanqueDispoDit(mk) {') + '\nreturn bcBanqueDispoDit;')(bcBas2);
const bcBanqueProfondDit = new Function('bcBanqueDispoDit', fonction('function bcBanqueProfondDit(g) {') + '\nreturn bcBanqueProfondDit;')(bcBanqueDispoDit);
const bcBanque = { marches: lu.marches, lu: Date.now() };
const bcBanqueListes = new Function('bcBanque', fonction('function bcBanqueListes() {') + '\nreturn bcBanqueListes;')(bcBanque);
/* 2026-10-26 : la carte peint aussi la ligne des frais (bcBanqueFraisDit, test-banque-frais-pret-20261026) */
const bcBanqueFraisDit = new Function('bcBanque', fonction('function bcBanqueFraisDit(mk) {') + '\nreturn bcBanqueFraisDit;')(bcBanque);

const { listes, ecartes } = bcBanqueListes();
vu(listes.length === 9 && ecartes === 10, 'listes / ecartes : ' + listes.length + ' / ' + ecartes);
const groupes = bcBanqueGrouper(listes);
const symListes = [...new Set(listes.map((mk) => mk.garantie.symbole))];

/* ── (2) une carte par garantie ─────────────────────────────────────────────────────────────────────────────────────────────── */
vu(groupes.length === symListes.length && groupes.length === 8, 'groupes : ' + groupes.length + ' pour ' + symListes.length + ' actions');
vu(new Set(groupes.map((g) => g.symbole)).size === groupes.length, 'une action a deux groupes');
vu(groupes.reduce((s, g) => s + g.options.length, 0) === listes.length, 'un marche liste perdu ou double dans les options');
const gG = groupes.find((g) => g.symbole === 'GOOGLc');
vu(!!gG && gG.options.length === 2, 'GOOGLc n a pas deux options');
vu(gG.options[0].mk.id === GOOGL_SUR && gG.options[1].mk.id === GOOGL_RISQUE, 'GOOGLc : options mal rangees par LLTV');
vu(sans(gG.options[0].nom) === 'Safer — liquidation at 62.5 %' && sans(gG.options[1].nom) === 'Riskier — liquidation at 77 %', 'noms GOOGLc : ' + gG.options.map((o) => o.nom).join(' | '));
for (const g of groupes.filter((x) => x.symbole !== 'GOOGLc')) {
  vu(g.options.length === 1 && g.options[0].nom === '' && bcBanqueProfondDit(g) === '', g.symbole + ' : une action a un marche a des options ou une ligne « Most »');
}

/* ── (3) les chiffres affiches = l API ──────────────────────────────────────────────────────────────────────────────────────── */
const deux = (b, dec) => { const c = b / 10n ** BigInt(dec - 2); return (c / 100n).toLocaleString('en-US') + '.' + String(c % 100n).padStart(2, '0'); };
for (const o of gG.options) {
  const m = items.find((x) => x.marketId === o.mk.id), c = bcBanqueChiffres(o.mk);
  vu(sans(bcPct(o.mk.apyEmprunt)) === sans(bcPct(m.state.borrowApy)) && sans(bcPct(o.mk.apyPret)) === sans(bcPct(m.state.supplyApy)), o.nom + ' : taux != API');
  vu(c.liqPct === Number(m.lltv) / 1e16 && Math.abs(c.maxPct - c.liqPct * 0.7) < 1e-9, o.nom + ' : LLTV / plafond != API');
  const attendu = deux(BigInt(m.state.supplyAssets) - BigInt(m.state.borrowAssets), m.loanAsset.decimals) + ' USDC';
  vu(sans(bcBanqueDispoDit(o.mk)) === attendu, o.nom + ' : disponible ' + bcBanqueDispoDit(o.mk) + ' au lieu de ' + attendu);
}
vu(sans(bcBanqueDispoDit(gG.options[0].mk)) === '5,855.75 USDC' && sans(bcBanqueDispoDit(gG.options[1].mk)) === '649.55 USDC', 'disponibles GOOGLc');
vu(sans(bcPct(gG.options[0].mk.apyEmprunt)) === '0.60 %' && sans(bcPct(gG.options[0].mk.apyPret)) === '< 0.01 %' && sans(bcPct(gG.options[1].mk.apyEmprunt)) === '5.51 %' && sans(bcPct(gG.options[1].mk.apyPret)) === '4.89 %', 'taux GOOGLc');
vu(/no one borrows|almost nothing/.test(bcBanqueGainDit(gG.options[0].mk)) && bcBanqueGainDit(gG.options[1].mk) === '', 'la raison du « < 0.01 % » ne suit pas l option');
for (const x of [null, undefined, '', 'abc', 12.5]) vu(bcBanqueDispoDit({ disponibleBrut: x, pret: { symbole: 'USDC', decimales: 6 } }) === 'not read', 'disponible non lu ecrit un chiffre : ' + String(x));
vu(sans(bcBanqueProfondDit(gG)) === 'Most USDC to borrow: Safer — liquidation at 62.5 % — 5,855.75 USDC available right now.', 'ligne profonde : ' + bcBanqueProfondDit(gG));

/* ── (4) les noms sortent de la LLTV lue ─────────────────────────────────────────────────────────────────────────────────────── */
const fx = (id, lltv, usd, sym = 'ZZZc') => ({ id, lltv, disponibleUsd: usd, disponibleBrut: usd === null ? null : String(Math.round(usd * 1e6)), margeBps: 7000,
  garantie: { adr: '0x' + sym.length.toString(16).padStart(40, '0'), symbole: sym }, pret: { symbole: 'USDC', decimales: 6 } });
const trois = bcBanqueGrouper([fx('0xb', '860000000000000000', 50), fx('0xa', '625000000000000000', 20), fx('0xc', '770000000000000000', 30)])[0];
vu(trois.options.map((o) => sans(o.nom)).join(' | ') === 'Safer — liquidation at 62.5 % | Middle — liquidation at 77 % | Riskier — liquidation at 86 %', '3 niveaux : ' + trois.options.map((o) => o.nom).join(' | '));
const haut = bcBanqueGrouper([fx('0xd', '860000000000000000', 5, 'GOOGLc'), fx('0xe', '770000000000000000', 5, 'GOOGLc')])[0];
vu(sans(haut.options[0].nom) === 'Safer — liquidation at 77 %' && sans(haut.options[1].nom) === 'Riskier — liquidation at 86 %', '77/86 : ' + haut.options.map((o) => o.nom).join(' | '));
const egal = bcBanqueGrouper([fx('0xf', '625000000000000000', 5), fx('0x1', '625000000000000000', 9), fx('0x2', '770000000000000000', 1)])[0];
vu(egal.options.map((o) => sans(o.nom)).join(' | ') === 'Safer — liquidation at 62.5 % (1) | Safer — liquidation at 62.5 % (2) | Riskier — liquidation at 77 %', 'egalite : ' + egal.options.map((o) => o.nom).join(' | '));
vu(new Set(egal.options.map((o) => o.nom)).size === 3, 'deux options du meme nom');
const aRebours = bcBanqueGrouper([...listes].reverse()).find((g) => g.symbole === 'GOOGLc');
vu(aRebours.options.map((o) => o.nom).join('|') === gG.options.map((o) => o.nom).join('|') && aRebours.defaut === gG.defaut, 'l ordre d arrivee change les noms ou le defaut');
for (const g of [...groupes, trois, haut, egal]) for (const o of g.options) vu(!o.nom.includes(g.symbole), 'un nom porte le symbole : ' + o.nom);

/* ── (5) le defaut : la plus profonde ouverte ───────────────────────────────────────────────────────────────────────────────── */
vu(gG.defaut.id === GOOGL_SUR && gG.plusProfond.id === GOOGL_SUR, 'GOOGLc : defaut ' + gG.defaut.id.slice(0, 10));
for (const g of groupes) vu(g.defaut === g.options[0].mk || g.options.length > 1, g.symbole + ' : defaut hors de sa seule option');
const risqueProfond = bcBanqueGrouper([fx('0x10', '625000000000000000', 0.02), fx('0x11', '770000000000000000', 573)])[0];
vu(risqueProfond.defaut.id === '0x11' && /Riskier/.test(bcBanqueProfondDit(risqueProfond)), 'la plus risquee et la plus profonde n est pas le defaut');
const videVsBas = bcBanqueGrouper([fx('0x12', '625000000000000000', 5), fx('0x13', '770000000000000000', 0.5)])[0];
vu(videVsBas.defaut.id === '0x12', 'une option vide passe devant une option basse ouverte');
const nonLu = bcBanqueGrouper([fx('0x14', '625000000000000000', null), fx('0x15', '770000000000000000', null)])[0];
vu(nonLu.defaut.id === '0x14' && /not read/.test(bcBanqueProfondDit(nonLu)) && !/\d/.test(bcBanqueProfondDit(nonLu)), 'rien de lu : defaut ou ligne');
const vides = bcBanqueGrouper([fx('0x16', '625000000000000000', 0.2), fx('0x17', '770000000000000000', 0.4)])[0];
vu(/None of these 2 markets can lend right now/.test(bcBanqueProfondDit(vides)), 'deux marches vides : ' + bcBanqueProfondDit(vides));

/* ── (6) la carte, EXECUTEE (bcBanqueCharger sur un DOM minimal) ────────────────────────────────────────────────────────────── */
class El {
  constructor(tag) { this.tag = tag; this.kids = []; this.attrs = {}; this.className = ''; this.txt = ''; this.dataset = {}; this.ecoute = {}; this.hidden = false; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  append(...cs) { for (const c of cs) this.kids.push(c); }
  set textContent(v) { this.kids = []; this.txt = String(v); }
  get textContent() { return this.txt + this.kids.map((c) => c.textContent).join(''); }
  addEventListener(t, f) { (this.ecoute[t] ||= []).push(f); }
  click() { for (const f of this.ecoute.click || []) f(); }
  tous(pred, acc = []) { for (const c of this.kids) { if (pred(c)) acc.push(c); c.tous(pred, acc); } return acc; }
}
const charger = fonction('async function bcBanqueCharger(force = false) {');
const bcOrdreChoix = new Function(fonction('function bcOrdreChoix(infos, intention) {') + '\nreturn bcOrdreChoix;')();
const peindreListe = async ({ p = null, etat = bcBanque } = {}) => {
  const ul = new El('ul'), choisis = [];
  const document = { createElement: (t) => new El(t), querySelectorAll: () => [] };
  const bcEl = new Function('document', bloc('const bcEl = ') + '\nreturn bcEl;')(document);
  const deps = {
    document, bcEl, $: (s) => (s === '#bcBanqueMarches' ? ul : null), compte: p ? '0x' + '1'.repeat(40) : null, brainAdr: null, bcBanque: etat,
    bcBanqueLireMarches: async () => ({ ok: true }), bcBanqueDonneesPourToi: async () => p, bcBanqueListes, bcBanquePeindreResume: () => {},
    bcPourToiDe: (mk, q) => (q ? { emprunt: 10n ** 6n, rien: false, garantie: 10n ** 8n, pret: 0n } : null), bcBanqueChiffres, bcPct, bcBanqueGainDit, bcBanqueFraisDit,
    bcBanqueGrouper, bcBanqueDispoDit, bcBanqueProfondDit, bcOrdreChoix, bcVisage: () => new El('span'), bcPanierPeindre: () => {}, bcBanquePositions: () => {},
    bcBanquePourToi: () => {}, bcBanqueChoisir: (mk, sens) => choisis.push({ mk, sens }), choisirBrain: () => {}, bcRepeindre: () => {}, bcVue: () => {},
  };
  const f = new Function(...Object.keys(deps), charger + '\nreturn bcBanqueCharger;')(...Object.values(deps));
  await f(true);
  return { ul, choisis };
};
const cartesDe = (ul) => ul.tous((e) => e.tag === 'li' && /^bcMarche\b/.test(e.className));
const boutonDe = (li, txt) => li.tous((e) => e.tag === 'button' && e.textContent === txt && !e.attrs.role)[0];
const optionsDe = (li) => li.tous((e) => e.tag === 'button' && e.attrs.role === 'radio');
{
  bcBanque.optionDe = {};
  const { ul, choisis } = await peindreListe();
  const cartes = cartesDe(ul);
  vu(cartes.length === 8, 'cartes peintes : ' + cartes.length + ' (une par action attendue : 8)');
  vu(new Set(cartes.map((li) => li.dataset.garantie)).size === cartes.length, 'deux cartes pour la meme garantie');
  const cG = cartes.filter((li) => /^GOOGLc→/.test(sans(li.kids[0].textContent).replace(/ /g, '')));
  vu(cG.length === 1, 'GOOGLc peint ' + cG.length + ' fois');
  const li = cG[0], opts = optionsDe(li);
  vu(opts.length === 2 && /Safer — liquidation at 62\.5 %/.test(sans(opts[0].textContent)) && /Riskier — liquidation at 77 %/.test(sans(opts[1].textContent)), 'options GOOGLc peintes');
  vu(/5,855\.75 USDC/.test(sans(opts[0].textContent)) && /649\.55 USDC/.test(sans(opts[1].textContent)) && /Available to borrow/.test(opts[0].textContent), 'le disponible n est pas peint sur chaque option');
  vu(/Most USDC to borrow: Safer/.test(sans(li.textContent)), 'la ligne de la plus profonde manque');
  vu(opts[0].attrs['aria-checked'] === 'true' && opts[1].attrs['aria-checked'] === 'false' && li.dataset.marche === GOOGL_SUR, 'defaut peint : ' + li.dataset.marche);
  vu(li.tous((e) => e.attrs['data-pourtoi'] === GOOGL_SUR).length === 1, '« pour toi » ne suit pas l option choisie');
  boutonDe(li, 'Borrow').click(); boutonDe(li, 'Lend').click();
  const mkSur = bcBanque.marches.find((m) => m.id === GOOGL_SUR), mkRisque = bcBanque.marches.find((m) => m.id === GOOGL_RISQUE);
  vu(choisis.length === 2 && choisis[0].mk === mkSur && choisis[0].sens === 'emprunter' && choisis[1].mk === mkSur && choisis[1].sens === 'preter', 'Borrow / Lend n agissent pas sur l option par defaut');
  opts[1].click();
  const opts2 = optionsDe(li);
  vu(li.dataset.marche === GOOGL_RISQUE && opts2[1].attrs['aria-checked'] === 'true' && opts2[0].attrs['aria-checked'] === 'false', 'changer d option ne repeint pas la carte');
  vu(li.tous((e) => e.attrs['data-pourtoi'] === GOOGL_RISQUE).length === 1 && /If the loan reaches 77 %/.test(sans(li.textContent)), 'la carte ne suit pas l option choisie');
  boutonDe(li, 'Borrow').click(); boutonDe(li, 'Lend').click();
  vu(choisis.length === 4 && choisis[2].mk === mkRisque && choisis[2].sens === 'emprunter' && choisis[3].mk === mkRisque && choisis[3].sens === 'preter', 'Borrow / Lend n agissent pas sur l option choisie');
  vu(bcBanque.optionDe[li.dataset.garantie] === GOOGL_RISQUE, 'le choix n est pas garde');
  /* chaque action a un seul marche : pas d options, et ses boutons rendent SON marche */
  for (const c of cartes.filter((x) => x !== li)) {
    vu(optionsDe(c).length === 0 && !/Most USDC/.test(c.textContent) && /Costs a year/.test(c.textContent), 'une action a un marche n a plus sa carte d avant');
    const avant = choisis.length; boutonDe(c, 'Borrow').click();
    vu(choisis.length === avant + 1 && choisis[avant].mk.id === c.dataset.marche && choisis[avant].mk === bcBanque.marches.find((m) => m.id === c.dataset.marche), 'un bouton rend un autre marche');
  }
  /* la repeinture garde le choix */
  const { ul: ul2 } = await peindreListe();
  const li2 = cartesDe(ul2).find((x) => x.dataset.garantie === li.dataset.garantie);
  vu(li2.dataset.marche === GOOGL_RISQUE, 'la repeinture oublie l option choisie');
}
{
  /* une position sur l option non choisie se voit, sans changer le defaut */
  bcBanque.optionDe = {};
  const p = { av: {}, pos: { ok: true, positions: [{ id: GOOGL_RISQUE, garantieBrute: '0', detteBrute: '0' }] } };
  const { ul } = await peindreListe({ p });
  const li = cartesDe(ul).find((x) => optionsDe(x).length === 2);
  const opts = optionsDe(li);
  vu(/Your position/.test(opts[1].textContent) && !/Your position/.test(opts[0].textContent) && li.dataset.marche === GOOGL_SUR, 'la position sur l autre option ne se voit pas, ou change le defaut');
}

/* ── (7) les appels d argent : le texte de d07afc5 ──────────────────────────────────────────────────────────────────────────── */
const EMPREINTES = {
  /* 2026-10-26 (frais du Lend, decision de Phil) : les DEUX empreintes changent, a dessein - le choix dit le frais du Lend, la carte du
   *   plan dit le frais Morpho relu, le frais du Lend et « No TokenizedBlock fee » en sortie (test-banque-frais-pret-20261026) */
  'function bcBanqueChoisir(mk, sens) {': 'd5b0666cd7da72b97584ba84ff177ac8864f59bec087aeb7c48592cbcd0f0941',
  'async function bcBanqueProposer({': '4f34d6bcaf33bfd0a4ac6f9ef98cdb1dde9d9d85cc5c8abcf8714ba527f58ca4',
  'async function bcBanqueProposerPanier(lignes) {': '0f8f267ca19a79ea5aeff40410e74a07c03af1ae1f0004fabbd6dd226dc53ead',
  'function bcPanierPeindre(listes) {': '4d7736982e07ae3bad0c0d4e8f0e52d384b2f85a41fff7be004d95b5f8862c60',
  'function bcPanierMaj() {': '2d4b6fe734fcf9e99f20b17c7db1ceaf973d7874b7c239201e5d2549724dc5c0',
};
for (const [e, h] of Object.entries(EMPREINTES)) vu(createHash('sha256').update(fonction(e).replace(/\r\n/g, '\n')).digest('hex') === h, e + ' : le texte a change depuis d07afc5');

console.log('test-banque-un-par-action : ' + n + '/' + n + ' verts ; NE PROUVE PAS le rendu navigateur ni un vrai wallet');
