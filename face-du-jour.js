/* face-du-jour.js — FACE OF THE DAY (Phil 2026-10-17 soir : « le ticket est une face pre-faite pour fitter avec le prochain block » ;
 * conception : workflow guess-next-block-design, 3 designs + 2 juges -> « Face of the Day »). PUR : aucun reseau, aucune signature.
 * ⛔ POURQUOI PAS « LE PROCHAIN BLOCK NE » : le createur d un block CHOISIT sa face (et peut moudre le sel CREATE2) — un 3/3 force coutait
 *   ~0,001 ETH + ~1 $ (juge « abus »). La face du jour vient du HASH d un bloc Base FIXE A L AVANCE (le premier bloc horodate >= cloture
 *   du jour + 120 s) : ni un createur, ni le serveur, ni un joueur n y ont prise (seul le sequenceur de Base, comme pour le tirage).
 * Le ticket du joueur = la face d une adresse derivee de (wallet, jour) par SHA-256 (app.html adresseTicket) : pre-faite, sans choix,
 *   donc sans signature. Le score = traits en commun sur 5 (bande de couleur, orbite, facette, matiere, ornement) ; la distance de teinte
 *   (0-180 deg) dit « presque » quand le score est bas. AUCUN prix n est attache au score (practice) : l ecran le dit. */
import { apparenceDepuisAdresse } from './apparence.js';

export const DELAI_REVELATION_S = 120;
/** le bloc E : le PREMIER bloc dont l horodatage est >= cibleTs (s). rpc injecte. Estimation au temps de bloc `sParBloc` (MESURE par
 *  l appelant ; 2 s sinon) depuis la tete, puis recherche exacte : descente par pas DOUBLES jusqu a un bloc AVANT la cible (verifie), puis
 *  (estimation juste) remontee par pas doubles pour resserrer, puis dichotomie. Rend { bloc, ts, hash } ; la cible pas encore atteinte ->
 *  null (rien d invente) ; le bloc 0 deja >= cible -> le bloc 0.
 *  ⛔ DENIM (2026-10-23) : la descente par pas croissants de 50 (~41 000 blocs au plus) ne rejoignait pas une cible estimee a 2 s/bloc quand
 *  les blocs font 200 ms (20 h = 360 000 blocs) ; la dichotomie partait d un `lo` APRES la cible et rendait un bloc E FAUX
 *  (test-face-du-jour-denim-20261023.mjs). Le pas double atteint tout recul en ~40 lectures, et `lo` est VERIFIE avant la dichotomie. */
export async function premierBlocApres(rpc, cibleTs, { sParBloc = 2 } = {}) {
  const lire = async (b) => { const r = await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]); return { bloc: b, ts: parseInt(r.timestamp, 16), hash: String(r.hash).toLowerCase() }; };
  const tete = parseInt(await rpc('eth_blockNumber', []), 16);
  const t = await lire(tete);
  if (t.ts < cibleTs) return null;
  const s = Number.isFinite(sParBloc) && sParBloc > 0 ? sParBloc : 2;
  let hi = tete, lo = Math.max(0, tete - Math.ceil((t.ts - cibleTs) / s) - 2); /* lo : ts < cible (VERIFIE ci-dessous), hi : ts >= cible */
  /* descente : 64, 128, 256… blocs — atteint le bloc 0 en ~40 pas, quel que soit l ecart d estimation ; si le bloc 0 est deja >= cible, hi = 0 */
  let descendu = false;
  for (let pas = 64; ; pas *= 2) {
    const x = await lire(lo);
    if (x.ts < cibleTs) break;
    hi = lo; descendu = true;
    if (lo === 0) return lire(0);
    lo = Math.max(0, lo - pas);
  }
  /* estimation juste (lo avant la cible du premier coup) : on remonte par pas doubles pour resserrer hi, au lieu de couper [lo, tete] */
  if (!descendu) {
    for (let pas = 64; lo + pas < hi; pas *= 2) { const x = await lire(lo + pas); if (x.ts >= cibleTs) { hi = lo + pas; break; } lo += pas; }
  }
  for (let k = 0; k < 64 && hi - lo > 1; k++) { const mi = Math.floor((lo + hi) / 2); if ((await lire(mi)).ts >= cibleTs) hi = mi; else lo = mi; }
  return lire(hi);
}

/** la face revelee par un hash de bloc : les 20 premiers octets du hash, lus comme une adresse, passent par apparenceDepuisAdresse */
export function faceRevelee(hashE) {
  const h = String(hashE || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(h)) return null;
  return apparenceDepuisAdresse('0x' + h.slice(2, 42));
}
/** 6 bandes de couleur (rouge, jaune, vert, cyan, bleu, violet) : la teinte a 0-360 deg, centree sur les primaires */
export const BANDES = Object.freeze(['red', 'yellow', 'green', 'cyan', 'blue', 'violet']);
export const bandeTeinte = (teinte) => BANDES[Math.floor(((Number(teinte) + 30) % 360) / 60)];
/** distance circulaire de teinte, 0-180 */
export const ecartTeinte = (a, b) => { const d = Math.abs(Number(a) - Number(b)) % 360; return Math.min(d, 360 - d); };
/** le score : traits en commun sur 5, et lesquels ; la teinte a cote */
export function scoreFaces(ticket, revelee) {
  if (!ticket || !revelee) return null;
  const traits = {
    color: bandeTeinte(ticket.teinte) === bandeTeinte(revelee.teinte),
    orbit: ticket.orbite === revelee.orbite,
    facet: ticket.facette === revelee.facette,
    material: ticket.matiere === revelee.matiere,
    ornament: ticket.ornement === revelee.ornement,
  };
  return { score: Object.values(traits).filter(Boolean).length, sur: 5, traits, ecartTeinte: ecartTeinte(ticket.teinte, revelee.teinte) };
}
