/* test-map-recherche-liste-20261026.mjs — LA RECHERCHE DE LA MAP (en haut a gauche) MONTRE LA LISTE DE « FIND A BLOCK » PENDANT LA FRAPPE.
 *
 * QA game56 (Grok Super, lecture seule, capture check3-search-unit.png) : taper « unit » dans le champ de la Map ne montrait aucune liste ;
 *   « Find » sautait directement au block. La liste de propositions n existait que dans « Find a block » du panneau.
 * CE BANC EXECUTE LE VRAI CODE DE app.html (extrait, extraction VERIFIEE, copie LF et copie CRLF normalisee) dans un `vm`, faux DOM,
 *   /api/recherche simule :
 *   A. taper dans #trouver montre, apres l attente de saisie, la liste peinte par peindreResultatsB20 (la fonction de Find a block)
 *      dans #mapResultats, sans rien ouvrir ;
 *   B. choisir une ligne de la liste ouvre CE block sur la carte (le saut) et ferme la liste ;
 *   C. Entree et « Find » gardent le saut de chercherBlock ; une frappe en attente ne repeint pas la liste apres le saut ;
 *   D. vider le champ ferme la liste ; une adresse abregee dit sa phrase ;
 *   E. une seule peinture de liste dans la page (peindreResultatsB20 definie une fois) et le champ de la Map passe par
 *      brancherRechercheB20, le branchement partage (pas une copie).
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const BRUT = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const UNIT2 = '0xb2000000000000000000aaaaaaaaaaaaaaaaaaaa';

const extraire = (src, nom) => {
  const m = new RegExp('\\n(async )?function ' + nom + '\\(').exec(src);
  if (!m) return '';
  const i = m.index + 1;
  const f = /\n\}\n/.exec(src.slice(i));
  return f ? src.slice(i, i + f.index + 3) : '';
};
const FN = ['peindreResultatsB20', 'brancherRechercheB20', 'choixEvidentB20', 'choixEvidentOuAdresseB20', 'phraseRechercheVide', 'libelleRangB20',
  'chercherAuServeur', 'adresseAbregee'];

class El {
  constructor(id = '') { this.id = id; this.ecoute = {}; this.hidden = true; this._html = ''; this._t = ''; this.value = ''; this.onclick = null; this.clics = 0; this.classList = { add() {}, remove() {} }; }
  set innerHTML(v) { this._html = String(v); this._t = ''; }
  get innerHTML() { return this._html; }
  set textContent(v) { this._t = String(v); this._html = ''; }
  get textContent() { return this._t || this._html.replace(/<[^>]+>/g, ''); }
  addEventListener(t, f) { (this.ecoute[t] ||= []).push(f); }
  emettre(t, ev = {}) { for (const f of this.ecoute[t] || []) f({ target: this, key: ev.key, preventDefault() {} }); }
  replaceChildren(...xs) { this._html = xs.map((x) => x.textContent).join(''); }
  click() { this.clics += 1; }
  scrollIntoView() {}
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

function monde(src) {
  const els = {};
  for (const id of ['trouver', 'bTrouver', 'mapResultats', 'mapNote', 'mapEtat']) els['#' + id] = new El(id);
  const etat = { recherches: [], chercherBlock: 0, ouverts: [] };
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
    rechercheB20: async (q) => { etat.recherches.push(q); return { ok: true, etat: 'TROUVE', total: 2, plus: false,
      resultats: [{ adr: UNIT, sym: 'UNIT', nom: 'Unit', rang: 'SYMBOLE_DEBUT' }, { adr: UNIT2, sym: 'UNITY', nom: null, rang: 'SYMBOLE_DEBUT' }] }; },
    chercherBlock: () => { etat.chercherBlock += 1; },
  };
  vm.createContext(ctx);
  const manquantes = FN.filter((f) => !extraire(src, f));
  if (manquantes.length) throw new Error('EXTRACTION RATEE : ' + manquantes.join(', ') + ' introuvable(s)');
  /* le branchement du champ de la Map : de la fin de chercherAuServeur jusqu a la doc de poserNosBlocks */
  const cas = extraire(src, 'chercherAuServeur');
  const i = cas ? src.indexOf(cas) + cas.length : -1, f = src.indexOf('/**\n * Pose NOS blocks', i);
  if (!(i > 0 && f > i)) throw new Error('EXTRACTION RATEE : le branchement de #trouver est introuvable');
  const ouvrir = extraire(src, 'ouvrirSurCarteB20');
  const branchement = src.slice(i, f);
  if (!/#trouver/.test(branchement)) throw new Error('EXTRACTION RATEE : #trouver absent du branchement extrait');
  vm.runInContext(FN.map((n) => extraire(src, n)).join('\n') + '\n' + ouvrir + '\n' + branchement, ctx);
  return { ctx, els, etat, habitants, taper: (v) => { els['#trouver'].value = v; els['#trouver'].emettre('input'); },
    choisir: (adr) => { const l = els['#mapResultats']; l.onclick({ target: { closest: () => ({ getAttribute: (k) => (k === 'data-rb-adr' ? adr : 'SYM') }) } }); } };
}

