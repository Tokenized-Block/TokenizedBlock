/* niveaux-jeu.js — LES NIVEAUX DU BRAIN, GAGNES EN JOUANT (2026-10-18). PUR : aucun reseau, aucune horloge, aucune cle.
 *
 * ⛔ XP SEULEMENT POUR DES GESTES VERIFIES PAR LE SERVEUR :
 *   - jour_ticket  : un jour UTC (passe ou aujourd hui) ou le wallet tenait le ticket du jour (tirage-saison.js ticketsJour : volume verifie
 *                    >= 10 $ OU pass couvrant le jour) — lu dans revenu.jours / revenu.passes, jamais dans une requete ;
 *   - roll         : un Rolled PAYE (withPass = false) emis par NOTRE BlockRolls (adresse du log comparee) ; un roll sur pass ne compte pas
 *                    deux fois : le pass compte a son achat ;
 *   - settle       : un Settled emis par NOTRE BlockRolls (au joueur du roll, quel que soit celui qui a regle) ;
 *   - pass_semaine : un PassBought emis par NOTRE BlockRolls ;
 *   - skin         : un SkinMinted (au minter) ou un Sold (a l acheteur) emis par NOTRE BlockSkins actif ;
 *   - mission      : un TaskClaimed (au completer) emis par NOTRE BlockMissions — CROCHET SEULEMENT : aucune adresse deployee aujourd hui,
 *                    donc la source est nulle et rien n est lu.
 *   ⛔ Un evenement n est pas une transaction : seul l emetteur du log (log.address) fait foi, et ce sont NOS contrats, qui n emettent
 *     qu apres avoir encaisse / regle. Un log d une autre adresse, d un autre topic, ou mal forme est IGNORE (jamais devine).
 *   ⛔ Les rolls PRACTICE (/api/jeu/rolls) ne portent aucun wallet : aucune preuve, AUCUN XP. Il n y a pas d action « practice » dans la
 *     table, et une action inconnue vaut 0.
 *
 * LES TABLES (une seule source ; test-niveaux-jeu les epingle) :
 *   XP_PAR_ACTION : jour_ticket 3 · roll 1 · settle 1 · pass_semaine 5 · skin 5 · mission 3
 *   NIVEAUX_XP    : L1 0 · L2 10 · L3 30 · L4 70 · L5 150 · L6 310 · L7 630 · L8 1270 · L9 2550 · L10 5110 (chaque marche double : +10, +20, +40…)
 *   PERKS_NIVEAU  : L3 -> +1 entree au tirage de la SEMAINE · L6 -> +2 (plafond BONUS_NIVEAU_MAX = 2, tirage-saison.js). Seulement pour un
 *                   wallet qui a AU MOINS une entree de jour cette semaine-la (pas d entree -> pas de bonus). Le tirage de la semaine reste
 *                   une saison practice (pas de pot) : le perk est reel cote serveur (entrees publiques, rejouables), il ne paie rien de plus
 *                   qu une entree. */
import { topic } from './keccak.js';
import { EV_ROLLED, EV_SETTLED, EV_PASS_BOUGHT } from './blockrolls-plan.js';
import { ticketsJour, SEUIL_VOLUME_JOUR_USD, BONUS_NIVEAU_MAX } from './tirage-saison.js';

export const XP_PAR_ACTION = Object.freeze({ jour_ticket: 3, roll: 1, settle: 1, pass_semaine: 5, skin: 5, mission: 3 });
export const NIVEAUX_XP = Object.freeze([0, 10, 30, 70, 150, 310, 630, 1270, 2550, 5110]);
export const PERKS_NIVEAU = Object.freeze([Object.freeze({ niveau: 3, entrees: 1 }), Object.freeze({ niveau: 6, entrees: 2 })]);
export { BONUS_NIVEAU_MAX };

