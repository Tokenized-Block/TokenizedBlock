/* journal-jeu.js — LE JOURNAL DU JOUR DU JEU (Phil 2026-10-18 : « les brains sont les occupants de la Map »). PUR : des logs lus sur NOS
 *   contrats (BlockRolls, BlockSkins) + les rolls practice du serveur -> des evenements courts, dates, du plus recent au plus ancien.
 *
 * ⛔ UN EVENEMENT N EST PAS UNE TRANSACTION, SAUF QUAND IL VIENT DE NOTRE CONTRAT : chaque genre de log n est lu QUE s il vient de
 *   l adresse du contrat qui l emet (Rolled / Settled / PassBought -> BlockRolls ; SkinMinted / Listed / Bid / Sold -> BlockSkins). Le meme
 *   topic emis par n importe quel autre contrat est IGNORE. Un wallet lu dans un topic doit etre un mot de 32 octets dont les 12 premiers
 *   sont nuls (une adresse encodee), et pas l adresse 0 : sinon le log est ignore, jamais « corrige ».
 * ⛔ RIEN N EST INVENTE : un log illisible est compte (`illisibles`) et ignore ; un log sans horodatage de bloc n est pas date au hasard,
 *   il est compte dans `sansHeure` (le serveur ne fait alors PAS avancer son curseur et relit la fenetre). Un montant d enchere dont la
 *   devise n a pas ete vue (Listed hors fenetre) n est pas ecrit : « bid on skin #12 », sans chiffre.
 * ⛔ DE-DOUBLONNE par (transaction, logIndex) : deux lectures qui se chevauchent ne doublent jamais une ligne.
 * Les montants sont en unites brutes (USDC 6 decimales, ETH 18) ; le texte les ecrit tronques, jamais arrondis vers le haut. */
import { topic } from './keccak.js';
import { EV_ROLLED, EV_SETTLED, EV_PASS_BOUGHT } from './blockrolls-plan.js';

export const JOURNAL_MAX = 100;
/** Les genres d evenement. `duel` est RESERVE (crochet type) : aucune source ne l emet aujourd hui — voir SOURCE_DUELS. */
export const GENRES = Object.freeze(['roll', 'settled', 'pass', 'skin_minted', 'skin_bid', 'skin_sold', 'practice', 'duel']);
/** ⛔ CROCHET DES DUELS : null tant qu aucun contrat de duel n est deploye. Un lecteur de duels rendra des evenements de genre 'duel'
 *  ({ id, t, kind:'duel', wallet, text, tx, baseBlock, logIndex }) que fusionnerJournal accepte deja ; d ici la, rien n est lu ni montre. */
export const SOURCE_DUELS = null;

