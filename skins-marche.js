/* skins-marche.js — LE MARCHE DES SKINS DANS L ONGLET MARKET (Phil, 2026-10-23 : « build the market for skins and the auctions »).
 *
 * CE QUE C EST : la logique PURE de la section « Skins » de l onglet Market — chaque skin du contrat BlockSkins actif (lue par
 *   lireSkins, blockskins.js, par pages de 100), son statut, les filtres, l ordre, l apercu de sa face (ses SEPT teintes, celles que le
 *   contrat garde), et le « new bid » quand l offre d une enchere change entre deux lectures.
 * ⛔ CE MODULE NE LIT RIEN, NE SIGNE RIEN, N ENVOIE RIEN : l app lit la chaine (lireSkins), ce module range ; chaque geste passe par
 *   bcActionMarche (app.html) et le wallet de la personne. Les gestes possibles viennent de actionsSkin (blockskins.js) — ce que le
 *   contrat ACCEPTERAIT — jamais d une regle a cote.
 */
import { actionsSkin, offreMinimale } from './blockskins.js';

/** Relecture de la liste tant que la section est visible (Phil : « live ») : 25 s, bornee a lireSkins (1 + ceil(n/100) eth_call). */
export const SKM_RAFRAICHIR_MS = 25000;
/** Le « new bid » reste allume ce temps-la apres la lecture qui l a vu. */
export const SKM_POULS_MS = 6000;
export const SKM_FILTRES = Object.freeze([
  ['all', 'All'], ['sale', 'Fixed price'], ['auction', 'Auctions'], ['unlisted', 'Not listed'], ['mine', 'Mine'],
]);
const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;

/** Le statut d une skin a l instant t (secondes) : FIXE (prix fixe), ENCHERE (en cours), ENCHERE_FINIE (a regler), LIBRE (pas en vente). */
export function statutSkin(s, t) {
  if (!s || !s.enVente) return 'LIBRE';
  if (!s.enchere) return 'FIXE';
  return Number(t) >= Number(s.fin) ? 'ENCHERE_FINIE' : 'ENCHERE';
}
/** Le statut dit a l ecran (anglais). */
export const SKM_STATUTS = Object.freeze({ LIBRE: 'not listed', FIXE: 'for sale at a fixed price', ENCHERE: 'in auction', ENCHERE_FINIE: 'auction ended' });
/** Les skins d un filtre. « mine » sans compte = rien (on ne devine pas un wallet). Un filtre inconnu = tout. */
export function filtrerSkins(skins, filtre, moi, t) {
  const l = Array.isArray(skins) ? skins : [], m = bas(moi);
  if (filtre === 'sale') return l.filter((s) => statutSkin(s, t) === 'FIXE');
  if (filtre === 'auction') return l.filter((s) => { const x = statutSkin(s, t); return x === 'ENCHERE' || x === 'ENCHERE_FINIE'; });
  if (filtre === 'unlisted') return l.filter((s) => statutSkin(s, t) === 'LIBRE');
  if (filtre === 'mine') return ADR.test(m) ? l.filter((s) => s.detenteur === m) : [];
  return l.slice();
}
/** L ordre d affichage : encheres en cours (celle qui finit le plus tot d abord), encheres finies a regler, prix fixes (le moins cher
 *  d abord, a devise egale), puis les skins pas en vente (la plus recente d abord). Ne modifie pas la liste recue. */
export function ordonnerSkins(skins, t) {
  const rang = { ENCHERE: 0, ENCHERE_FINIE: 1, FIXE: 2, LIBRE: 3 };
  const cmpBig = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return (Array.isArray(skins) ? skins : []).slice().sort((a, b) => {
    const ra = rang[statutSkin(a, t)], rb = rang[statutSkin(b, t)];
    if (ra !== rb) return ra - rb;
    if (ra === 0) return Number(a.fin) - Number(b.fin) || cmpBig(BigInt(a.tokenId), BigInt(b.tokenId));
    if (ra === 2 && a.devise === b.devise) return cmpBig(BigInt(a.prix), BigInt(b.prix)) || cmpBig(BigInt(a.tokenId), BigInt(b.tokenId));
    if (ra === 3) return cmpBig(BigInt(b.tokenId), BigInt(a.tokenId));
    return cmpBig(BigInt(a.tokenId), BigInt(b.tokenId));
  });
}
/** Les compteurs de l en-tete, lus dans la liste (jamais tapes). */
export function compterSkins(skins, t) {
  const c = { total: 0, fixe: 0, enchere: 0, finie: 0, libre: 0 };
  for (const s of Array.isArray(skins) ? skins : []) {
    c.total += 1;
    const x = statutSkin(s, t);
    if (x === 'FIXE') c.fixe += 1; else if (x === 'ENCHERE') c.enchere += 1; else if (x === 'ENCHERE_FINIE') c.finie += 1; else c.libre += 1;
  }
  return c;
}
/** Les libelles des gestes (anglais, a l ecran). Les CLES sont celles de actionsSkin ; aucun geste n est ajoute ici. */
export const SKM_LIBELLES = Object.freeze({
  ACHETER: 'Buy', ENCHERIR: 'Bid', REGLER: 'Settle ended auction', RETIRER: 'Cancel listing', METTRE_EN_VENTE: 'Sell', OUVRIR_ENCHERE: 'Start an auction',
});
/** Les gestes de ce compte sur cette skin, maintenant : EXACTEMENT actionsSkin (le contrat), avec leur libelle. */
export function gestesSkin(s, moi, t) {
  return actionsSkin(s, moi, t).map((g) => ({ genre: g, libelle: SKM_LIBELLES[g] }));
}
/** Le montant d une offre : le minimum du contrat (offreMinimale : ouverture, ou +5 % strictement au-dessus) si rien n est tape ;
 *  sinon le montant tape, REFUSE s il est sous ce minimum (le contrat le refuserait). */