export const EV_SKIN_MINTED = 'SkinMinted(uint256,address,address,uint64)';
export const EV_SKIN_SOLD = 'Sold(uint256,address,address,address,uint256,uint256)';
export const EV_TASK_CLAIMED = 'TaskClaimed(uint256,address,bytes32,uint256,uint256,uint256,uint256)';
export const TOPICS_XP = Object.freeze({
  rolled: topic(EV_ROLLED), settled: topic(EV_SETTLED), pass: topic(EV_PASS_BOUGHT),
  skinMinted: topic(EV_SKIN_MINTED), skinSold: topic(EV_SKIN_SOLD), taskClaimed: topic(EV_TASK_CLAIMED),
});

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const adrDe = (t) => '0x' + bas(t).replace(/^0x/, '').slice(-40);
const mots = (data) => { const h = String(data || '').replace(/^0x/, ''); return /^[0-9a-fA-F]*$/.test(h) && h.length % 64 === 0 ? h.match(/.{64}/g) || [] : null; };

/** xp d un tableau de compteurs { action: n } : seules les actions de la table, n entier >= 0. Inconnue / illisible -> 0. */
export function xpDe(compteurs) {
  let xp = 0;
  for (const [a, n] of Object.entries(compteurs && typeof compteurs === 'object' ? compteurs : {})) {
    if (!Object.prototype.hasOwnProperty.call(XP_PAR_ACTION, a) || !Number.isSafeInteger(n) || n <= 0) continue;
    xp += XP_PAR_ACTION[a] * n;
  }
  return xp;
}

/** le niveau d un xp : { level (1..10), xp, base (seuil du niveau), next (seuil du suivant, null au dernier) }. xp illisible -> 0. */
export function niveauDe(xp) {
  const x = Number.isSafeInteger(xp) && xp > 0 ? xp : 0;
  let i = 0;
  while (i + 1 < NIVEAUX_XP.length && x >= NIVEAUX_XP[i + 1]) i++;
  return { level: i + 1, xp: x, base: NIVEAUX_XP[i], next: i + 1 < NIVEAUX_XP.length ? NIVEAUX_XP[i + 1] : null };
}

/** les entrees bonus du tirage de la semaine pour un niveau : 0, 1 (L3+), 2 (L6+) ; jamais au-dessus de BONUS_NIVEAU_MAX */
export function entreesBonusNiveau(level) {
  let n = 0;
  for (const p of PERKS_NIVEAU) if (Number.isInteger(level) && level >= p.niveau) n = p.entrees;
  return Math.min(n, BONUS_NIVEAU_MAX);
}

/**
 * logs eth_getLogs -> actions verifiees [{ cle, wallet, action }]. `sources` = { rolls, skins, missions } (adresses de NOS contrats ;
 * null = source fermee). cle = 'tx:logIndex' (un log ne compte qu une fois). Tout log hors source, hors topic ou mal forme est ignore.
 */
export function actionsDesLogs(logs, sources = {}) {
  const r = ADR.test(bas(sources.rolls)) ? bas(sources.rolls) : null;
  const s = ADR.test(bas(sources.skins)) ? bas(sources.skins) : null;
  const m = ADR.test(bas(sources.missions)) ? bas(sources.missions) : null;
  const out = [];
  for (const l of Array.isArray(logs) ? logs : []) {
    if (!l || !Array.isArray(l.topics) || !/^0x[0-9a-f]{64}$/i.test(String(l.transactionHash || ''))) continue;
    let idx; try { idx = Number(BigInt(l.logIndex)); } catch (_) { continue; }
    if (!Number.isSafeInteger(idx) || idx < 0) continue;
    const emetteur = bas(l.address), t0 = bas(l.topics[0]), w = mots(l.data);
    if (w === null) continue;
    let wallet = null, action = null;
    if (r && emetteur === r) {
      if (t0 === TOPICS_XP.rolled && l.topics.length === 3 && w.length === 9) { if (BigInt('0x' + w[6]) === 0n) { wallet = adrDe(l.topics[2]); action = 'roll'; } }
      else if (t0 === TOPICS_XP.settled && l.topics.length === 3 && w.length === 9) { wallet = adrDe(l.topics[2]); action = 'settle'; }
      else if (t0 === TOPICS_XP.pass && l.topics.length === 3 && w.length === 4) { wallet = adrDe(l.topics[1]); action = 'pass_semaine'; }
    } else if (s && emetteur === s) {
      if (t0 === TOPICS_XP.skinMinted && l.topics.length === 4 && w.length === 1) { wallet = adrDe(l.topics[2]); action = 'skin'; }
      else if (t0 === TOPICS_XP.skinSold && l.topics.length === 4 && w.length === 3) { wallet = adrDe(l.topics[3]); action = 'skin'; }
    } else if (m && emetteur === m) {
      if (t0 === TOPICS_XP.taskClaimed && l.topics.length === 4 && w.length === 4) { wallet = adrDe(l.topics[2]); action = 'mission'; }
    }
    if (!action || !ADR.test(wallet) || /^0x0{40}$/.test(wallet)) continue;
    out.push({ cle: bas(l.transactionHash) + ':' + idx, wallet, action });
  }
  return out;
}

