/* test-panneau-groupes-20261025.mjs — LE PANNEAU DE COMMANDE EN QUATRE GROUPES (Phil, 2026-10-25 : « control panel upgrade »).
 * Le code REEL de app.html (la boucle des puces, la section « LE PANNEAU EN QUATRE GROUPES », les commandes du Chat, le bloc des slots) est
 * EXECUTE contre un faux DOM, un faux wallet et une fausse chaine. AFFIRME :
 *   G  groupes et ordre : Talk · Play · Trade · Brain OS, titres du balisage = GROUPES ; chaque puce (hors « tasks ») dans UN groupe, a son
 *      rang, une fois ; les quatre boutons de conversation de bcPeindreActions = PARLER (libelles, ordre) ;
 *   B  chaque badge = le comportement REEL de sa commande : le gestionnaire que le bouton declenche (dispatcher de bcExecuterTexte, ou la
 *      fermeture de parler(...)) est relu dans app.html, ses boutons SUIVANTS retires (bcBoutons), les fonctions qu il appelle suivies : il
 *      construit des appels pour le wallet <=> « you sign ». Le roll : practice sans contrat (reads), plan avec (you sign) ;
 *   S  Spin du panneau = les MEMES appels, octet par octet, que le bouton Spin de la carte Draws (USDC ; et en jeton : les memes arguments a
 *      preparerPaiementJeton / envoyerPaiementJeton) ; les lignes montrees avant la signature = les appels envoyes ; « Settle now » de la
 *      reponse = les memes appels que le Settle de la carte ; la reponse suivie montre les lignes de la carte (blocs k sur 3, resultat) ;
 *   N  chaque reponse se termine par EXACTEMENT une action suivante (.bcSuite, au plus un bouton, ou ses propres boutons) ;
 *   R  un bouton grise porte sa raison (title + une ligne sous son groupe) — sans wallet, sans contrat, duels fermes, rien a regler ;
 *   P  la palette liste toujours chaque commande de COMMANDES, spin et settle spin compris ;
 *   T  (revue 2026-10-25) l action suivante et la raison disent VRAI : Trade for me sans carte preparee, Its circle sans voisin lu, Spin dont
 *      la lecture des slots a echoue ;
 *   V  (revue 2, 2026-10-25) AUCUN block choisi + un contrat servi : le repeint (bcRepeindre) peint les groupes et lit les slots — Spin ne
 *      reste pas sur « Reading the slots contract… » ;
 *   W  (revue 2) un repeint des slots qui LEVE : slotsTic et bcSpinTic rearment leur minuteur de 3 s.
 * Mutants sur COPIES (dossier temporaire) : chacun doit rougir. NE PROUVE PAS : le rendu au navigateur (mesure a part), un wallet reel, un
 *   spin reel sur Base, les cartes d echange / d envoi (bcProposerSwap / bcProposerEnvoi : leurs boutons Sign ne sont pas executes ici). */
import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as C from './commandes-panel.js';
import * as Slots from './slots-plan.js';
import { reponseSpin, etapesHtml } from './reponse-spin.js';
import { entreesCommandes } from './palette.js';
import { usdc as usdcTexte } from './rolls-jeu.js';
import { keccak256Hex } from './keccak.js';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html');
const SRC_MODULE = lire('panneau-commandes.js');
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const sansCom = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
/* une fonction de premier niveau de app.html : de « function nom( » (async compris) a la premiere ligne « } » en colonne 0 */
function fonction(t, nom) {
  const d = new RegExp('^(?:async )?function ' + nom + '\\(', 'm').exec(t);
  if (!d) return '';
  const f = /^\}$/m.exec(t.slice(d.index));
  return f ? t.slice(d.index, d.index + f.index + 1) + '\n' : '';
}
const TMP = mkdtempSync(join(tmpdir(), 'panneau-groupes-'));
const copie = (nom, src) => { const f = join(TMP, nom); writeFileSync(f, src); return f; };
async function moduleDe(src) { return import(pathToFileURL(copie('pc-' + Math.random().toString(36).slice(2) + '.mjs', src)).href); }

