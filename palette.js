/* palette.js — LA PALETTE Ctrl+K DU PANNEAU DE COMMANDE : la liste, le filtre flou, le classement, l usage. Rien d autre.
 *
 * ⛔ PUR : aucun DOM, aucun reseau, aucun import. app.html lui DONNE la table des commandes (COMMANDES de commandes-panel.js, celle que
 *   le dispatcher du Chat parcourt), les onglets lus dans la barre (.navB) et les tuiles lues dans le Game (.jeuBandeau) : ce fichier ne
 *   recopie aucune de ces listes, il ne peut donc pas diverger d elles (test-palette-20261018.mjs).
 * ⛔ IL N EXECUTE RIEN : une ligne choisie est rendue a app.html, qui l ENVOIE par le formulaire du Chat (le meme gestionnaire que la
 *   frappe) ou ECRIT son modele dans le champ, a ajuster. Rien ne signe ici ; une commande qui mene a une transaction passe toujours par
 *   ses boutons Sign.
 * Classement : le SCORE d abord (nom exact > debut > debut de mot > sous-chaine > sous-suite ; le nom pese plus que les mots-cles), puis
 *   l usage (les lignes deja choisies dans ce navigateur), puis l ordre de la liste. Requete vide : les plus utilisees, puis l ordre. */

export const MAX_VIDE = 10;
export const MAX_LISTE = 40;
export const USAGES_MAX = 40;
export const CLE_USAGES = 'tblock.palette.usages.v1';

/** « Rôll ×5 » -> « roll x5 » : casse, accents (marques combinantes), le signe × lu comme x, espaces reduits. */
export function normaliser(s) {
  return String(s === undefined || s === null ? '' : s).normalize('NFD').replace(/\p{M}+/gu, '').replace(/×/g, 'x').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Une sous-suite (« wlt » dans « wallet ») : 1..399, 0 si une lettre manque. Les lettres qui se suivent et les debuts de mot comptent plus. */
function sousSuite(q, t) {
  let j = 0, s = 100, suite = 0, dernier = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    const k = t.indexOf(ch, j);
    if (k < 0) return 0;
    if (k === dernier + 1) { suite += 1; s += 5 * suite; } else { suite = 0; s -= Math.min(20, k - j); }
    if (k === 0 || t[k - 1] === ' ') s += 10;
    dernier = k; j = k + 1;
  }
  return Math.max(1, Math.min(399, s));
}

/** Le score d une requete contre UN texte : 0 = aucune correspondance. */
export function scoreFlou(requete, texte) {
  const q = normaliser(requete), t = normaliser(texte);
  if (!q || !t) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - Math.min(100, t.length - q.length);
  const i = t.indexOf(q);
  if (i > 0 && t[i - 1] === ' ') return 600;
  if (i >= 0) return 400;
  return sousSuite(q, t);
}

/** Le score d une ligne : la phrase entiere contre le nom, ou CHAQUE mot tape contre le nom (x2) ou les mots-cles. Un mot sans rien = 0. */
function scoreEntree(e, q) {
  const phrase = scoreFlou(q, e.nomN) * 3;
  let total = 0;
  for (const mot of q.split(' ')) {
    const sn = scoreFlou(mot, e.nomN) * 2;
    const sm = scoreFlou(mot, e.motsN);
    const s = Math.max(sn, sm);
    if (!s) return phrase;
    total += s;
  }
  return Math.max(phrase, total);
}

/** La liste montree : requete vide = les plus utilisees puis l ordre (MAX_VIDE) ; sinon les lignes qui correspondent, classees. */
export function filtrerPalette(entrees, requete, usages = {}, max = MAX_LISTE) {
  usages = usages && typeof usages === 'object' ? usages : {};
  const q = normaliser(requete);
  if (!q) {
    return entrees.map((e, i) => ({ e, i }))
      .sort((x, y) => (usages[y.e.id] || 0) - (usages[x.e.id] || 0) || x.i - y.i)
      .slice(0, MAX_VIDE).map((x) => x.e);
  }
  return entrees.map((e, i) => ({ e, i, s: scoreEntree(e, q) })).filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || (usages[y.e.id] || 0) - (usages[x.e.id] || 0) || x.i - y.i)
    .slice(0, max).map((x) => x.e);
}

const entree = (id, groupe, nom, mots, reste) => ({ id, groupe, nom: String(nom), mots: String(mots || ''), nomN: normaliser(nom), motsN: normaliser(mots), ...reste });

/** Les commandes : UNE ligne par modele de la table recue (COMMANDES). `ecrire` = le modele s ecrit dans le champ, a ajuster. */
export function entreesCommandes(table) {
  const out = [];
  for (const c of table) {
    for (const l of c.palette || []) out.push(entree('cmd:' + l.modele, 'Command', l.nom, l.mots, { faire: 'commande', cle: c.cle, modele: l.modele, ecrire: l.ecrire === true }));
  }
  return out;
}

/** Les onglets de l app, tels que la barre les porte : [{ volet, nom }]. */
export function entreesOnglets(liste) {
  return (liste || []).filter((o) => o && o.volet && o.nom).map((o) => entree('tab:' + o.volet, 'Tab', o.nom, 'tab open go ' + o.volet, { faire: 'onglet', volet: o.volet }));
}

/** Les jeux du Game, tels que ses tuiles les portent : [{ jeu, focus, nom, mots }]. */
export function entreesJeu(liste) {
  return (liste || []).filter((o) => o && o.jeu && o.nom).map((o) => entree('game:' + o.jeu + ':' + (o.focus || ''), 'Game', o.nom, 'game ' + (o.mots || ''), { faire: 'jeu', jeu: o.jeu, focus: o.focus || '' }));
}

/** L usage : un compteur par ligne, BORNE (les moins utilisees partent ; celle qu on vient de choisir reste). */
export function noterUsage(usages, id) {
  const u = { ...(usages && typeof usages === 'object' ? usages : {}) };
  u[id] = (u[id] || 0) + 1;
  const cles = Object.keys(u).sort((a, b) => u[b] - u[a] || (a === id ? -1 : b === id ? 1 : 0));
  while (cles.length > USAGES_MAX) delete u[cles.pop()];
  return u;
}

const CLE_LIGNE = /^[a-z]+:[A-Za-z0-9_:. -]{1,80}$/;
/** Lu dans le stockage du navigateur : {} s il est absent, bloque (navigation privee), illisible ; seules les valeurs entieres >= 0. */
export function lireUsages(stockage) {
  let brut = null;
  try { brut = stockage ? stockage.getItem(CLE_USAGES) : null; } catch (_) { brut = null; }
  if (!brut) return {};
  let o = null;
  try { o = JSON.parse(brut); } catch (_) { return {}; }
  const r = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return r;
  for (const k of Object.keys(o)) if (CLE_LIGNE.test(k) && Number.isSafeInteger(o[k]) && o[k] >= 0) r[k] = o[k];
  return r;
}
export function ecrireUsages(stockage, usages) {
  try { if (stockage) stockage.setItem(CLE_USAGES, JSON.stringify(usages || {})); } catch (_) { /* navigation privee : rien n est retenu */ }
}

/** Fleches : la selection boucle (haut sur la premiere = la derniere) ; -1 = rien a selectionner. */
export function deplacer(i, d, n) {
  if (!n) return -1;
  if (i < 0) return d > 0 ? 0 : n - 1;
  return ((i + d) % n + n) % n;
}
