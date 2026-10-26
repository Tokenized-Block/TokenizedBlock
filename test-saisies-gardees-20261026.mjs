/* test-saisies-gardees-20261026.mjs — UN REPEINT NE VIDE JAMAIS CE QUE LA PERSONNE TAPE.
 *
 * QA game56 : « la page se repeint pendant la frappe et vide le champ ». Mesure au navigateur (prod 20261026-game56, headless, panneau
 *   ouvert, vue Skin, « + ») : le marche des skins (#bcMarche, avec le champ de prix « Sell at a price ») etait peint DANS LA VUE MARKET,
 *   dans la boite des tuiles du block (le div statique #bcMarche, premier dans la page) ; la boutique gardait un #bcMarche vide. Le repeint
 *   du panneau (bcRepeindre, toutes les 3 s) vide cette boite des que le prix, la liquidite ou l etat d une tuile change : le prix tape
 *   disparaissait avec tout le marche des skins. Deux elements portaient le meme id.
 * CE BANC (copie LF et copie CRLF normalisee, extraction VERIFIEE — une fonction absente fait echouer, jamais passer) :
 *   U. aucun id pose par le script (bcEl(..., { id: '...' })) n existe deja dans le HTML statique ;
 *   V. le VRAI bcPeindreMarche peint le marche des skins dans la boite que la boutique pose, pas dans les tuiles ; le VRAI vidage des
 *      tuiles (le selecteur lu dans bcPeindre) ne touche plus le prix tape ;
 *   W. un repeint du marche des skins (bcPeindreMarche, peindreSkinsJeu) garde le prix tape, le focus et le curseur ;
 *   X. le panier de la Bank repeint comme le fait bcBanqueCharger (sa ligne LUE dans la source ; bcPanierPeindre est au texte gele)
 *      garde la case cochee et les montants tapes ; un montant pre-rempli (pas tape) prend la nouvelle valeur ;
 *   Y. la liste des missions (peindreMissions) repeinte garde le hash tape ;
 *   Z. rien n est invente : un champ qui n existe plus apres le repeint ne fait rien apparaitre, et un champ non tape reste vide.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const BRUT = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let ko = 0, n = 0;
const vu = (ok, msg) => { n++; if (ok) console.log('OK  ' + msg); else { ko++; console.log('KO  ' + msg); } };

const extraire = (src, nom) => {
  const m = new RegExp('\\n(async )?function ' + nom + '\\(').exec(src);
  if (!m) return '';
  const i = m.index + 1, f = /\n\}\n/.exec(src.slice(i));
  return f ? src.slice(i, i + f.index + 3) : '';
};
const extraireConst = (src, nom) => {
  const i = src.indexOf('\nconst ' + nom + ' = ');
  if (i < 0) return '';
  const f = src.indexOf('\n};\n', i);
  return f > i ? src.slice(i + 1, f + 4) : '';
};

/* ── un petit DOM : arbre, ordre du document, focus, curseur, evenements remontes jusqu au document ── */
function faireDom() {
  const ecouteDoc = {};
  const doc = { activeElement: null, body: null };
  class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.enfants = []; this.parent = null; this.attrs = {}; this.dataset = {}; this.ecoute = {};
      this.className = ''; this._t = ''; this.hidden = false; this.disabled = false; this.type = ''; this._valeur = ''; this.defaultValue = '';
      this.checked = false; this.defaultChecked = false; this.selectionStart = 0; this.selectionEnd = 0; this.style = {}; this.open = false; }
    get id() { return this.attrs.id || ''; }
    set id(v) { this.attrs.id = String(v); }
    get value() { return this._valeur; }
    set value(v) { this._valeur = String(v); this.selectionStart = this.selectionEnd = this._valeur.length; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'type') this.type = String(v); if (k === 'value') { this._valeur = String(v); this.defaultValue = String(v); }
      if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); }
    getAttribute(k) { if (k.startsWith('data-')) { const d = this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())]; return d === undefined ? null : d; } return k in this.attrs ? this.attrs[k] : null; }
    append(...xs) { for (const x of xs) { if (x === null || x === undefined) continue; const e = typeof x === 'string' ? texte(x) : x; if (e.parent) e.parent.retirer(e); e.parent = this; this.enfants.push(e); } }
    appendChild(x) { this.append(x); return x; }
    retirer(e) { this.enfants = this.enfants.filter((c) => c !== e); e.parent = null; if (doc.activeElement && (doc.activeElement === e || e.contient(doc.activeElement))) doc.activeElement = doc.body; }
    contient(x) { for (let p = x; p; p = p.parent) if (p === this) return true; return false; }
    contains(x) { return !!x && this.contient(x); }
    get isConnected() { let p = this; while (p.parent) p = p.parent; return p === doc.body; }
    get children() { return this.enfants.filter((e) => e.tagName !== '#TEXT'); }
    set textContent(v) { for (const e of [...this.enfants]) this.retirer(e); if (String(v)) this.append(texte(String(v))); }
    get textContent() { return this.tagName === '#TEXT' ? this._t : this.enfants.map((e) => e.textContent).join(''); }
    set innerHTML(v) {
      this.textContent = '';
      const s = String(v);
      /* assez pour les listes de l app : chaque <li ...> devient un element, et les <input ...> qu il contient en deviennent d autres */
      for (const li of s.split(/(?=<li[\s>])/)) {
        if (!li.startsWith('<li')) { if (li.replace(/<[^>]+>/g, '').trim()) this.append(texte(li.replace(/<[^>]+>/g, ''))); continue; }
        const l = new El('li'); poserAttrs(l, /^<li([^>]*)>/.exec(li)[1]);
        for (const m of li.matchAll(/<input([^>]*)>/g)) { const i = new El('input'); poserAttrs(i, m[1]); l.append(i); }
        l.append(texte(li.replace(/<[^>]+>/g, '')));
        this.append(l);
      }
    }
    replaceChildren(...xs) { this.textContent = ''; this.append(...xs); }
    remove() { if (this.parent) this.parent.retirer(this); }
    addEventListener(t, f) { (this.ecoute[t] ||= []).push(f); }
    dispatchEvent(ev) { ev.target ||= this; for (const f of this.ecoute[ev.type] || []) f(ev); if (ev.bubbles !== false) for (const f of ecouteDoc[ev.type] || []) f(ev); return true; }
    focus() { if (this.isConnected) doc.activeElement = this; }
    blur() { if (doc.activeElement === this) doc.activeElement = doc.body; }
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
    setCustomValidity() {} reportValidity() {} scrollIntoView() {}
    closest(sel) { for (let p = this; p && p !== doc.body; p = p.parent) if (correspond(p, sel)) return p; return null; }
    tous(f) { const r = []; const v = (e) => { for (const c of e.enfants) { if (f(c)) r.push(c); v(c); } }; v(this); return r; }
    querySelectorAll(sel) { return this.tous((e) => sel.split(',').some((s) => correspond(e, s.trim()))); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }
  const texte = (t) => { const e = new El('#text'); e._t = t; return e; };
  const poserAttrs = (e, s) => { for (const m of String(s).matchAll(/([\w-]+)(?:="([^"]*)")?/g)) e.setAttribute(m[1], m[2] === undefined ? '' : m[2]); if (e.attrs.class) e.className = e.attrs.class; };
  const correspond = (e, s) => {
    if (e.tagName === '#TEXT') return false;
    if (s === 'input' || s === 'textarea' || s === 'li' || s === 'div') return e.tagName === s.toUpperCase();
    let m = /^#([\w-]+)$/.exec(s); if (m) return e.id === m[1];
    m = /^\[id=([\w-]+)\]$/.exec(s); if (m) return e.id === m[1];
    m = /^\[([\w-]+)\]$/.exec(s); if (m) return e.getAttribute(m[1]) !== null;
    m = /^input\[([\w-]+)\]$/.exec(s); if (m) return e.tagName === 'INPUT' && e.getAttribute(m[1]) !== null;
    m = /^(\w+)\.([\w-]+)$/.exec(s); if (m) return e.tagName === m[1].toUpperCase() && String(e.className).split(/\s+/).includes(m[2]);
    return false;
  };
  doc.body = new El('body');
  doc.activeElement = doc.body;
  doc.createElement = (t) => new El(t);
  doc.createTextNode = (t) => texte(t);
  doc.querySelector = (s) => doc.body.querySelector(s);
  doc.querySelectorAll = (s) => doc.body.querySelectorAll(s);
  doc.getElementById = (id) => doc.body.querySelector('#' + id);
  doc.addEventListener = (t, f) => { (ecouteDoc[t] ||= []).push(f); };
  doc.contains = (x) => doc.body.contains(x);
  return { doc, El };
}
/* une frappe vraie : focus, valeur, curseur, et l evenement `input` (isTrusted) qui remonte au document */
const taper = (i, v, curseur = null) => { i.focus(); i.value = v; if (curseur !== null) i.setSelectionRange(curseur, curseur); i.dispatchEvent({ type: 'input', bubbles: true, isTrusted: true, target: i }); };
const cocher = (c) => { c.checked = true; c.dispatchEvent({ type: 'change', bubbles: true, isTrusted: true, target: c }); };

const MOI = '0x1111111111111111111111111111111111111111';
const BLOCK = '0xb2000000000000000000007afa7ed748b0874f27';

function monde(src) {
  const { doc, El } = faireDom();
  const page = (id, parent = doc.body, cls = '') => { const e = doc.createElement('div'); e.id = id; e.className = cls; parent.append(e); return e; };
  /* l ordre du panneau : la vue Market (et sa boite de tuiles, statique) AVANT la vue Skin (et sa boutique) */
  const statique = /<div class="bcPos" id="(\w+)"><\/div>/.exec(src);
  const vueMarket = page('bc-market'), vueSkin = page('bc-brain');
  const tuiles = page(statique ? statique[1] : 'TUILES_ABSENTES', vueMarket, 'bcPos');
  const boutique = page('bcBoutique', vueSkin, 'bcBoutique');
  const jeu = page('v-missions');
  const skinEtat = page('skinEtat', jeu), skinListe = page('skinListe', jeu);
  const missionsEtat = page('missionsEtat', jeu), missionsListe = page('missionsListe', jeu);
  const panier = page('bcBanquePanier'), panierLignes = page('bcPanierLignes', panier);
  const skins = [{ tokenId: '7', detenteur: MOI, enVente: false, recette: { h: [1, 2, 3] }, block: BLOCK }, { tokenId: '8', detenteur: MOI, enVente: false, recette: { h: [4, 5, 6] }, block: BLOCK }];
  const ctx = {
    console, JSON, String, Number, Array, Set, Map, Object, Promise, Math, RegExp, Error, Date, BigInt, setTimeout, clearTimeout,
    document: doc, $: (s) => doc.querySelector(s),
    Event: class { constructor(type, o = {}) { this.type = type; this.bubbles = !!o.bubbles; this.isTrusted = false; } },
    bc: {}, compte: MOI, rpc: async () => '0x', skinsJeuEnVol: false,
    lireSkins: async () => ({ etat: 'LU', skins, total: skins.length }),
    bcLireDevisesSkin: async () => {}, bcTexteDevisesOffertes: () => 'Paid in USDC.', bcDevisesSkin: () => ({}),
    bcResoudre: () => ({ sym: 'UNIT' }), bcMontantSkin: () => '1 USDC', bcDureeSkin: () => '1 h', offreMinimale: () => 1n,
    actionsSkin: (s, moi) => (s.detenteur === moi && !s.enVente ? ['METTRE_EN_VENTE'] : []),
    bcPastilleSkin: () => doc.createElement('span'), bcDevisesOffertes: () => ({ '0xusdc': { sym: 'USDC', dec: 6 } }), DEVISES_SKIN: { '0xusdc': {} },
    BC_DUREES_ENCHERE: [['1 day', 86400]], montantVersBrut: () => 1n, bcActionMarche: async () => {}, jb() {}, texteMarcheSkins: () => '2 skins.',
    bcBanque: { pourToi: null }, BC_PANIER_MAX: 3, bcBanqueChiffres: () => ({ etat: 'ok', puce: '●' }), bcPourToiDe: () => null,
    bcUnites: (x) => String(x), bcVisage: () => doc.createElement('span'), bcBas2: () => '1', bcPct: () => '5 %', bcPanierMaj() { ctx.majs = (ctx.majs || 0) + 1; },
    enTexte: (t) => String(t), fetch: async () => ({ json: async () => ctx.missions }),
    missions: { ok: true, contrat: '0xc', missions: [{ id: '3', lue: true, etat: 'OUVERTE', reward: '5', done: 0, maxDone: 9, detention: { window: 86400, minBlock: '1', minPaired: '0' } }] },
  };
  vm.createContext(ctx);
  const FN = ['bcPeindreMarche', 'bcLigneSkin', 'bcFormVendreSkin', 'peindreSkinsJeu', 'bcPanierPeindre', 'peindreMissions', 'bcPeindre', 'bcBanqueCharger'];
  const manquantes = FN.filter((f) => !extraire(src, f));
  const bcEl = extraireConst(src, 'bcEl');
  if (!bcEl) manquantes.push('bcEl');
  if (manquantes.length) throw new Error('EXTRACTION RATEE : ' + manquantes.join(', ') + ' introuvable(s)');
  /* les gardiens des saisies (absents avant la correction : le banc le dit, il ne plante pas) */
  const gardiens = ['saisiesEnCours', 'rendreSaisies', 'brancherSaisiesTapees', 'cleSaisie', 'cleChampPanier'].map((f) => extraire(src, f));
  vm.runInContext(bcEl.replace(/^const /, 'var ') + '\n' + FN.filter((f) => f !== 'bcPeindre' && f !== 'bcBanqueCharger').map((f) => extraire(src, f)).join('\n') + '\n' + gardiens.join('\n'), ctx);
  if (typeof ctx.brancherSaisiesTapees === 'function') ctx.brancherSaisiesTapees();
  /* le repeint du panier tel que bcBanqueCharger le fait : SA ligne, lue dans la source */
  const lp = /\n([^\n]*bcPanierPeindre\(listes\);[^\n]*)\n/.exec(extraire(src, 'bcBanqueCharger'));
  if (!lp) throw new Error('EXTRACTION RATEE : le repeint du panier dans bcBanqueCharger est introuvable');
  vm.runInContext('var repeindrePanier = function (listes) {\n' + lp[1] + '\n};', ctx);
  /* la boutique pose sa boite comme le fait bcPeindreBoutique (la ligne LUE dans la source) */
  const pose = /z\.append\(bcEl\('div', \{ cls: 'bcMarche', id: '(\w+)' \}\)\);\s*void bcPeindreMarche\(\);/.exec(extraire(src, 'bcPeindreBoutique'));
  if (!pose) throw new Error('EXTRACTION RATEE : la boite du marche des skins posee par bcPeindreBoutique est introuvable');
  boutique.append(ctx.bcEl('div', { cls: 'bcMarche', id: pose[1] }));
  /* le vidage des tuiles de bcPeindre (toutes les 3 s quand une tuile change) : son selecteur LU dans la source */
  const sel = /const mc = \$\('(#[\w-]+)'\);/.exec(extraire(src, 'bcPeindre'));
  if (!sel || !/mc\.textContent = '';/.test(extraire(src, 'bcPeindre'))) throw new Error('EXTRACTION RATEE : le vidage des tuiles de bcPeindre est introuvable');
  const viderTuiles = () => { const mc = doc.querySelector(sel[1]); mc.textContent = ''; mc.append(ctx.bcEl('div', {}, [ctx.bcEl('b', { text: '$1.02' })])); };
  return { ctx, doc, tuiles, boutique, skinListe, panierLignes, missionsListe, viderTuiles, boiteSkins: () => boutique.children[0] };
}

/* le champ « price » de la ligne de la skin #id (les lignes suivent l ordre des skins lues : #7 puis #8) */
const prixDe = (z, id) => z.querySelectorAll('input').filter((i) => i.getAttribute('aria-label') === 'Price')[{ 7: 0, 8: 1 }[id]] || null;

async function verifier(src, nom) {
  console.log('── ' + nom);
  /* U — aucun id pose par le script ne double un id du HTML statique */
  {
    const statiques = new Set([...src.matchAll(/\sid="([A-Za-z][\w-]*)"/g)].map((m) => m[1]));
    const doubles = [...src.matchAll(/\bid: '([A-Za-z][\w-]*)'/g)].map((m) => m[1]).filter((id) => statiques.has(id));
    vu(doubles.length === 0, nom + ' U aucun id du script ne double un id du HTML (' + (doubles.join(', ') || 'aucun') + ')');
  }
  /* V — le marche des skins dans SA boite, et le vidage des tuiles ne touche pas le prix tape */
  {
    const w = monde(src);
    await w.ctx.bcPeindreMarche();
    const dansBoutique = prixDe(w.boiteSkins(), '7'), dansTuiles = prixDe(w.tuiles, '7');
    vu(!!dansBoutique && !dansTuiles, nom + ' V1 le marche des skins est peint dans la boutique (vue Skin), pas dans les tuiles de la vue Market');
    const champ = dansBoutique || dansTuiles;
    if (champ) taper(champ, '12.5', 3);
    w.viderTuiles();
    const apres = prixDe(w.boiteSkins(), '7') || prixDe(w.tuiles, '7');
    vu(!!apres && apres.value === '12.5' && w.doc.activeElement === apres, nom + ' V2 le repeint des tuiles (bcPeindre, 3 s) laisse le prix tape et le focus');
  }
  /* W — repeindre le marche des skins garde prix, focus et curseur (panneau et onglet Game) */
  {
    const w = monde(src);
    await w.ctx.bcPeindreMarche();
    /* W regarde le repeint seul : la boite ou le marche a ete peint (V dit si c est la bonne) */
    const z = prixDe(w.boiteSkins(), '7') ? w.boiteSkins() : w.tuiles;
    const p7 = prixDe(z, '7');
    if (p7) taper(p7, '42', 1);
    await w.ctx.bcPeindreMarche();
    const n7 = prixDe(z, '7'), n8 = prixDe(z, '8');
    vu(!!n7 && n7 !== p7 && n7.value === '42', nom + ' W1 bcPeindreMarche repeint : le prix tape revient dans le NOUVEAU champ');
    vu(!!n7 && w.doc.activeElement === n7 && n7.selectionStart === 1 && n7.selectionEnd === 1, nom + ' W2 ... avec le focus et le curseur');
    vu(!!n8 && n8.value === '', nom + ' W3 le champ voisin, jamais tape, reste vide (rien d invente)');
    await w.ctx.peindreSkinsJeu();
    const g7 = prixDe(w.skinListe, '7');
    if (g7) taper(g7, '9', null);
    w.ctx.skinsJeuEnVol = false;
    await w.ctx.peindreSkinsJeu();
    const h7 = prixDe(w.skinListe, '7');
    vu(!!h7 && h7 !== g7 && h7.value === '9' && w.doc.activeElement === h7, nom + ' W4 peindreSkinsJeu (onglet Game) repeint : prix et focus gardes');
  }
  /* X — le panier de la Bank */
  {
    const w = monde(src);
    const mk = (id, sym) => ({ id, garantie: { symbole: sym, adr: '0x' + id.padStart(40, '0'), decimales: 18 }, pret: { symbole: 'USDC', decimales: 6 }, apyEmprunt: 0.05 });
    const listes = [mk('a1', 'METAc'), mk('b2', 'NVDAc')];
    w.ctx.repeindrePanier(listes);
    const ligne = (id) => w.panierLignes.querySelectorAll('li').find((li) => li.dataset.id === id);
    const champs = (id) => { const l = ligne(id); return l ? l.querySelectorAll('input') : []; };
    const [c1, g1, d1] = champs('a1');
    if (c1) cocher(c1);
    if (g1) { g1.disabled = false; taper(g1, '3'); }
    if (d1) { d1.disabled = false; taper(d1, '150', 2); }
    w.ctx.repeindrePanier(listes);
    const [c2, g2, d2] = champs('a1');
    vu(!!c2 && c2 !== c1 && c2.checked === true, nom + ' X1 le panier repeint (bcBanqueCharger) : la case cochee reste cochee');
    vu(!!g2 && g2.value === '3' && !!d2 && d2.value === '150' && g2.disabled === false && d2.disabled === false, nom + ' X2 ... les montants tapes restent (champs actifs)');
    vu(!!d2 && w.doc.activeElement === d2 && d2.selectionStart === 2, nom + ' X3 ... le focus et le curseur restent dans le champ tape');
    const [cb, gb] = champs('b2');
    vu(!!cb && cb.checked === false && !!gb && gb.value === '', nom + ' X4 la ligne jamais touchee reste telle que peinte');
    /* X5 : un montant PRE-REMPLI (le solde lu du wallet, jamais tape) prend la nouvelle lecture ; le montant tape a cote reste */
    w.ctx.solde = 5n;
    w.ctx.bcBanque.pourToi = { de: MOI.toLowerCase(), av: { solde: () => w.ctx.solde } };
    w.ctx.bcPourToiDe = () => ({ garantie: 5n, emprunt: 4000000n, rien: false });
    w.ctx.repeindrePanier(listes);
    const [, g3, d3] = champs('b2');
    if (d3) taper(d3, '77');
    w.ctx.solde = 9n;
    w.ctx.repeindrePanier(listes);
    const [, g4, d4] = champs('b2');
    vu(!!g3 && g3.value === '5' && !!g4 && g4.value === '9' && !!d4 && d4.value === '77', nom + ' X5 le pre-rempli suit la nouvelle lecture (5 -> 9), le montant tape reste (77)');
  }
  /* Y — la liste des missions */
  {
    const w = monde(src);
    await w.ctx.peindreMissions();
    const tx = w.missionsListe.querySelectorAll('input')[0];
    if (tx) taper(tx, '0xabc', 5);
    await w.ctx.peindreMissions();
    const tx2 = w.missionsListe.querySelectorAll('input')[0];
    vu(!!tx2 && tx2 !== tx && tx2.value === '0xabc' && w.doc.activeElement === tx2, nom + ' Y1 peindreMissions repeint : le hash tape et le focus restent');
    w.ctx.missions = { ok: true, contrat: '0xc', missions: [] };
    await w.ctx.peindreMissions();
    vu(w.missionsListe.querySelectorAll('input').length === 0, nom + ' Y2 la mission partie : son champ ne revient pas (rien d invente)');
  }
}

for (const [src, nom] of [[BRUT, 'LF'], [BRUT.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n').replace(/\r\n/g, '\n'), 'CRLF normalise']]) {
  try { await verifier(src, nom); } catch (e) { ko++; console.log('KO  ' + nom + ' : ' + e.message); }
}
console.log('\n' + (n - ko) + '/' + n + ' — ' + ko + ' KO');
process.exit(ko ? 1 : 0);