export const EV_SKIN_MINTED = 'SkinMinted(uint256,address,address,uint64)';
export const EV_SKIN_LISTED = 'Listed(uint256,address,address,uint256,uint64)';
export const EV_SKIN_BID = 'Bid(uint256,address,uint256,uint64)';
export const EV_SKIN_SOLD = 'Sold(uint256,address,address,address,uint256,uint256)';
export const T_ROLLED = topic(EV_ROLLED), T_SETTLED = topic(EV_SETTLED), T_PASS = topic(EV_PASS_BOUGHT);
export const T_MINTED = topic(EV_SKIN_MINTED), T_LISTED = topic(EV_SKIN_LISTED), T_BID = topic(EV_SKIN_BID), T_SOLD = topic(EV_SKIN_SOLD);
export const TOPICS_ROLLS = Object.freeze([T_ROLLED, T_SETTLED, T_PASS]);
export const TOPICS_SKINS = Object.freeze([T_MINTED, T_LISTED, T_BID, T_SOLD]);

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const ZERO = '0x' + '0'.repeat(40);
const mots = (data) => {
  const h = bas(data).replace(/^0x/, '');
  if (!/^([0-9a-f]{64})*$/.test(h)) return null;
  return (h.match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
};
/** un topic -> une adresse, SEULEMENT s il encode une adresse (12 octets nuls devant) et pas 0 ; sinon null */
export function adresseDuTopic(t) {
  const h = bas(t);
  if (!/^0x0{24}[0-9a-f]{40}$/.test(h)) return null;
  const a = '0x' + h.slice(-40);
  return a === ZERO ? null : a;
}
const entier = (x) => { try { const n = Number(BigInt(x)); return Number.isSafeInteger(n) && n >= 0 ? n : null; } catch (_) { return null; } };
const idTopic = (t) => (/^0x[0-9a-f]{64}$/.test(bas(t)) ? BigInt(bas(t)).toString() : null);
const motVersAdresse = (w) => '0x' + w.toString(16).padStart(40, '0').slice(-40);
export const court = (a) => (ADR.test(bas(a)) ? bas(a).slice(0, 6) + '…' + bas(a).slice(-4) : '—');
export const numeroBloc = (n) => Number(n).toLocaleString('en-US');
/** brut -> texte tronque a `max` decimales (sans zeros inutiles au-dela de 2) */
export function montantTexte(brut, dec, max = dec <= 6 ? 2 : 6) {
  const b = BigInt(brut), un = 10n ** BigInt(dec);
  const ent = b / un, frac = (b % un).toString().padStart(dec, '0').slice(0, max);
  let f = frac.replace(/0+$/, '');
  if (f.length < 2) f = (f + '00').slice(0, Math.min(2, max));
  return ent.toString() + (f ? '.' + f : '');
}

/**
 * @param {Array} logs  logs bruts d eth_getLogs
 * @param {{ rolls?: string|null, skins?: string|null }} contrats  NOS adresses ; un genre dont l adresse manque n est pas lu
 * @param {{ horodatage: (bloc:number)=>number|null, cibles?: Map<string,number>, devisesListees?: Map<string,string>,
 *           devises?: Object<string,{sym:string,dec:number}> }} ctx
 *   horodatage : secondes du bloc (null = inconnu) ; cibles : rollId -> targetBlock deja vus ; devisesListees : tokenId -> devise deja vue
 * @returns {{ evenements: Array, cibles: Array<[string,number]>, devisesListees: Array<[string,string]>, illisibles: number, sansHeure: number }}
 *   cibles / devisesListees : les associations NOUVELLES lues ici (le serveur les garde) ; rien n est mute.
 */
export function lireEvenementsJeu(logs, contrats, ctx) {
  const rolls = ADR.test(bas(contrats && contrats.rolls)) ? bas(contrats.rolls) : null;
  const skins = ADR.test(bas(contrats && contrats.skins)) ? bas(contrats.skins) : null;
  const horo = ctx && typeof ctx.horodatage === 'function' ? ctx.horodatage : () => null;
  const cibles = new Map(ctx && ctx.cibles ? ctx.cibles : []), devisesL = new Map(ctx && ctx.devisesListees ? ctx.devisesListees : []);
  const devises = (ctx && ctx.devises) || {};
  const nouvellesCibles = [], nouvellesDevises = [], vus = new Set(), out = [];
  let illisibles = 0, sansHeure = 0;
  /* l ordre de la chaine (bloc, logIndex) : un Listed ou un Rolled d une fenetre sert aux Bid / Settled qui le suivent */
  const tries = (Array.isArray(logs) ? logs : []).map((l) => ({ l, b: entier(l && l.blockNumber), i: entier(l && l.logIndex) }))
    .filter((x) => x.b !== null && x.i !== null).sort((x, y) => x.b - y.b || x.i - y.i);
  illisibles += (Array.isArray(logs) ? logs.length : 0) - tries.length;
  for (const { l, b, i } of tries) {
    const adr = bas(l.address), t0 = bas(l.topics && l.topics[0]), tx = bas(l.transactionHash);
    if (!Array.isArray(l.topics) || !/^0x[0-9a-f]{64}$/.test(tx)) { illisibles++; continue; }
    const deRolls = rolls !== null && adr === rolls && TOPICS_ROLLS.includes(t0);
    const deSkins = skins !== null && adr === skins && TOPICS_SKINS.includes(t0);
    if (!deRolls && !deSkins) continue; /* un autre contrat, ou un autre evenement : pas le notre */
    const id = tx + ':' + i;
    if (vus.has(id)) continue;
    const m = mots(l.data);
    if (m === null) { illisibles++; continue; }
    let e = null;
    if (t0 === T_ROLLED) {
      const w = adresseDuTopic(l.topics[2]), rid = idTopic(l.topics[1]);
      if (!w || rid === null || m.length !== 9) { illisibles++; continue; }
      const cible = entier(m[5]), avecPass = m[6] === 1n, paye = m[7] + m[8];
      if (cible !== null && !cibles.has(rid)) { cibles.set(rid, cible); nouvellesCibles.push([rid, cible]); }
      e = { kind: 'roll', wallet: w, rollId: rid, cible, text: court(w) + ' rolled' + (cible !== null ? ' on block ' + numeroBloc(cible) : '')
        + (avecPass ? ' · with the pass' : ' · ' + montantTexte(paye, 6) + ' USDC') };
    } else if (t0 === T_SETTLED) {
      const w = adresseDuTopic(l.topics[2]), rid = idTopic(l.topics[1]);
      if (!w || rid === null || m.length !== 9 || m[6] > 5n) { illisibles++; continue; }
      const score = Number(m[6]), gain = m[7], cible = cibles.has(rid) ? cibles.get(rid) : null;
      e = { kind: 'settled', wallet: w, rollId: rid, cible, score, payout: gain.toString(), text: court(w) + ' rolled ' + score + '/5'
        + (cible !== null ? ' on block ' + numeroBloc(cible) : '') + (gain > 0n ? ' · +' + montantTexte(gain, 6) + ' USDC' : ' · no prize') };
    } else if (t0 === T_PASS) {
      const w = adresseDuTopic(l.topics[1]);
      if (!w || m.length !== 4) { illisibles++; continue; }
      e = { kind: 'pass', wallet: w, text: court(w) + ' bought a Week pass · ' + montantTexte(m[2], 6) + ' USDC' };
    } else if (t0 === T_MINTED) {
      const w = adresseDuTopic(l.topics[2]), bloc = adresseDuTopic(l.topics[3]), sk = idTopic(l.topics[1]);
      if (!w || sk === null || m.length !== 1) { illisibles++; continue; }
      e = { kind: 'skin_minted', wallet: w, skin: sk, skinBlock: bloc, text: court(w) + ' minted skin #' + sk };
    } else if (t0 === T_LISTED) {
      /* un Listed n est pas montre : il dit la DEVISE d une enchere, que Bid ne porte pas */
      const sk = idTopic(l.topics[1]);
      if (sk === null || m.length !== 3) { illisibles++; continue; }
      const dev = motVersAdresse(m[0]);
      devisesL.set(sk, dev); nouvellesDevises.push([sk, dev]);
      continue;
    } else if (t0 === T_BID) {
      const w = adresseDuTopic(l.topics[2]), sk = idTopic(l.topics[1]);
      if (!w || sk === null || m.length !== 2) { illisibles++; continue; }
      const d = devisesL.has(sk) ? devises[devisesL.get(sk)] : null;
      e = { kind: 'skin_bid', wallet: w, skin: sk, text: court(w) + ' bid on skin #' + sk + (d ? ' · ' + montantTexte(m[0], d.dec) + ' ' + d.sym : '') };
    } else if (t0 === T_SOLD) {
      const vendeur = adresseDuTopic(l.topics[2]), w = adresseDuTopic(l.topics[3]), sk = idTopic(l.topics[1]);
      if (!w || !vendeur || sk === null || m.length !== 3) { illisibles++; continue; }
      const d = devises[motVersAdresse(m[0])] || null;
      e = { kind: 'skin_sold', wallet: w, seller: vendeur, skin: sk, text: court(w) + ' bought skin #' + sk + (d ? ' · ' + montantTexte(m[1], d.dec) + ' ' + d.sym : '') };
    }
    if (!e) continue;
    const s = horo(b);
    if (!Number.isSafeInteger(s) || s <= 0) { sansHeure++; continue; }
    vus.add(id);
    out.push({ id, t: s * 1000, ...e, block: null, tx, baseBlock: b, logIndex: i });
  }
  return { evenements: out, cibles: nouvellesCibles, devisesListees: nouvellesDevises, illisibles, sansHeure };
}

/** Les rolls practice du serveur ({t, bloc, score}, aucune identite) -> evenements. Forme fausse -> ignore. */
export function evenementsPractice(rolls) {
  const out = [];
  for (const r of Array.isArray(rolls) ? rolls : []) {
    if (!r || !Number.isFinite(r.t) || !Number.isSafeInteger(r.bloc) || r.bloc <= 0 || !Number.isInteger(r.score) || r.score < 0 || r.score > 5) continue;
    out.push({ id: 'p:' + r.t + ':' + r.bloc + ':' + r.score, t: r.t, kind: 'practice', wallet: null, block: null, score: r.score, cible: r.bloc,
      text: 'Practice roll · ' + r.score + '/5 on block ' + numeroBloc(r.bloc), tx: null, baseBlock: null, logIndex: null });
  }
  return out;
}

const valide = (e) => e && typeof e.id === 'string' && e.id && GENRES.includes(e.kind) && Number.isFinite(e.t)
  && (e.wallet === null || ADR.test(String(e.wallet))) && typeof e.text === 'string';
/** existants + nouveaux -> le journal : de-doublonne par id (tx:logIndex), garde ce qui date de `depuisMs` ou apres, du plus recent au
 *  plus ancien (t, puis bloc, puis logIndex), au plus `max`. */
export function fusionnerJournal(existants, nouveaux, { depuisMs = 0, max = JOURNAL_MAX } = {}) {
  const parId = new Map();
  for (const e of [...(existants || []), ...(nouveaux || [])]) if (valide(e) && e.t >= depuisMs && !parId.has(e.id)) parId.set(e.id, e);
  const k = (x) => (Number.isSafeInteger(x) ? x : -1);
  return [...parId.values()].sort((a, b) => b.t - a.t || k(b.baseBlock) - k(a.baseBlock) || k(b.logIndex) - k(a.logIndex)).slice(0, Math.max(0, max));
}

/** pose `block` (le block cree par ce wallet, lu dans l index des createurs) ; un wallet sans block -> null. Rien n est mute. */
export function avecBlocks(evenements, blocDe) {
  return (evenements || []).map((e) => ({ ...e, block: e.wallet && typeof blocDe === 'function' ? (blocDe(e.wallet) || null) : null }));
}
