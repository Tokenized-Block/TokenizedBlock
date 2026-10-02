/* PARTS DU BLOCK — split de Raksha 2026-10-02 10:21 (remplace ceux de 10:06 et 10:11).
 *
 * ⛔⛔ DRAPEAU OFF PAR DEFAUT : `RACHAT_DETENTEURS_ACTIVE = false` (nom de la demande de 10:06, garde tel quel).
 *   Drapeau OFF => planifierBloc rend EXACTEMENT la route de multipool.js : le 0,09 % EN VIGUEUR (FRAIS_BPS = 9,
 *   900 / 1e6) a a6cf, rien d autre. Ce 0,09 % n est PAS touche tant que Claude n a pas valide.
 *
 * Drapeau ON — CONFIG A PART `SPLIT_BLOC`, pour un swap dont le chemin porte un block inscrit ET son action :
 *   - 0,10 % au total, paye par le swapper ;
 *   - a6cf : 0,07 % = floor(m x 700 / 1e6), en PAY_PORTION 7 bps (7 / 1e4 == 700 / 1e6 exactement) ;
 *   - createur du block : 0,03 % = floor(m x 300 / 1e6), en TRANSFER exact, SEULEMENT s il tient
 *     balanceOf(createur, action) >= minimum fixe a la naissance (relevable, jamais baisse) ;
 *   - createur sous le minimum : ces 0,03 % vont au COLLATERAL verrouille du block (liquidite cote vente).
 *     Pas d autre part de collateral.
 *   - TOUT dans l ACTION appariee, au MEME noeud, dans la MEME tx (Claude 10:09 : le frais est deja l action,
 *     rien a « racheter » ensuite).
 *
 * Exactitude : a6cf = PAY_PORTION sur le solde REEL du routeur => exact au wei toujours. La part createur /
 *   collateral est un TRANSFER de floor(m x 300 / 1e6) : au noeud d ENTREE m est le montant signe (exact
 *   toujours) ; a un noeud intermediaire ou de sortie, m vient du devis sur le meme etat (exact au wei sur le
 *   fork, devis == execution ; en production un prix qui bouge decale CETTE part de 3 bps x l ecart, borne par la
 *   tolerance du minimum, a6cf restant exact). Une 2e PAY_PORTION en bips porterait sur le solde RESTANT.
 *
 * Le collateral est une adresse DERIVEE keccak256("TB-COLLATERAL-V0" ++ block), sans cle ni code : rien n en
 *   sort. Ce n est PAS encore de la liquidite active : il faudra un contrat qui ne sache QU ajouter de la
 *   liquidite cote vente. Non construit, non deploye. */
import { ADRESSES, FRAIS_BPS, FRAIS_PPM, BASE_PPM, BPS_A6CF_SPLIT_BLOC, noeud, estAdresse, rangFrais, cheminsCandidats, devisSaut,
  nommerRevert, construireRoute, planifier } from './multipool.js';
import { keccak256 } from './keccak.js';

export const RACHAT_DETENTEURS_ACTIVE = false;
/** LA CONFIG DU SPLIT (drapeau ON). a6cf en PAY_PORTION 7 bps (= 700 / 1e6 exactement), createur en TRANSFER exact. */
export const SPLIT_BLOC = Object.freeze({ a6cfPpm: 700n, a6cfBps: BPS_A6CF_SPLIT_BLOC, createurPpm: 300n });
export const PPM_CREATEUR = SPLIT_BLOC.createurPpm;
export const PPM_COLLATERAL = 0n; /* pas de part de collateral propre : il ne recoit QUE la part d un createur sous son minimum */
export const PPM_TOTAL = SPLIT_BLOC.a6cfPpm + SPLIT_BLOC.createurPpm;
if (PPM_TOTAL !== 1000n || SPLIT_BLOC.a6cfBps * BASE_PPM !== SPLIT_BLOC.a6cfPpm * 10000n) throw new Error('0,10 % = 700 + 300 sur 1e6, et 7 / 1e4 == 700 / 1e6');
if (FRAIS_PPM !== 900n || FRAIS_BPS !== 9n) throw new Error('le 0,09 % en vigueur ne doit pas bouger');

const bas = (a) => String(a || '').toLowerCase();
const hexDe = (o) => [...o].map((b) => b.toString(16).padStart(2, '0')).join('');