/* ═══ le faux DOM (ce que le panneau utilise : createElement, append, insertBefore, querySelector simples, click avec capture) ═══ */
function faireDocument() {
  class Noeud {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.enfants = []; this.parentNode = null; this._t = ''; this.attrs = {}; this.dataset = {}; this.ecoute = []; this.hidden = false; this.disabled = false; this.title = ''; this.value = ''; this._cls = new Set(); const self = this;
      this.classList = { add: (...c) => c.forEach((x) => self._cls.add(x)), remove: (...c) => c.forEach((x) => self._cls.delete(x)), contains: (c) => self._cls.has(c), toggle: (c, v) => { if (v === undefined ? !self._cls.has(c) : v) self._cls.add(c); else self._cls.delete(c); } }; }
    get className() { return [...this._cls].join(' '); } set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get id() { return this.attrs.id || ''; } set id(v) { this.attrs.id = String(v); }
    get textContent() { return this.tagName === '#TEXT' ? this._t : this._t + this.enfants.map((e) => e.textContent).join(''); }
    set textContent(v) { for (const e of this.enfants) e.parentNode = null; this.enfants = []; this._t = String(v); }
    get innerText() { return this.textContent; }
    set innerHTML(v) { this.textContent = ''; this._html = String(v); }
    get children() { return this.enfants.filter((e) => e.tagName !== '#TEXT'); }
    get childNodes() { return [...this.enfants]; }
    get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
    get isConnected() { let x = this; while (x.parentNode) x = x.parentNode; return x === racine; }
    append(...ns) { for (let x of ns) { if (typeof x === 'string') { const t = new Noeud('#text'); t._t = x; x = t; } if (x.parentNode) x.remove(); x.parentNode = this; this.enfants.push(x); } }
    insertBefore(x, ref) { if (x.parentNode) x.remove(); const i = this.enfants.indexOf(ref); x.parentNode = this; if (i < 0) this.enfants.push(x); else this.enfants.splice(i, 0, x); }
    remove() { if (this.parentNode) { this.parentNode.enfants = this.parentNode.enfants.filter((e) => e !== this); this.parentNode = null; } }
    setAttribute(k, v) { if (k === 'class') this.className = v; else if (k === 'id') this.id = v; else if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); else this.attrs[k] = String(v); }
    getAttribute(k) { if (k === 'id') return this.id; if (k.startsWith('data-')) { const v = this.dataset[k.slice(5)]; return v === undefined ? null : v; } return k in this.attrs ? this.attrs[k] : null; }
    addEventListener(type, f, capture) { this.ecoute.push({ type, f, capture: !!capture }); }
    click() { if (this.disabled) return; const ev = { target: this, preventDefault() {} }; for (const l of this.ecoute.filter((x) => x.type === 'click' && x.capture)) l.f(ev); for (const l of this.ecoute.filter((x) => x.type === 'click' && !x.capture)) l.f(ev); }
    scrollIntoView() {} focus() {} setSelectionRange() {}
    descendants() { const o = []; const pile = [...this.children]; while (pile.length) { const e = pile.shift(); o.push(e); pile.unshift(...e.children); } return o; }
    querySelectorAll(sel) { return trouver(this, sel); }
    querySelector(sel) { return trouver(this, sel)[0] || null; }
    getBoundingClientRect() { return { width: 0, height: 0 }; }
  }
  /* « a », « a b », « :scope > a » ; a = tag, .cls, #id, [k], [k="v"] combines */
  const simple = (e, s) => { const m = s.match(/^([a-zA-Z0-9]*)((?:[.#][\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/); if (!m) throw new Error('selecteur non gere : ' + s);
    if (m[1] && e.tagName !== m[1].toUpperCase()) return false;
    for (const p of m[2].match(/[.#][\w-]+|\[[\w-]+(?:="[^"]*")?\]/g) || []) {
      if (p[0] === '.') { if (!e.classList.contains(p.slice(1))) return false; } else if (p[0] === '#') { if (e.id !== p.slice(1)) return false; }
      else { const [, k, v] = p.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/); const a = e.getAttribute(k); if (a === null || (v !== undefined && a !== v)) return false; } }
    return true; };
  function trouver(base, sel) {
    sel = sel.trim();
    if (sel.startsWith(':scope >')) { const s = sel.slice(8).trim(); return base.children.filter((e) => simple(e, s)); }
    const parts = sel.split(/\s+/);
    const der = parts.pop();
    return base.descendants().filter((e) => { if (!simple(e, der)) return false; let x = e.parentNode, k = parts.length - 1; while (k >= 0 && x && x !== base.parentNode) { if (simple(x, parts[k])) k -= 1; x = x.parentNode; } return k < 0; });
  }
  const racine = new Noeud('html');
  const document = { hidden: false, createElement: (t) => new Noeud(t), createTextNode: (t) => { const x = new Noeud('#text'); x._t = String(t); return x; },
    querySelector: (s) => racine.querySelector(s), querySelectorAll: (s) => racine.querySelectorAll(s), getElementById: (id) => racine.querySelector('#' + id), racine };
  const el = (tag, id, cls = '', parent = racine) => { const e = new Noeud(tag); if (id) e.id = id; if (cls) e.className = cls; parent.append(e); return e; };
  return { document, el, Noeud };
}
/* le balisage du panneau (#bcCmds : les quatre groupes TELS QUE app.html les ecrit) dans le faux DOM */
const BALISAGE = entre(APP, '<div class="bcCmds" id="bcCmds">', '<form onsubmit="return false" id="bcForm"');
function monterBalisage(d) {
  const cmds = d.el('div', 'bcCmds', 'bcCmds');
  for (const m of BALISAGE.matchAll(/<section class="bcGroupe" data-groupe="(\w+)"[^>]*><h3 class="bcGroupeTitre" id="(\w+)">([^<]+)<\/h3>\s*<div class="([^"]+)" id="(\w+)"><\/div>\s*<p class="note bcRaisons" hidden><\/p><\/section>/g)) {
    const s = d.el('section', '', 'bcGroupe', cmds); s.dataset.groupe = m[1];
    const h = d.el('h3', m[2], 'bcGroupeTitre', s); h.textContent = m[3];
    d.el('div', m[5], m[4], s);
    const p = d.el('p', '', 'note bcRaisons', s); p.hidden = true;
  }
  d.el('div', 'bcFil', 'bcFil'); d.el('input', 'bcSaisie'); d.el('p', 'bcNote', 'note');
  const pop = d.el('dialog', 'bcPop'); pop.open = true;
  /* la carte Draws (les elements que le bloc des slots touche) */
  for (const id of ['slotsZone', 'jbSlotsTuile', 'slotsSpin', 'slotsRegler', 'slotsAccepter', 'slotsEtat', 'slotsMoi', 'slotsListe', 'slotsEtapes', 'slotsSuite', 'slotsSuiteTxt', 'slotsRegle', 'slotsComment', 'slotsTableNote', 'slotsAccords', 'jbSlots', 'jbSlotsTxt', 'v-missions']) d.el('div', id);
  d.document.getElementById('v-missions').classList.add('on');
  return cmds;
}

/* ═══ G. groupes et ordre ═══ */
async function verifierGroupes(PC, app = APP) {
  const ko = [];
  const g = PC.GROUPES.map((x) => x.cle).join(','), t = PC.GROUPES.map((x) => x.titre).join(',');
  if (g !== 'talk,play,trade,os' || t !== 'Talk,Play,Trade,Brain OS') ko.push('groupes ' + g + ' / ' + t);
  if (PC.GROUPES[1].cmds[0] !== 'spin') ko.push('Spin n est pas le premier de Play');
  const titresHtml = [...entre(app, '<div class="bcCmds" id="bcCmds">', '<form onsubmit').matchAll(/<h3 class="bcGroupeTitre"[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]).join(',');
  if (titresHtml !== t) ko.push('titres du balisage ' + titresHtml);
  const tous = PC.GROUPES.flatMap((x) => x.cmds);
  if (new Set(tous).size !== tous.length) ko.push('une commande dans deux groupes');
  for (const p of C.PRECOMMANDES) if (p.cle !== 'tasks' && !tous.includes(p.cle)) ko.push('puce hors groupe : ' + p.cle);
  for (const k of tous) if (!C.PRECOMMANDES.some((p) => p.cle === k) && !PC.PARLER.some((p) => p.cle === k)) ko.push('commande de groupe inconnue : ' + k);
  const parler = [...fonction(app, 'bcPeindreActions').matchAll(/parler\('([^']+)'/g)].map((m) => m[1]);
  if (parler.join('|') !== PC.PARLER.map((p) => p.libelle).join('|')) ko.push('PARLER != bcPeindreActions : ' + parler.join('|'));
  /* EXECUTE : la boucle des puces + la section, sur le faux DOM — l ordre des enfants de chaque groupe */
  const r = monterPanneau({ PC, app });
  for (const grp of PC.GROUPES) {
    if (grp.cle === 'talk') continue;
    const z = r.document.querySelector('#' + { play: 'bcJouer', trade: 'bcPre', os: 'bcOs' }[grp.cle]);
    const ordre = z.children.map((b) => b.dataset.cmd).join(',');
    if (ordre !== grp.cmds.join(',')) ko.push('ordre peint ' + grp.cle + ' : ' + ordre);
  }
  return ko;
}

/* ═══ B. le badge = le comportement reel (relu dans le code de la commande) ═══ */
const PUITS = /\b(planRolls|planRollsAvecPass|Slots\.planSpin|slotsAgir|bcProposerSwap|bcProposerEnvoi|bcTraderSurDemande|planJoin|bcSigner|envoyerAppels|envoyerDepuisWallet|envoyerLotAtomique|envoyerPaiementJeton)\(/;
/* retire les boutons SUIVANTS d une reponse (le tableau passe a bcBoutons) : ce qu ils font est un geste d apres, pas la commande */
function sansBoutons(s) {
  let out = '', i = 0;
  for (;;) {
    const k = s.indexOf('bcBoutons(', i);
    if (k < 0) return out + s.slice(i);
    const a = s.indexOf('[', k);
    /* « bcBoutons(m, liste) » (sans tableau ecrit) : rien a retirer ici */
    if (a < 0 || a > k + 40 || /[;\n]/.test(s.slice(k, a))) { out += s.slice(i, k + 10); i = k + 10; continue; }
    let p = 0, j = a;
    for (; j < s.length; j++) { const c = s[j]; if (c === '[') p++; else if (c === ']') { p--; if (p === 0) break; } else if (c === "'" || c === '"' || c === '`') { const q = c; j++; while (j < s.length && s[j] !== q) { if (s[j] === '\\') j++; j++; } } }
    const fin = s.indexOf(')', j);
    if (fin < 0) return out + s.slice(i, k);
    out += s.slice(i, k) + 'bcBoutons(m, [])'; i = fin + 1;
  }
}
/* un bouton construit A COTE de l appel (« const boutons = …map((d) => ['Accept #' + d.id, () => …]) », puis bcBoutons(m, boutons)) : le
 *   tuple [libelle, () => geste] est un bouton suivant lui aussi — retire */
function sansTuplesBouton(s) {
  const re = /\[\s*['"`][^'"`\n]*['"`](?:\s*\+\s*[\w.()']+)*\s*,\s*(?:async\s*)?\([\w, ]*\)\s*=>/g;
  let out = '', i = 0, m;
  while ((m = re.exec(s))) {
    let p = 0, j = m.index;
    for (; j < s.length; j++) { const c = s[j]; if (c === '[') p++; else if (c === ']') { p--; if (p === 0) break; } else if (c === "'" || c === '"' || c === '`') { const q = c; j++; while (j < s.length && s[j] !== q) { if (s[j] === '\\') j++; j++; } } }
    out += s.slice(i, m.index) + '[]'; i = j + 1; re.lastIndex = i;
  }
  return out + s.slice(i);
}
function construitDesAppels(app, code, prof = 0, vus = new Set()) {
  const c = sansTuplesBouton(sansBoutons(sansCom(code)));
  const m = PUITS.exec(c);
  if (m) return m[1];
  if (prof >= 3) return null;
  for (const [, nom] of c.matchAll(/\b(bc[A-Z]\w*)\(/g)) {
    if (vus.has(nom) || /^(bcMessage|bcEtape|bcBoutons|bcVue|bcRepeindre|bcPeindre\w*|bcTerminer\w*|bcAvecSuite|bcSuivreSpin|bcEl)$/.test(nom)) continue;
    vus.add(nom);
    const f = fonction(app, nom);
    if (f) { const r = construitDesAppels(app, f, prof + 1, vus); if (r) return nom + '>' + r; }
  }
  return null;
}
function brancheDe(app, type) {
  const f = fonction(app, 'bcExecuterTexte');
  const i = f.indexOf("if (c.type === '" + type + "')");
  if (i < 0) return '';
  const j = f.indexOf('if (c.type ===', i + 10);
  return f.slice(i, j < 0 ? f.length : j);
}
const PHRASE = (p) => p.modele.replace('…', '1').replace(/to 0x$/, 'to 0x' + 'ab'.repeat(20)).replace(/^explain 0x$/, 'explain 0x' + 'cd'.repeat(32));
async function verifierBadges(PC, app = APP) {
  const ko = [];
  const pa = fonction(app, 'bcPeindreActions');
  for (const g of PC.GROUPES) for (const cle of g.cmds) {
    let code = '', ctxs = [{ rollsContrat: false }, { rollsContrat: true }];
    const pp = PC.PARLER.find((x) => x.cle === cle);
    if (pp) { const i = pa.indexOf("parler('" + pp.libelle), j = pa.indexOf('parler(', i + 8); code = pa.slice(i, j < 0 ? pa.length : j); }
    else {
      const p = C.PRECOMMANDES.find((x) => x.cle === cle);
      const a = C.analyserCommande(PHRASE(p));
      if (!a.ok) { ko.push(cle + ' : son modele n est pas compris (' + a.pourquoi + ')'); continue; }
      code = brancheDe(app, a.commande.type);
    }
    if (!code) { ko.push(cle + ' : gestionnaire introuvable'); continue; }
    if (PC.GESTES[cle] === 'contrat' || cle === 'roll' || cle === 'roll_x5') {
      /* le roll : la branche practice (sans contrat) et la suite (contrat servi) jugees a part */
      const corps = fonction(app, 'bcCommandeRoll'), i = corps.indexOf('if (!rollsCfg) {'), fin = /^ {2}\}$/m.exec(corps.slice(i)), j = fin ? i + fin.index : -1;
      const practice = construitDesAppels(app, corps.slice(i, j)), contrat = construitDesAppels(app, corps.slice(j));
      if (!/bcCommandeRoll\(/.test(code)) ko.push(cle + ' : ne mene pas a bcCommandeRoll');
      if (PC.gesteDe(cle, { rollsContrat: false }) !== (practice ? 'signe' : 'lit')) ko.push(cle + ' practice : badge ' + PC.badgeDe(cle, { rollsContrat: false }) + ', code ' + (practice || 'lit'));
      if (PC.gesteDe(cle, { rollsContrat: true }) !== (contrat ? 'signe' : 'lit')) ko.push(cle + ' contrat : badge ' + PC.badgeDe(cle, { rollsContrat: true }) + ', code ' + (contrat || 'lit'));
      continue;
    }
    const preuve = construitDesAppels(app, code);
    for (const ctx of ctxs) if (PC.gesteDe(cle, ctx) !== (preuve ? 'signe' : 'lit')) { ko.push(cle + ' : badge « ' + PC.badgeDe(cle, ctx) + ' », le code ' + (preuve ? 'construit des appels (' + preuve + ')' : 'ne construit aucun appel')); break; }
  }
  return ko;
}

/* ═══ le panneau monte : bloc des slots + commandes du Chat + boucle des puces + section des groupes, dans UNE portee ═══ */
const CONTRAT = '0x' + 'cc'.repeat(20), MOI = '0x' + 'a1'.repeat(20), USDC = '0x' + '83'.repeat(20);
const P = JSON.parse(lire('contracts/slots-parametres.json'));
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const trois = (g) => [0, 1, 2].map((r) => keccak256Hex(Uint8Array.from([...new TextEncoder().encode(g), r])));
const { toPot: TO_POT, toDev: TO_DEV } = Slots.partsDuSpin(P.spinPrice, P.potShareBps);
const SEL_SPIN = Slots.planSpin({ contrat: CONTRAT, usdc: USDC, spinPrice: 1 }).appels[1].data.slice(0, 10);
const SEL_APPROVE = Slots.planSpin({ contrat: CONTRAT, usdc: USDC, spinPrice: 1 }).appels[0].data.slice(0, 10);
const SEL_MANY = Slots.planSettleMany({ contrat: CONTRAT, spinIds: [1] }).appels[0].data.slice(0, 10);
const TABLE = P.prizes.map(BigInt);
function faireChaine({ pot = 9000000n, tete = 5000 } = {}) {
  const c = { pot: BigInt(pot), tete, spins: new Map(), hashes: new Map(), envois: [], n: 0 };
  const juger = (s) => { const h = [0, 1, 2].map((r) => c.hashes.get(s.t + r)); const f = Slots.facesDuSpin(h, s.id); const p = Slots.points(f); return { h, f, p, prix: TABLE[p] }; };
  c.executer = (data) => { const d = data.toLowerCase(), sel = d.slice(0, 10), mots = (d.slice(10).match(/.{64}/g) || []).map((x) => BigInt('0x' + x));
    if (sel === SEL_APPROVE) return [];
    if (sel === SEL_SPIN) { const id = ++c.n; const s = { id, t: c.tete + 2, ne: c.tete, statut: 1 }; c.spins.set(String(id), s); trois('spin' + id).forEach((h, r) => c.hashes.set(s.t + r, h)); c.pot += TO_POT;
      return [{ address: CONTRAT, topics: [Slots.TOPIC_SPUN, '0x' + w(id), '0x' + w(MOI)], data: '0x' + w(s.t) + w(TO_POT) + w(TO_DEV) }]; }
    if (sel === SEL_MANY) { const logs = []; for (const id of mots.slice(2)) { const s = c.spins.get(String(id)); if (!s || s.statut !== 1) continue; const j = juger(s); if (j.prix > c.pot) continue; s.statut = 2; c.pot -= j.prix;
      logs.push({ address: CONTRAT, topics: [keccakTopic(Slots.EV_SETTLED), '0x' + w(s.id), '0x' + w(MOI)], data: '0x' + j.h.map((x) => x.slice(2)).join('') + j.f.flat().map(w).join('') + w(j.p) + w(j.prix) + w(c.pot) + w(0) }); } return logs; }
    throw new Error('appel inconnu ' + sel); };
  c.rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x' + c.tete.toString(16);
    if (m === 'eth_getBlockByNumber') { const b = parseInt(p[0], 16), h = c.hashes.get(b); return h && b < c.tete ? { hash: h, timestamp: '0x' + (b * 2).toString(16) } : { hash: '0x' + w(b), timestamp: '0x' + (b * 2).toString(16) }; }
    if (m === 'eth_getLogs') { const f = p[0], de = parseInt(f.fromBlock, 16), jq = parseInt(f.toBlock, 16); return [...c.spins.values()].filter((s) => s.ne >= de && s.ne <= jq).map((s) => ({ address: CONTRAT, topics: [Slots.TOPIC_SPUN, '0x' + w(s.id), '0x' + w(MOI)], data: '0x' + w(s.t) + w(TO_POT) + w(TO_DEV) })); }
    if (m === 'eth_call') { const d = p[0].data.toLowerCase();
      if (d === Slots.appelPot()) return '0x' + w(c.pot);
      if (d === Slots.appelPointsDe(MOI) || d === Slots.appelGagneDe(MOI)) return '0x' + w(0);
      if (d.startsWith(Slots.appelSpin(0).slice(0, 10))) { const s = c.spins.get(String(BigInt('0x' + d.slice(10)))); return s ? '0x' + w(MOI) + w(s.t) + w(s.statut) : '0x' + w(0) + w(0) + w(0); } }
    if (m === 'eth_getTransactionReceipt') return { blockNumber: '0x' + c.tete.toString(16) };
    throw new Error('rpc ' + m);
  };
  return c;
}
let keccakTopic = null;
{ const K = await import('./keccak.js'); keccakTopic = K.topic; }
const FICHE = { ok: true, contrat: CONTRAT, prixSpin: P.spinPrice, potShareBps: P.potShareBps, prizes: P.prizes, esperanceBrut: '127862', bloc: 900, regleur: { etat: 'OFF', adresse: null, msParBlocMesure: 2000 } };
const LIGNE_JETON = { jeton: '0x' + 'dd'.repeat(20), pool: '0x' + 'ee'.repeat(20), symbole: 'NVDAc' };

function monterPanneau({ PC, app = APP, chaine = null, avecCompte = true, jeton = null, slotsFiche = FICHE, duelsJ = null, rolls = null, brain = '0x' + 'b1'.repeat(20), section = null, arret = null, extra = {}, popOuvert = true } = {}) {
  const d = faireDocument();
  monterBalisage(d);
  /* 2026-10-25 (revue, 2e) : `popOuvert: false` = le panneau FERME au chargement du module (comme dans la page), ouvert ensuite par le test */
  if (!popOuvert) d.document.getElementById('bcPop').open = false;
  const ch = chaine || faireChaine();
  const trace = { wallet: [], prepare: [], envoiJeton: [] };
  let dernier = [];
  const ctx = {
    document: d.document, $: (s) => d.document.querySelector(s), window: { ethereum: null }, Slots, usdcTexte, USDC_BASE: USDC, AbortSignal,
    jb: () => {}, rpc: (m, p) => ch.rpc(m, p), fetch: async (u) => ({ json: async () => (String(u).includes('/api/slots') ? slotsFiche : { ok: false }) }),
    faceRevelee: () => ({}), logoSvg: () => '<svg/>', paramsLogoDepuisApparence: () => ({}), reponseSpin, etapesHtml,
    phraseNonConfirme: (r, pre) => pre + ': ' + (r && r.pourquoi ? r.pourquoi : 'not confirmed'),
    envoyerAppels: async (appels) => { trace.wallet.push(appels.map((a) => ({ to: a.to, data: a.data, value: a.value || '0x0' }))); try { dernier = appels.flatMap((a) => ch.executer(a.data)); return { etat: 'CONFIRME', hash: '0x' + '11'.repeat(32) }; } catch (e) { dernier = []; return { etat: 'ECHEC_ENVOI', pourquoi: String(e.message) }; } },
    recusLogs: async () => ({ logs: dernier, manque: 0, n: 1 }), setInterval: () => 0, setTimeout: () => 0, clearTimeout: () => {},
    jetonChoisi: () => jeton, symbolePayer: (l) => l.symbole,
    preparerPaiementJeton: async (o) => { trace.prepare.push({ ligne: o.ligne, c: o.c, planUsdc: o.planUsdc.appels.map((a) => a.data), jeu: { ...o.jeu, spinPrice: String(o.jeu.spinPrice) } }); return { ok: true, plan: { appels: o.planUsdc.appels }, sym: 'NVDAc' }; },
    envoyerPaiementJeton: async (pj) => { trace.envoiJeton.push(pj.plan.appels.map((a) => a.data)); dernier = pj.plan.appels.flatMap((a) => ch.executer(a.data)); return { etat: 'CONFIRME', hash: '0x' + '22'.repeat(32) }; },
    direArretJeton: async () => '', reposerArret: () => {}, payerArrets: arret ? new Map([['slotsEtat', arret]]) : new Map(), agirArret: async () => {}, rouleauxTete: () => {}, peindreChoixJeu: () => {}, jeuReprendreFocus: () => {}, peindrePayerAvec: () => ({ catch: () => {} }),
    topicDe: keccakTopic, connecter: async () => {}, allerA: () => {},
    compte: avecCompte ? MOI : null, brainAdr: brain, rollsCfg: rolls, duelsCfg: { j: duelsJ, lu: 0 }, duelContrat: (j) => (j && /^0x[0-9a-f]{40}$/.test(String(j.contrat || '')) ? j.contrat : null),
    Duels: { duelsOuverts: (j) => !!(j && j.ouverts) }, lireDuelsServis: async () => duelsJ,
    PanneauCmd: PC, PRECOMMANDES: C.PRECOMMANDES, bc: {}, bcExecuterTexte: async (t) => { trace.texte = (trace.texte || []).concat(t); return true; },
    /* les commandes du Chat que la section enveloppe (leurs corps sont executes par N, a part) */
    ...Object.fromEntries(['bcCommandeGame', 'bcCommandeLog', 'bcCommandeLevel', 'bcCommandeRoll', 'bcCommandePostTask', 'bcCommandeDuel', 'bcCommandeSafety', 'bcCommandeExplain', 'bcCommandeWallet', 'bcCommandeGas'].map((k) => [k, async () => {}])),
    /* 2026-10-25 (revue) : ce qu un scenario remplace ou ajoute (l humeur du block, ses voisins, une lecture des slots qui echoue) */
    ...extra,
  };
  const morceaux = [
    entre(app, 'const bcEl = (tag, props = {}, enfants = []) => {', '\n};\n') + '\n};\n',
    fonction(app, 'bcMessage'), fonction(app, 'bcEtape'), fonction(app, 'bcBoutons'), 'function bcVue() {}\n', fonction(app, 'bcAvecWallet'),
    entre(app, '/* ══ LES SLOTS (Phil 2026-10-23', '/* ══ EARN (Phil 19:40)'),
    fonction(app, 'bcEcrireModele'),
    entre(app, 'for (const p of PRECOMMANDES) {', '\n}\n') + '\n}\n',
    section || entre(app, '/* ══ LE PANNEAU EN QUATRE GROUPES', '/* ══ FIN DES GROUPES DU PANNEAU */'),
    /* 2026-10-25 (revue, 2e) : LE repeint de 3 s (bcRepeindre, le vrai) ; bcPeindre (le grand peintre du block, hors banc) est reduit a ce
     *   qu il fait pour les groupes : bcPeindrePre -> bcPeindreCommandes */
    fonction(app, 'bcRepeindre'), 'function bcPeindre() { try { bcPeindreCommandes(); } catch (_) {} }\n',
  ];
  for (const [k, mo] of morceaux.entries()) if (mo.length < 12) throw new Error('morceau ' + k + ' introuvable dans app.html');
  const noms = Object.keys(ctx);
  const f = new Function(...noms, morceaux.join('\n') + '\n;return { slotsAgir, peindreSlots, slotsTic, slotsCfg, bcCommandeSpin, bcCommandeSettleSpin, bcPeindreCommandes, bcPeindreSpin, bcSpinTic, bcRepeindre, bcTerminer, bcAvecSuite, '
    + 'set compte(v) { compte = v; }, set slotsFiche(v) {}, get bc() { return bc; } };');
  const api = f(...noms.map((k) => ctx[k]));
  return { ...api, document: d.document, d, chaine: ch, trace, ctx };
}
const vider = async () => { for (let k = 0; k < 80; k++) await new Promise((ok) => setImmediate(ok)); };
const boutons = (m) => m.querySelectorAll('button');
const bouton = (m, re) => boutons(m).find((b) => re.test(b.textContent));

/* ═══ S. Spin du panneau = Spin de la carte, octet par octet ═══ */
async function spinCarte({ jeton = null, app = APP } = {}) {
  const p = monterPanneau({ PC: await import('./panneau-commandes.js'), jeton, app });
  await p.peindreSlots(true);
  await p.slotsAgir('spin');
  return p.trace;
}
async function spinPanneau({ jeton = null, PC, app = APP, section = null } = {}) {
  const p = monterPanneau({ PC, jeton, app, section });
  await p.peindreSlots(true);
  await p.bcCommandeSpin();
  const m = p.document.querySelector('#bcFil').lastElementChild;
  const lignes = m.querySelectorAll('li').map((l) => l.textContent);
  const b = bouton(m, /^Spin · /);
  if (!b) return { trace: p.trace, lignes, sansBouton: true, p, m };
  b.click(); await vider();
  return { trace: p.trace, lignes, p, m };
}
async function verifierSpin(PC, { app = APP, section = null } = {}) {
  const ko = [];
  const carte = await spinCarte({ app }), pan = await spinPanneau({ PC, app, section });
  if (pan.sansBouton) return ['panneau : pas de bouton Spin'];
  const ca = JSON.stringify(carte.wallet), pa = JSON.stringify(pan.trace.wallet);
  if (!carte.wallet.length || ca !== pa) ko.push('USDC : appels differents\n  carte ' + ca + '\n  panneau ' + pa);
  const plan = Slots.planSpin({ contrat: CONTRAT, usdc: USDC, spinPrice: BigInt(P.spinPrice) });
  if (!plan.appels.every((a) => pan.lignes.includes(a.quoi))) ko.push('les lignes montrees avant la signature ne sont pas les appels du plan');
  const cj = await spinCarte({ jeton: LIGNE_JETON, app }), pj = await spinPanneau({ jeton: LIGNE_JETON, PC, app, section });
  const a = JSON.stringify([cj.prepare, cj.envoiJeton, cj.wallet]), b = JSON.stringify([pj.trace.prepare, pj.trace.envoiJeton, pj.trace.wallet]);
  if (!cj.prepare.length || a !== b) ko.push('jeton : chemins differents\n  carte ' + a + '\n  panneau ' + b);
  if (!pj.lignes.some((l) => /Pay with NVDAc/.test(l))) ko.push('jeton : le « Pay with » choisi n est pas dit avant la signature');
  /* la reponse suivie : « Sent — spin #1 », blocs k sur 3, puis (blocs la) « Settle now — N s left » et son bouton = le Settle de la carte */
  const p = pan.p, m = pan.m;
  const suite = () => m.querySelector(':scope > .bcSuite');
  if (!suite() || !/Sent — spin #1/.test(suite().textContent) || !/Waiting for blocks [0-9, ]+ — 0 of 3 in/.test(suite().textContent)) ko.push('reponse apres le spin : ' + (suite() ? suite().textContent : 'aucune'));
  p.chaine.tete += 5; await p.peindreSlots(true); p.bcPeindreSpin();
  const z = suite(), bs = z ? boutons(z) : [];
  if (!z || !/Settle now — \d+ s left/.test(z.textContent) || bs.length !== 1 || bs[0].textContent !== 'Settle now') ko.push('blocs la : ' + (z ? z.textContent + ' / ' + bs.map((x) => x.textContent) : 'aucune'));
  else {
    bs[0].click(); await vider();
    const carteR = monterPanneau({ PC });
    await carteR.peindreSlots(true); await carteR.slotsAgir('spin'); carteR.chaine.tete += 5; await carteR.peindreSlots(true); await carteR.slotsAgir('settle');
    const x = JSON.stringify(p.trace.wallet[1]), y = JSON.stringify(carteR.trace.wallet[1]);
    if (!p.trace.wallet[1] || x !== y) ko.push('Settle now : appels differents de la carte\n  ' + x + '\n  ' + y);
    if (m.querySelectorAll(':scope > .bcSuite').length !== 1) ko.push('apres le settle : ' + m.querySelectorAll(':scope > .bcSuite').length + ' actions suivantes');
  }
  return ko;
}

/* ═══ N. chaque reponse se termine par UNE action suivante ═══ */
function uneAction(m) {
  if (!m) return 'aucune reponse';
  const suites = m.querySelectorAll(':scope > .bcSuite'), der = m.lastElementChild;
  if (der && der.classList.contains('bcBoutons') && suites.length === 0) return null;
  if (suites.length && m.querySelectorAll(':scope > .bcBoutons').some((d) => boutons(d).some((b) => !b.disabled))) return 'ses boutons ET une action suivante (deux actions)';
  if (suites.length !== 1) return suites.length + ' .bcSuite';
  if (der !== suites[0]) return 'la reponse ne finit pas par son action suivante';
  if (boutons(suites[0]).length > 1) return boutons(suites[0]).length + ' boutons dans l action suivante';
  if (!suites[0].textContent.trim()) return 'action suivante vide';
  return null;
}
async function verifierSuites(PC, { app = APP, section = null } = {}) {
  const ko = [];
  const HANDLERS = ['bcCommandeGame', 'bcCommandeLog', 'bcCommandeLevel', 'bcCommandeRoll', 'bcCommandePostTask', 'bcCommandeDuel', 'bcCommandeSafety', 'bcCommandeExplain', 'bcCommandeWallet', 'bcCommandeGas'];
  const cas = [
    ['gas', 'bcCommandeGas', [], {}], ['explain', 'bcCommandeExplain', ['0x' + 'cd'.repeat(32)], {}], ['wallet', 'bcCommandeWallet', [null], {}], ['wallet sans wallet', 'bcCommandeWallet', [null], { sansCompte: true }],
    ['safety', 'bcCommandeSafety', ['UNIT'], {}], ['log', 'bcCommandeLog', [], {}], ['level sans wallet', 'bcCommandeLevel', [], { sansCompte: true }], ['duel sans contrat', 'bcCommandeDuel', [], {}],
    ['post task', 'bcCommandePostTask', [{ reward: '100', players: 10, hold: '10' }], {}], ['game', 'bcCommandeGame', [], {}], ['roll practice', 'bcCommandeRoll', [1], {}], ['roll x5 practice', 'bcCommandeRoll', [5], {}],
    ['roll contrat sans wallet (ses boutons Connect)', 'bcCommandeRoll', [1], { sansCompte: true, rolls: { contrat: '0x' + '7a'.repeat(20), prixRoll: '500000' } }],
  ];
  for (const [nom, h, args, o] of cas) {
    const p = monterPanneau({ PC, app, section, avecCompte: !o.sansCompte, rolls: o.rolls || null });
    /* les VRAIS corps des commandes, dans la portee de la section (qui les enveloppe) */
    const corps = HANDLERS.map((k) => fonction(app, k)).join('\n') + '\n' + entre(app, 'const bcLignesOs = ', '\n') + '\n';
    const derniers = [];
    const stub = {
      BrainOs: { lireGas: async () => ({ lignes: [{ texte: 'Base fee 0.01 gwei' }] }), expliquerTx: async () => ({ lignes: [{ texte: 'status: success' }], inconnus: 0 }), lireWallet: async () => ({ lignes: [{ texte: 'ETH 0.1' }] }) },
      bcAvecDelai: (x) => x, court: (x) => String(x).slice(0, 8), RESEAUX: { 8453: { explorateur: 'https://basescan.org' } }, CHAINE: 8453,
      bcResoudre: () => ({ ok: true, adr: '0x' + 'f1'.repeat(20), sym: 'UNIT' }), ETH_ADR: '0x' + '00'.repeat(20), bcSureteDe: async () => ({ lignes: [{ texte: 'B20 code: read' }], resume: 'measured' }),
      creationsLues: [], lireJournal: async () => ({ ok: true }), journal: [{ t: 0, text: 'a roll' }], journalLuA: 0, heureJournal: () => '10:00', lireNiveau: async () => null,
      lireDuelsServis: async () => ({ ok: false }), $missionForm: null, allerA: () => {}, montrerJeu: () => {}, mesBlocksPourMission: () => {},
      rafraichirRollsCfg: async () => {}, roll: async () => { derniers.unshift({ bloc: 7, score: 2 }); }, rollDerniers: derniers,
    };
    const d = p.d;
    const noms = Object.keys(p.ctx).filter((k) => !(k in stub) && !HANDLERS.includes(k));
    const morceaux = [
      entre(app, 'const bcEl = (tag, props = {}, enfants = []) => {', '\n};\n') + '\n};\n', fonction(app, 'bcMessage'), fonction(app, 'bcEtape'), fonction(app, 'bcBoutons'), 'function bcVue() {}\n', fonction(app, 'bcAvecWallet'),
      entre(app, '/* ══ LES SLOTS (Phil 2026-10-23', '/* ══ EARN (Phil 19:40)'), corps,
      section || entre(app, '/* ══ LE PANNEAU EN QUATRE GROUPES', '/* ══ FIN DES GROUPES DU PANNEAU */'),
    ];
    const tous = { ...Object.fromEntries(noms.map((k) => [k, p.ctx[k]])), ...stub, document: d.document, $: (s) => (s === '#missionForm' ? null : d.document.querySelector(s)) };
    const k2 = Object.keys(tous);
    const f = new Function(...k2, morceaux.join('\n') + '\n;return { ' + HANDLERS.join(', ') + ' };');
    const api = f(...k2.map((k) => tous[k]));
    await api[h](...args); await vider();
    const m = d.document.querySelector('#bcFil').lastElementChild;
    const e = uneAction(m);
    if (e) ko.push(nom + ' : ' + e + ' — ' + (m ? m.textContent.slice(-160) : ''));
  }
  /* Spin sans contrat ; Settle my spin sans wallet ; Dismiss du Spin */
  { const p = monterPanneau({ PC, app, section, slotsFiche: { ok: true, contrat: null } }); await p.bcCommandeSpin(); const e = uneAction(p.document.querySelector('#bcFil').lastElementChild); if (e) ko.push('spin sans contrat : ' + e); }
  { const p = monterPanneau({ PC, app, section, avecCompte: false }); await p.bcCommandeSettleSpin(); const e = uneAction(p.document.querySelector('#bcFil').lastElementChild); if (e) ko.push('settle sans wallet : ' + e); }
  { const p = monterPanneau({ PC, app, section }); await p.peindreSlots(true); await p.bcCommandeSpin(); const m = p.document.querySelector('#bcFil').lastElementChild; bouton(m, /^Dismiss/).click(); await vider(); const e = uneAction(m); if (e) ko.push('spin ecarte : ' + e); if (p.trace.wallet.length) ko.push('spin ecarte : un appel est parti'); }
  return ko;
}

/* ═══ R. un bouton grise porte sa raison ═══ */
async function verifierRaisons(PC, { app = APP, section = null } = {}) {
  const ko = [];
  const scenarios = [
    ['sans wallet', { avecCompte: false }, ['spin', 'level', 'wallet']],
    ['slots sans contrat', { slotsFiche: { ok: true, contrat: null } }, ['spin']],
    ['duels fermes', { duelsJ: { ok: true, contrat: '0x' + '9d'.repeat(20), ouverts: false } }, ['duel']],
    ['sans block', { brain: null }, ['safety', 'buy_block', 'sell_block']],
  ];
  for (const [nom, o, attendus] of scenarios) {
    const p = monterPanneau({ PC, app, section, ...o });
    await p.peindreSlots(true); p.bcPeindreCommandes();
    const bs = p.document.querySelectorAll('#bcCmds button[data-cmd]');
    for (const k of attendus) { const b = bs.find((x) => x.dataset.cmd === k); if (!b || !b.disabled) ko.push(nom + ' : ' + k + ' n est pas grise'); }
    for (const b of bs.filter((x) => !x.hidden && x.disabled)) {
      const raisons = b.parentNode.parentNode.querySelector('.bcRaisons');
      const lib = b.querySelector('.bcLib').textContent;
      if (!b.title || !raisons || raisons.hidden || !raisons.textContent.split('\n').includes(lib + ' — ' + b.title)) ko.push(nom + ' : ' + b.dataset.cmd + ' grise sans sa raison (« ' + b.title + ' »)');
    }
  }
  /* Settle my spin : cache sans spin ; grise avec un spin qui attend ses blocs (sa raison) ; actif quand il est reglable */
  { const p = monterPanneau({ PC, app, section }); await p.peindreSlots(true); p.bcPeindreCommandes(); const b = p.document.querySelector('[data-cmd="settle_spin"]'); if (!b.hidden) ko.push('settle sans spin : visible');
    await p.slotsAgir('spin'); await p.peindreSlots(true); p.bcPeindreCommandes(); if (b.hidden || !b.disabled || !/Nothing to settle yet/.test(b.title)) ko.push('settle en attente : ' + b.hidden + '/' + b.disabled + '/' + b.title);
    p.chaine.tete += 5; await p.peindreSlots(true); p.bcPeindreCommandes(); if (b.hidden || b.disabled) ko.push('settle reglable : ' + b.hidden + '/' + b.disabled + '/' + b.title); }
  /* chaque badge peint = badgeDe ; chaque bouton a sa description (title) quand il est actif */
  { const p = monterPanneau({ PC, app, section, rolls: { contrat: '0x' + '7a'.repeat(20) } }); await p.peindreSlots(true); p.bcPeindreCommandes();
    for (const b of p.document.querySelectorAll('#bcCmds button[data-cmd]')) { const k = b.dataset.cmd, badge = b.querySelector('.bcBadge');
      if (!badge || badge.textContent !== PC.badgeDe(k, { rollsContrat: true })) ko.push('badge peint de ' + k + ' : ' + (badge && badge.textContent));
      if (!b.disabled && !b.hidden && b.title !== PC.descriptionDe(k, { rollsContrat: true })) ko.push('description de ' + k + ' : ' + b.title); } }
  return ko;
}

/* ═══ P. la palette ═══ */
function verifierPalette() {
  const ko = [];
  const e = entreesCommandes(C.COMMANDES);
  for (const c of C.COMMANDES) if (!e.some((x) => x.cle === c.cle)) ko.push('palette sans ' + c.cle);
  for (const m of ['spin', 'settle spin']) if (!e.some((x) => x.modele === m)) ko.push('palette sans « ' + m + ' »');
  for (const p of C.PRECOMMANDES) { const a = C.analyserCommande(PHRASE(p)); if (!a.ok) ko.push('puce ' + p.cle + ' non comprise'); }
  if (!/b\.addEventListener\('click', \(\) => \{\n[^\n]*\n\s+if \(p\.cle === 'tasks'\)[^\n]*if \(p\.direct\) \{ void bcExecuterTexte\(p\.modele\); return; \}\n\s+bcEcrireModele\(p\);/.test(APP)) ko.push('la boucle des puces : « direct » ou bcEcrireModele absent');
  if (!C.PRECOMMANDES.filter((p) => p.direct).every((p) => ['spin', 'settle_spin'].includes(p.cle))) ko.push('une puce existante est devenue « direct »');
  return ko;
}

/* ═══ T. (revue 2026-10-25) l action suivante et la raison disent VRAI dans l etat lu ═══
 *   Trade for me : « check the trade card » seulement quand une carte est preparee (humeur buy / sell) — pas sur un marche non lu ni un
 *   block mort ; Its circle sans voisin lu : le geste de sa reponse (ouvrir la Map), pas « Nothing to do » ; Spin dont la lecture des
 *   slots a echoue : « could not be read », pas « Reading… » pour toujours. Le code REEL de la section (bcTerminer, bcCtxSuite,
 *   bcLecturesPanneau) sur le faux DOM. */
async function verifierVerite(PC, { app = APP, section = null } = {}) {
  const ko = [];
  const suiteApres = (cle, extra) => {
    const p = monterPanneau({ PC, app, section, extra });
    const m = p.document.createElement('div'); m.className = 'bcMsg'; p.document.querySelector('#bcFil').append(m);
    p.bcTerminer(cle, m);
    const z = m.querySelector(':scope > .bcSuite');
    return z ? z.textContent : '';
  };
  const humeur = (phase, geste) => ({ bcPhaseDe: () => phase, conseilDe: () => ({ geste }), habitants: [], marcheParAdr: new Map([['0x' + '01'.repeat(20), {}]]) });
  for (const [phase, geste] of [['NON_LU', 'rien'], ['MORT', 'rien']]) {
    const t = suiteApres('trade_for_me', humeur(phase, geste));
    if (!t || /trade card/i.test(t)) ko.push('Trade for me ' + phase + ' (aucune carte) : « ' + t + ' »');
  }
  for (const [phase, geste] of [['EXCITE', 'buy'], ['INQUIET', 'sell_quarter']]) {
    const t = suiteApres('trade_for_me', humeur(phase, geste));
    if (!/check the trade card/.test(t)) ko.push('Trade for me ' + phase + ' (carte preparee) : « ' + t + ' »');
  }
  { const t = suiteApres('circle', { habitants: [], marcheParAdr: new Map() }); if (!/open the Map/.test(t)) ko.push('Its circle sans voisin : « ' + t + ' »'); }
  { const t = suiteApres('circle', { habitants: [{ adr: '0x' + '02'.repeat(20) }], marcheParAdr: new Map() }); if (/open the Map/.test(t)) ko.push('Its circle avec voisins : « ' + t + ' »'); }
  { const p = monterPanneau({ PC, app, section, extra: { fetch: async () => { throw new Error('down'); } } });
    p.bcPeindreCommandes(); await vider();
    const b = p.document.querySelector('[data-cmd="spin"]');
    if (!b || !b.disabled || !/could not be read/.test(b.title)) ko.push('Spin, lecture des slots ratee : ' + (b ? b.disabled + ' « ' + b.title + ' »' : 'absent')); }
  { const p = monterPanneau({ PC, app, section, extra: { fetch: async () => new Promise(() => {}) } });
    p.bcPeindreCommandes();
    const b = p.document.querySelector('[data-cmd="spin"]');
    if (!b || !/Reading the slots/.test(b.title)) ko.push('Spin, lecture en cours : ' + (b ? '« ' + b.title + ' »' : 'absent')); }
  return ko;
}

/* ═══ V. (revue 2026-10-25, 2e) AUCUN block choisi + un contrat des slots SERVI ═══
 *   MESURE au navigateur (375 px, panneau ouvert par #tkOuvrirBank sans block) : Spin restait grise sur « Reading the slots contract… »
 *   25 s et plus — bcRepeindre s arretait sur `if (!brainAdr) return;`, donc ni bcPeindreCommandes ni bcLecturesPanneau. Ici : le panneau
 *   FERME au chargement (la lecture du chargement ne part pas, comme dans la page), ouvert, puis UN repeint (le vrai bcRepeindre, celui de
 *   bcOuvrirPop et de l intervalle de 3 s) : sans wallet Spin dit « Connect a wallet to spin. », avec un wallet il est actif ; la ligne du
 *   groupe Play ne dit plus « Reading ». */
async function verifierSansBlock(PC, { app = APP, section = null } = {}) {
  const ko = [];
  for (const [nom, avecCompte, bon] of [['sans wallet', false, (b) => b.disabled && b.title === 'Connect a wallet to spin.'], ['avec wallet', true, (b) => !b.disabled && !b.hidden]]) {
    const p = monterPanneau({ PC, app, section, brain: null, avecCompte, popOuvert: false });
    p.document.getElementById('bcPop').open = true;
    p.bcRepeindre(); await vider();
    const b = p.document.querySelector('[data-cmd="spin"]');
    if (!b || !bon(b)) ko.push('aucun block, contrat servi, ' + nom + ' : Spin ' + (b ? (b.disabled ? 'grise' : 'actif') + ' « ' + b.title + ' »' : 'absent'));
    const r = b && b.parentNode && b.parentNode.parentNode ? b.parentNode.parentNode.querySelector('.bcRaisons') : null;
    if (r && /Reading the slots/.test(r.textContent)) ko.push('aucun block, ' + nom + ' : le groupe Play dit encore « ' + r.textContent + ' »');
  }
  return ko;
}

/* ═══ W. (revue 2026-10-25, 2e) un repeint des slots qui LEVE ne coupe pas le minuteur ═══
 *   Une fiche servie mal formee (prixSpin illisible : BigInt leve dans peindreSlotsUneFois, AVANT qu il ne rearme slotsTic) : slotsTic
 *   (onglet Game) et bcSpinTic (spin suivi dans le panneau) rearment leur minuteur de 3 s quand meme — sinon le spin n est plus suivi. Les
 *   minuteurs sont ENREGISTRES (aucun ne tourne) ; un rejet non tenu pendant le lot est compte comme un defaut. */
async function verifierReamorce(PC, { app = APP, section = null } = {}) {
  const ko = [];
  const CASSEE = { ...FICHE, prixSpin: 'pas un nombre' };
  const nonTenus = [], tenir = (e) => { nonTenus.push(e); };
  process.on('unhandledRejection', tenir);
  try {
    const armer = () => { const m = []; return { m, extra: { setTimeout: (fn, ms) => { m.push({ fn, ms }); return m.length; }, clearTimeout: () => {} } }; };
    { const a = armer(), p = monterPanneau({ PC, app, section, slotsFiche: CASSEE, extra: a.extra });
      let leve = null; try { await p.slotsTic(); } catch (e) { leve = e; } await vider();
      const id = p.slotsCfg.minuteur, t = Number.isInteger(id) ? a.m[id - 1] : null;
      if (leve) ko.push('slotsTic a leve : ' + leve.message);
      if (!t || t.ms !== 3000) ko.push('slotsTic : peindreSlots a leve, minuteur non rearme (' + String(id) + ')'); }
    { const a = armer(), p = monterPanneau({ PC, app, section, slotsFiche: CASSEE, extra: a.extra });
      p.bc.spinM = p.document.createElement('div'); p.bc.spinDepuis = Date.now();
      let leve = null; try { await p.bcSpinTic(); } catch (e) { leve = e; } await vider();
      const id = p.bc.spinMinuteur, t = Number.isInteger(id) ? a.m[id - 1] : null;
      if (leve) ko.push('bcSpinTic a leve : ' + leve.message);
      if (!t || t.ms !== 3000) ko.push('bcSpinTic : peindreSlots a leve, minuteur non rearme (' + String(id) + ')'); }
    await vider();
  } finally { process.off('unhandledRejection', tenir); }
  if (nonTenus.length) ko.push(nonTenus.length + ' rejet(s) non tenu(s) : ' + String(nonTenus[0] && nonTenus[0].message));
  return ko;
}

/* ═══ execution : le vrai code, puis les mutants ═══ */
const PC = await import('./panneau-commandes.js');
const dire = (ko, m) => { if (ko.length) console.log('KO ' + m + '\n  ' + ko.join('\n  ')); vu(ko.length === 0, m); };
dire(await verifierGroupes(PC), 'G groupes Talk · Play · Trade · Brain OS, Spin en tete de Play, chaque puce a son rang (peint)');
dire(await verifierBadges(PC), 'B chaque badge = ce que fait le code de sa commande (relu dans app.html)');
dire(await verifierSpin(PC), 'S Spin du panneau = Spin de la carte (USDC et jeton), lignes = appels, reponse suivie, Settle now = Settle de la carte');
dire(await verifierSuites(PC), 'N chaque reponse se termine par UNE action suivante');
dire(await verifierRaisons(PC), 'R un bouton grise porte sa raison ; Settle my spin cache / grise / actif ; badges et descriptions peints');
dire(verifierPalette(), 'P la palette liste chaque commande ; les puces existantes gardent leur geste');
dire(await verifierVerite(PC), 'T l action suivante et la raison disent vrai : Trade for me sans carte, Its circle sans voisin, slots non lus');
dire(await verifierSansBlock(PC), 'V aucun block + contrat servi : le repeint lit les slots, Spin dit sa vraie raison (sans wallet) ou est actif (avec)');
dire(await verifierReamorce(PC), 'W un repeint des slots qui leve : slotsTic et bcSpinTic rearment leur minuteur de 3 s');

const SECTION = entre(APP, '/* ══ LE PANNEAU EN QUATRE GROUPES', '/* ══ FIN DES GROUPES DU PANNEAU */');
const MUTANTS = [
  ['B', 'une commande qui signe etiquetee « reads » (spin)', 'module', "spin: 'signe', settle_spin", "spin: 'lit', settle_spin"],
  ['B', 'Trade for me etiquete « reads »', 'module', "trade_for_me: 'signe'", "trade_for_me: 'lit'"],
  ['B', 'le roll etiquete « reads » meme avec son contrat', 'module', "roll: 'contrat', roll_x5: 'contrat'", "roll: 'lit', roll_x5: 'contrat'"],
  ['B', 'Send etiquete « reads »', 'module', "swap: 'signe', send: 'signe'", "swap: 'signe', send: 'lit'"],
  ['B', 'Gas etiquete « you sign »', 'module', "gas: 'lit', show", "gas: 'signe', show"],
  ['G', 'Spin apres Settle (ordre)', 'module', "cmds: Object.freeze(['spin', 'settle_spin', 'roll'", "cmds: Object.freeze(['settle_spin', 'spin', 'roll'"],
  ['G', 'Brain OS avant Trade', 'module', "Object.freeze({ cle: 'trade', titre: 'Trade', cmds: Object.freeze(['buy_stock', 'sell_stock', 'buy_block', 'sell_block', 'swap', 'send']) }),\n  Object.freeze({ cle: 'os', titre: 'Brain OS', cmds: Object.freeze(['safety', 'explain', 'wallet', 'gas', 'show']) }),",
    "Object.freeze({ cle: 'os', titre: 'Brain OS', cmds: Object.freeze(['safety', 'explain', 'wallet', 'gas', 'show']) }),\n  Object.freeze({ cle: 'trade', titre: 'Trade', cmds: Object.freeze(['buy_stock', 'sell_stock', 'buy_block', 'sell_block', 'swap', 'send']) }),"],
  ['S', 'le Spin du panneau recopie le plan (prix +1)', 'section', "    await slotsAgir('spin');\n    bcBoutons(m, []);", "    await envoyerAppels(Slots.planSpin({ contrat, usdc: USDC_BASE, spinPrice: prix + 1n }).appels, compte);\n    bcBoutons(m, []);"],
  ['S', 'le Spin du panneau ignore « Pay with »', 'section', "    await slotsAgir('spin');\n    bcBoutons(m, []);", "    await envoyerAppels(plan.appels, compte);\n    bcBoutons(m, []);"],
  ['S', 'la reponse suivie ne suit plus le spin', 'section', "    const e = $('#slotsEtat'); if (e && e.textContent) bcEtape(m, e.textContent);\n    bcSuivreSpin(m);\n  }], ['Dismiss'", "    const e = $('#slotsEtat'); if (e && e.textContent) bcEtape(m, e.textContent);\n  }], ['Dismiss'"],
  ['S', 'Settle now de la reponse = Accept', 'section', "const geste = a && a.bouton === 'regler' ? ['Settle now', 'regler']", "const geste = a && a.bouton === 'regler' ? ['Settle now', 'accepter']"],
  ['N', 'aucune action suivante apres une commande', 'section', "    finally { try { bcTerminerApres(", "    finally { try { void (0, "],
  ['N', 'deux actions suivantes (pas de garde)', 'section', "  if (!m || m.querySelector(':scope > .bcSuite')) return;\n", "  if (!m) return;\n  m.append(bcEl('div', { cls: 'bcSuite' }, [bcEl('span', { text: 'x' })]));\n"],
  ['N', 'une action suivante ajoutee apres les boutons Sign', 'section', "  if (der && der.classList.contains('bcBoutons')) return;\n", "\n"],
  ['R', 'grise sans raison sous le groupe', 'section', "if (!b.hidden && b.disabled && b.dataset.raison) lignes.push(", "if (false) lignes.push("],
  ['R', 'Spin actif sans wallet', 'module', "    if (!ctx.compte) return non('Connect a wallet to spin.');\n", "\n"],
  ['R', 'duels fermes non dits', 'module', "    if (!ctx.duels.ouverts) return non(", "    if (false) return non("],
  ['R', 'Settle my spin cache quand il est reglable', 'module', "if (!s.contrat || !ctx.compte || (!reglable && !enAttente)) return", "if (true) return"],
  /* 2026-10-25 (revue) : les trois phrases fausses trouvees, remises une a une */
  ['T', 'Trade for me : « check the trade card » sans carte (la phrase d avant)', 'module', "      if (ctx.conseil === 'buy' || ctx.conseil === 'sell_quarter') return rien(", "      if (true) return rien("],
  ['T', 'Its circle : « Nothing to do » sans voisin (la phrase d avant)', 'module', "case 'circle': return ctx.voisins === 0 ?", "case 'circle': return false ?"],
  ['T', 'Spin : « Reading… » pour toujours apres un echec', 'module', "return non(s.rate ? 'The slots could not be read just now.' : 'Reading the slots contract…');", "return non('Reading the slots contract…');"],
  ['T', 'la section ne note plus l echec de lecture', 'section', "      bc.slotsRate = !(js && typeof js === 'object' && js.ok !== undefined);\n", "\n"],
  ['T', 'la section ne lit plus l humeur du block', 'section', "conseil = phase ? conseilDe(phase).geste : null;", "conseil = 'buy';"],
  /* 2026-10-25 (revue, 2e) : aucun block = aucun repeint des groupes (le defaut mesure au navigateur), et le minuteur coupe par un repeint qui leve */
  ['V', 'bcRepeindre s arrete sans block (le code d avant)', 'app', "  if (!brainAdr) { try { bcPeindreCommandes(); } catch (_) { /* le panneau n est pas encore construit */ } return; }\n", "  if (!brainAdr) return;\n"],
  ['V', 'les groupes ne se peignent qu avec un block', 'section', "function bcPeindreCommandes() {\n  const ctx = bcEtatPanneau();", "function bcPeindreCommandes() {\n  if (!brainAdr) return;\n  const ctx = bcEtatPanneau();"],
  ['V', 'les lectures du panneau attendent un block', 'section', "function bcLecturesPanneau(ctx) {\n  const d = $('#bcPop');", "function bcLecturesPanneau(ctx) {\n  if (!brainAdr) return;\n  const d = $('#bcPop');"],
  ['W', 'slotsTic : repeint lance sans attendre ni rearmer (le code d avant)', 'app', "Date.now() - slotsCfg.peintA > 15000) { await slotsTicRepeindre(); return; }", "Date.now() - slotsCfg.peintA > 15000) { void peindreSlots(); return; }"],
  ['W', 'slotsTicRepeindre avale l echec sans rearmer', 'app', "  catch (_) { clearTimeout(slotsCfg.minuteur); slotsCfg.minuteur = setTimeout(() => { void slotsTic(); }, 3000); }\n", "  catch (_) { /* rien */ }\n"],
  ['W', 'bcSpinTic laisse filer l exception (le code d avant)', 'section', "    } catch (_) { /* relu au battement suivant */ }\n", "    } finally { /* rien */ }\n"],
];
let tues = 0;
for (const [lot, nom, ou, de, a] of MUTANTS) {
  const src = ou === 'module' ? SRC_MODULE : ou === 'app' ? APP : SECTION;
  if (src.split(de).length !== 2) throw new Error('mutant « ' + nom + ' » : ancre absente ou multiple');
  const mute = src.replace(de, a);
  const PCm = ou === 'module' ? await moduleDe(mute) : PC, sec = ou === 'section' ? mute : null, appM = ou === 'app' ? mute : APP;
  let ko = [];
  try {
    if (lot === 'G') ko = await verifierGroupes(PCm, ou === 'section' ? APP.replace(SECTION, mute) : APP);
    if (lot === 'B') ko = await verifierBadges(PCm);
    if (lot === 'S') ko = await verifierSpin(PCm, { section: sec });
    if (lot === 'N') ko = await verifierSuites(PCm, { section: sec });
    if (lot === 'R') ko = await verifierRaisons(PCm, { section: sec });
    if (lot === 'T') ko = await verifierVerite(PCm, { section: sec });
    if (lot === 'V') ko = await verifierSansBlock(PCm, { app: appM, section: sec });
    if (lot === 'W') ko = await verifierReamorce(PCm, { app: appM, section: sec });
  } catch (e) { ko = ['exception : ' + e.message]; }
  if (process.env.VERBEUX) console.log('  [' + lot + '] ' + nom + ' -> ' + String(ko[0]).slice(0, 150));
  vu(ko.length > 0, 'mutant ' + lot + ' « ' + nom + ' » : ROUGE');
  tues += 1;
}
console.log('ok panneau-groupes - ' + n + ' assertions, ' + tues + '/' + MUTANTS.length + ' mutants tues ; NE PROUVE PAS le rendu au navigateur, un wallet reel, un spin reel sur Base, les cartes d echange / d envoi');