export function montantOffre(s, saisi) {
  const min = offreMinimale(s);
  if (saisi === null || saisi === undefined || saisi === '') return min;
  const x = BigInt(saisi);
  if (x < min) throw new Error('a bid must be at least the minimum shown (+5% over the highest bid)');
  return x;
}
/** Une cle qui change quand la LIGNE doit etre repeinte (statut, prix, offre, encherisseur, fin, detenteur, ce compte, ses gestes).
 *  Le temps restant n y est pas : il se met a jour sans repeindre la ligne (un prix tape ne s efface pas a chaque relecture). */
export function cleLigneSkin(s, moi, t) {
  return [String(s.tokenId), statutSkin(s, t), s.detenteur, s.block, s.devise, String(s.prix), String(s.offre), s.encherisseur, String(s.fin), bas(moi), actionsSkin(s, moi, t).join('+')].join('|');
}
/** Les encheres dont l OFFRE a change depuis la lecture precedente (`avant` : Map tokenId -> offre, ou null a la premiere lecture —
 *  alors aucun pouls : une premiere lecture n est pas « une nouvelle offre »). Rend { changees: Set(tokenId texte), apres: Map }. */
export function offresChangees(avant, skins) {
  const apres = new Map(), changees = new Set();
  for (const s of Array.isArray(skins) ? skins : []) {
    if (!s || !s.enVente || !s.enchere) continue;
    const id = String(s.tokenId), o = BigInt(s.offre || 0);
    apres.set(id, o);
    if (avant instanceof Map && avant.has(id) && avant.get(id) !== o && o > 0n) changees.add(id);
  }
  return { changees, apres };
}
/** Des unites brutes -> texte EXACT (« 0.00105 ») : aucune decimale coupee — un minimum d offre affiche arrondi vers le bas serait
 *  refuse par le contrat une fois retape. */
export function brutVersTexte(brut, dec) {
  const d = Number(dec), x = BigInt(brut);
  if (!Number.isInteger(d) || d < 0 || x < 0n) throw new Error('raw units and decimals are required');
  if (d === 0) return x.toString();
  const s = x.toString().padStart(d + 1, '0'), f = s.slice(s.length - d).replace(/0+$/, '');
  return s.slice(0, s.length - d) + (f ? '.' + f : '');
}
/** Un temps restant court (secondes) : « 2 d 3 h », « 4 h 12 min », « 7 min », « ended ». */
export function tempsRestant(fin, t) {
  const n = Math.floor(Number(fin) - Number(t));
  if (!Number.isFinite(n) || n <= 0) return 'ended';
  if (n >= 86400) return Math.floor(n / 86400) + ' d ' + Math.floor((n % 86400) / 3600) + ' h';
  if (n >= 3600) return Math.floor(n / 3600) + ' h ' + Math.floor((n % 3600) / 60) + ' min';
  return Math.max(1, Math.ceil(n / 60)) + ' min';
}
const teinte = (v) => { const x = Math.trunc(Number(v)); return Number.isFinite(x) ? ((x % 360) + 360) % 360 : 0; };
/** L APERCU DE LA FACE d une skin : un SVG fait de ses SEPT teintes (fond, anneau a trois teintes tourne de `angle`, aretes du cube,
 *  noyau) — les memes que le panneau porte (bcSkinDepuisRecette). Seuls des ENTIERS 0..359 entrent dans le texte (la recette lue sur la
 *  chaine tient sur 9 bits : 0..511, ramene modulo 360) : aucune chaine venue d ailleurs n est inseree. */
export function apercuSkinFormes(r) {
  const f = teinte(r && r.fond), a = teinte(r && r.angle), h = (r && Array.isArray(r.h) ? r.h : [0, 0, 0]).slice(0, 3).map(teinte);
  while (h.length < 3) h.push(0);
  const c = teinte(r && r.cube), n = teinte(r && r.noyau);
  const arc = (k, hue) => ['path', { d: 'M24 6 A18 18 0 0 1 41.73 27.13', transform: 'rotate(' + (a + k * 120) + ' 24 24)', stroke: 'hsl(' + hue + ' 90% 58%)', 'stroke-width': '5', fill: 'none', 'stroke-linecap': 'round' }];
  return [
    ['rect', { width: '48', height: '48', rx: '9', fill: 'hsl(' + f + ' 45% 14%)' }],
    arc(0, h[0]), arc(1, h[1]), arc(2, h[2]),
    ['rect', { x: '15', y: '15', width: '18', height: '18', rx: '3', fill: 'hsl(' + f + ' 40% 20%)', stroke: 'hsl(' + c + ' 85% 60%)', 'stroke-width': '2' }],
    ['circle', { cx: '24', cy: '24', r: '4.5', fill: 'hsl(' + n + ' 90% 62%)' }],
  ];
}
/** Le meme apercu en texte SVG (pour les tests et un export) — l app, elle, construit les noeuds (createElementNS), jamais d innerHTML. */
export function apercuSkinSvg(r) {
  return '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true" focusable="false">'
    + apercuSkinFormes(r).map(([tag, at]) => '<' + tag + Object.entries(at).map(([k, v]) => ' ' + k + '="' + v + '"').join('') + '/>').join('') + '</svg>';
}
/** Ce qu on dit du detenteur : « you », ou l adresse courte (0x1234…abcd). Pendant une vente, le contrat garde la skin : on dit le VENDEUR. */
export function detenteurCourt(s, moi) {
  const d = bas(s && s.detenteur);
  if (ADR.test(bas(moi)) && d === bas(moi)) return 'you';
  return ADR.test(d) ? d.slice(0, 6) + '…' + d.slice(-4) : 'not read';
}