async function verifier(src, nom) {
  const ko = [];
  const cas = async (t, fn) => { try { await fn(); } catch (e) { ko.push(nom + ' ' + t + ' — ' + String(e && e.message || e).split('\n')[0]); } };
  const exige = (c, m) => { if (!c) throw new Error(m); };
  await cas('A liste a la frappe', async () => {
    const w = monde(src);
    w.taper('unit'); await attendre(350);
    const l = w.els['#mapResultats'];
    exige(w.etat.recherches.join() === 'unit', 'A /api/recherche non interroge pendant la frappe : ' + JSON.stringify(w.etat.recherches));
    exige(!l.hidden && /data-rb-adr="0xb2000000000000000000007afa7ed748b0874f27"/.test(l.innerHTML) && /class="rbChoix"/.test(l.innerHTML),
      'A aucune liste sous le champ de la Map (hidden=' + l.hidden + ') : « ' + l.innerHTML.slice(0, 120) + ' »');
    exige(/data-rb-adr="0xb2000000000000000000aaaaaaaaaaaaaaaaaaaa"/.test(l.innerHTML), 'A la seconde proposition manque');
    exige(w.habitants.length === 0 && w.etat.chercherBlock === 0, 'A la frappe a ouvert un block sans choix');
  });
  await cas('B choisir saute', async () => {
    const w = monde(src);
    w.taper('unit'); await attendre(350);
    exige(typeof w.els['#mapResultats'].onclick === 'function', 'B la liste n a pas de choix cliquable');
    w.choisir(UNIT2);
    const h = w.habitants.find((x) => x.adr === UNIT2);
    exige(h && h.el.clics === 1, 'B choisir UNITY n a pas ouvert UNITY sur la carte');
    exige(w.els['#mapResultats'].hidden, 'B la liste reste ouverte apres le choix');
  });
  await cas('C Entree / Find', async () => {
    const w = monde(src);
    w.taper('unit');
    w.els['#trouver'].emettre('keydown', { key: 'Enter' });
    exige(w.etat.chercherBlock === 1, 'C Entree n appelle pas chercherBlock une fois : ' + w.etat.chercherBlock);
    await attendre(350);
    exige(w.etat.recherches.length === 0 && w.els['#mapResultats'].hidden, 'C une frappe en attente a repeint la liste apres le saut de Entree');
    w.taper('unit');
    w.els['#bTrouver'].emettre('click');
    exige(w.etat.chercherBlock === 2, 'C « Find » n appelle pas chercherBlock');
    await attendre(350);
    exige(w.etat.recherches.length === 0, 'C une frappe en attente a repeint la liste apres « Find »');
  });
  await cas('D vider / abregee', async () => {
    const w = monde(src);
    w.taper('unit'); await attendre(350);
    w.taper(''); await attendre(300);
    exige(w.els['#mapResultats'].hidden, 'D vider le champ ne ferme pas la liste');
    w.taper('0xb200…4f27'); await attendre(300);
    exige(/shortened/.test(w.els['#mapResultats'].textContent), 'D une adresse abregee ne dit pas sa phrase');
  });
  await cas('E une seule liste', async () => {
    exige((src.match(/\nfunction peindreResultatsB20\(/g) || []).length === 1, 'E peindreResultatsB20 n est pas definie une fois');
    exige(/brancherRechercheB20\(\{ champ: \$\('#trouver'\), liste: \$\('#mapResultats'\)/.test(src), 'E le champ de la Map ne passe pas par brancherRechercheB20');
  });
  return ko;
}

const LF = BRUT.replace(/\r\n/g, '\n');
const CRLF = LF.replace(/\n/g, '\r\n');
if (!/\r\n/.test(CRLF)) throw new Error('TEMOIN : la copie CRLF n a pas de CRLF');
const ko = [...await verifier(LF, 'LF'), ...await verifier(CRLF.replace(/\r\n/g, '\n'), 'CRLF')];
console.log(ko.length ? ko.map((k) => 'KO ' + k).join('\n') : 'ok');
console.log('test-map-recherche-liste-20261026: ' + ko.length + ' KO');
process.exit(ko.length ? 1 : 0);