/** L adresse de collateral d un block : keccak256("TB-COLLATERAL-V0" ++ block), 20 derniers octets. */
export function adresseCollateral(block) {
  if (!estAdresse(block)) return null;
  const o = new Uint8Array([...new TextEncoder().encode('TB-COLLATERAL-V0'), ...bas(block).slice(2).match(/../g).map((h) => parseInt(h, 16))]);
  return '0x' + hexDe(keccak256(o)).slice(24);
}

/** Le registre : un block -> { action, createur, minimumCreateur, collateral }. */
export function nouveauRegistre() { return new Map(); }
export function inscrireBloc(reg, { block, action, createur, minimumCreateur }) {
  const b = bas(block), a = bas(action), c = bas(createur);
  if (!estAdresse(b) || !estAdresse(a) || !estAdresse(c)) return { etat: 'REFUSE', pourquoi: 'block, stock and creator must be addresses' };
  if (reg.has(b)) return { etat: 'REFUSE', pourquoi: 'the minimum is set ONCE, at birth' };
  if (typeof minimumCreateur !== 'bigint' || minimumCreateur <= 0n) return { etat: 'REFUSE', pourquoi: 'the creator minimum must be a positive bigint' };
  if (c === ADRESSES.FEE_WALLET) return { etat: 'REFUSE', pourquoi: 'the fee wallet cannot be a creator' };
  reg.set(b, Object.freeze({ block: b, action: a, createur: c, minimumCreateur, collateral: adresseCollateral(b) }));
  return { etat: 'OK', entree: reg.get(b) };
}
/** ⛔ RELEVER seulement : un minimum plus bas est REFUSE. */
export function releverMinimum(reg, block, nouveau) {
  const e = reg.get(bas(block));
  if (!e) return { etat: 'REFUSE', pourquoi: 'unknown block' };
  if (typeof nouveau !== 'bigint' || nouveau < e.minimumCreateur) return { etat: 'REFUSE', pourquoi: 'refused: the creator minimum can be raised, never lowered' };
  reg.set(e.block, Object.freeze({ ...e, minimumCreateur: nouveau }));
  return { etat: 'OK', entree: reg.get(e.block) };
}

/** Les montants au wei pour un solde m au noeud.
 *  Drapeau OFF : le 0,09 % en vigueur seul (a6cf floor(m x 900 / 1e6), createur 0, collateral 0).
 *  Drapeau ON  : a6cf floor(m x 700 / 1e6) ; createur floor(m x 300 / 1e6) s il tient >= minimum, sinon 0 et le
 *                collateral recoit floor(m x 300 / 1e6). */
export function montantsParts(m, { actif = RACHAT_DETENTEURS_ACTIVE, soldeCreateur = 0n, minimumCreateur = null } = {}) {
  const M = BigInt(m);
  if (!actif) { const a = (M * FRAIS_PPM) / BASE_PPM; return { a6cf: a, a6cfBps: FRAIS_BPS, createur: 0n, collateral: 0n, createurAuDessus: null, total: a }; }
  const a6cf = (M * SPLIT_BLOC.a6cfPpm) / BASE_PPM, c = (M * SPLIT_BLOC.createurPpm) / BASE_PPM;
  const auDessus = minimumCreateur !== null && BigInt(soldeCreateur) >= BigInt(minimumCreateur);
  return { a6cf, a6cfBps: SPLIT_BLOC.a6cfBps, createur: auDessus ? c : 0n, collateral: auDessus ? 0n : c, createurAuDessus: auDessus, total: a6cf + c };
}

/** Le noeud des parts : l ACTION appariee d un block inscrit, presente sur le chemin. Le 1er block du chemin gagne. */
export function noeudPartsBloc(chemin, reg, admises) {
  const noeuds = [chemin[0].de, ...chemin.map((s) => s.vers)].map(noeud);
  for (const n of noeuds) {
    const e = reg.get(n);
    if (!e) continue;
    const i = noeuds.indexOf(e.action);
    if (i < 0) continue;
    if (rangFrais(e.action, admises) === null) return { etat: 'REFUSE', pourquoi: 'the paired stock is not an admitted fee currency' };
    return { etat: 'OK', indice: i, entree: e };
  }
  return { etat: 'SANS_PART_BLOC', pourquoi: 'no registered block with its paired stock on this path' };
}