/** crediter des actions : etat { xp: { wallet: { action: n } }, vus: { cle: 1 } } -> NOUVEL etat ; une cle deja vue ne recompte pas */
export function crediterActions(etat, actions) {
  const xp = { ...((etat && etat.xp) || {}) }, vus = { ...((etat && etat.vus) || {}) };
  for (const a of Array.isArray(actions) ? actions : []) {
    if (!a || !ADR.test(bas(a.wallet)) || !Object.prototype.hasOwnProperty.call(XP_PAR_ACTION, a.action) || a.action === 'jour_ticket' || typeof a.cle !== 'string' || vus[a.cle]) continue;
    vus[a.cle] = 1;
    const w = bas(a.wallet);
    xp[w] = { ...(xp[w] || {}), [a.action]: ((xp[w] || {})[a.action] || 0) + 1 };
  }
  return { xp, vus };
}

/** jours avec ticket par wallet : chaque jour connu (revenu.jours + jours des passes) <= `jusqua` (id 'JYYYY-MM-DD', inclus). { wallet: n } */
export function joursTicketParWallet(jours, passes, jusqua, seuil = SEUIL_VOLUME_JOUR_USD) {
  const ids = new Set(Object.keys(jours || {}));
  for (const l of Object.values(passes || {})) if (Array.isArray(l)) for (const j of l) ids.add(String(j));
  const out = {};
  for (const id of ids) {
    if (!/^J\d{4}-\d{2}-\d{2}$/.test(id) || !(id <= String(jusqua))) continue;
    for (const a of ticketsJour(jours || {}, id, passes || {}, seuil)) out[a] = (out[a] || 0) + 1;
  }
  return out;
}

/** le niveau d un wallet : compteurs du registre XP + jours avec ticket -> { xp, level, base, next, detail, perk: { entrees } } */
export function niveauWallet({ compteurs = {}, joursTicket = 0 } = {}) {
  const detail = {};
  for (const a of Object.keys(XP_PAR_ACTION)) detail[a] = 0;
  for (const [a, n] of Object.entries(compteurs || {})) if (a in detail && a !== 'jour_ticket' && Number.isSafeInteger(n) && n > 0) detail[a] = n;
  detail.jour_ticket = Number.isSafeInteger(joursTicket) && joursTicket > 0 ? joursTicket : 0;
  const nv = niveauDe(xpDe(detail));
  return { ...nv, detail, perk: { entrees: entreesBonusNiveau(nv.level) } };
}

/** les bonus de niveau d une semaine : { wallet: n } pour les wallets qui ont AU MOINS une entree de jour dans `entreesJour`. */
export function bonusNiveauxSemaine(entreesJour, niveauDuWallet) {
  const out = {};
  const avec = new Set((entreesJour || []).filter((e) => e && e.bonus !== true && /^J\d{4}-\d{2}-\d{2}$/.test(String(e.jour))).map((e) => bas(e.adresse)).filter((a) => ADR.test(a)));
  for (const a of [...avec].sort()) { const n = entreesBonusNiveau(niveauDuWallet(a)); if (n > 0) out[a] = n; }
  return out;
}