/** Cote un chemin en retirant TOUTES les parts au noeud `indice`. */
export async function coterAvecParts({ rpc, chemin, montant, indice, partsDe }) {
  let courant = BigInt(montant), m = null, parts = null;
  for (let i = 0; i <= chemin.length; i += 1) {
    if (i === indice) { m = courant; parts = partsDe(m); courant -= parts.total; }
    if (i === chemin.length) break;
    const q = devisSaut(chemin[i], courant);
    let r;
    try { r = await rpc('eth_call', [{ to: q.to, data: q.data }, 'latest']); }
    catch (err) { const n = nommerRevert(err); return { etat: n.liquidite ? 'SANS_LIQUIDITE' : 'NON_MESURE', pourquoi: 'hop ' + (i + 1) + ': ' + n.texte }; }
    const out = BigInt('0x' + String(r).slice(2, 66));
    if (out <= 0n) return { etat: 'REFUSE', pourquoi: 'hop ' + (i + 1) + ' returns nothing' };
    courant = out;
  }
  return { etat: 'OK', sortie: courant, m, parts };
}

/** La route d un plan de parts : a6cf en PAY_PORTION 9 bps, puis les TRANSFER exacts (createur s il y a lieu, collateral). */
export function routeParts({ chemin, montant, minSortie, destinataire, deadline, indice, admises, entree, parts }) {
  const exactes = [];
  if (parts.createur > 0n) exactes.push({ qui: entree.createur, montant: parts.createur });
  if (parts.collateral > 0n) exactes.push({ qui: entree.collateral, montant: parts.collateral });
  return construireRoute({ chemin, montant, minSortie, destinataire, deadline, fraisIndice: indice, admises,
    partsFrais: [{ qui: ADRESSES.FEE_WALLET, bps: parts.a6cfBps }], partsExactes: exactes, bpsA6cf: parts.a6cfBps });
}

/**
 * LE PLAN. Drapeau OFF => `planifier` de multipool.js tel quel (0,09 %). Drapeau ON => pour chaque chemin
 * candidat qui porte un block inscrit ET son action : parts au noeud de l action ; sinon le chemin garde le
 * 0,09 % seul (et on le DIT). Le meilleur = la plus grosse sortie APRES toutes les parts. Le minimum (tolerance)
 * porte sur cette sortie : il est donc applique APRES les deux parts.
 * `soldeCreateur(createur, action)` : lecture balanceOf injectee (le banc lit la chaine).
 */
export async function planifierBloc({ rpc, aretes, de, vers, montant, destinataire, admises, registre, soldeCreateur,
  actif = RACHAT_DETENTEURS_ACTIVE, toleranceBps = 100n, deadline, sautsMax = 3, max = 12 }) {
  if (!actif) return { ...(await planifier({ rpc, aretes, de, vers, montant, destinataire, admises, toleranceBps, deadline, sautsMax, max })), partsBloc: null };
  const cands = cheminsCandidats(aretes, de, vers, { sautsMax, max });
  const essais = [];
  for (const ch of cands) {
    const np = noeudPartsBloc(ch, registre, admises);
    if (np.etat !== 'OK') { essais.push({ chemin: ch, etat: np.etat, pourquoi: np.pourquoi }); continue; }
    const solde = await soldeCreateur(np.entree.createur, np.entree.action);
    const q = await coterAvecParts({ rpc, chemin: ch, montant, indice: np.indice,
      partsDe: (m) => montantsParts(m, { actif: true, soldeCreateur: solde, minimumCreateur: np.entree.minimumCreateur }) });
    essais.push({ chemin: ch, ...q, indice: np.indice, entree: np.entree, soldeCreateur: solde });
  }
  const bons = essais.filter((x) => x.etat === 'OK').sort((a, b) => (b.sortie > a.sortie ? 1 : b.sortie < a.sortie ? -1 : 0));
  if (!bons.length) {
    /* aucun chemin a parts : on retombe sur le 0,09 % seul, NOMME */
    const p = await planifier({ rpc, aretes, de, vers, montant, destinataire, admises, toleranceBps, deadline, sautsMax, max });
    return { ...p, partsBloc: { etat: 'SANS_PART_BLOC', essais } };
  }
  const best = bons[0];
  const minSortie = (best.sortie * (10000n - BigInt(toleranceBps))) / 10000n;
  const tx = routeParts({ chemin: best.chemin, montant, minSortie, destinataire, deadline, indice: best.indice, admises, entree: best.entree, parts: best.parts });
  return { etat: tx.etat === 'PRET' ? 'PRET' : 'REFUSE', pourquoi: tx.pourquoi || null, minSortie, tx, essais,
    meilleur: { chemin: best.chemin, sortie: best.sortie, frais: best.parts.a6cf, fraisIndice: best.indice },
    partsBloc: { etat: 'OK', m: best.m, parts: best.parts, entree: best.entree, soldeCreateur: best.soldeCreateur } };
}
