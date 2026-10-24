/* duels-etat.js — LES DUELS LUS PAR L ETAT DU CONTRAT, PAS PAR SES LOGS (2026-10-24).
 * MESURE prod game33 (2026-10-24 13:48 UTC) : /api/duels repondait NON_LU « logs unreadable » a CHAQUE lecture. Le lecteur relisait les
 *   logs de BlockDuels par fenetres de 2 000 blocs depuis max(bloc de deploiement, tete - 7 jours) : une fenetre d ARCHIVE. Un noeud qui
 *   la refuse (mainnet.base.org : 429 « request limit reached » ; publicnode refuse l archive au-dela de ~-10 000 blocs) fait jeter le
 *   tour, et le tour suivant relit LA MEME fenetre : jamais rien de servi. La carte promettait « back in a few seconds » pour toujours.
 * Le remede : la liste vient de l ETAT, par eth_call a la tete : nextId() (l id du PROCHAIN duel, les ids commencent a 1), puis
 *   duels(id) du plus RECENT au plus ancien, au plus N ids par tour ; un duel dont le statut est FINAL (Settled / Cancelled / Refunded)
 *   n est plus jamais relu. Un duel REGLE se complete par le hash de son bloc cible (un en-tete de bloc, pas un log) : la face, les scores,
 *   le gagnant et le gain sont recalcules par resultatDuel (la MEME derivation que le contrat : parite prouvee par test-blockrolls-parite
 *   et test_PariteAvecBlockRolls). AUCUN eth_getLogs ici.
 * PUR : aucun reseau, aucune cle, aucune horloge (l instant est DONNE). Le decodage du getter est celui de duels-plan.js (lireDuel, dont
 *   l ordre des 9 mots est verifie contre l ABI compilee par test-duels-plan). Les duels rendus ont la forme de lireDuels (duels-plan-app.js) :
 *   /api/duels, l app, le brain et le regleur n y voient aucune difference — sauf blocCree, inconnu par l etat (null, que duelDepuisJson accepte). */
import { lireDuel, SIG_DUELS, SIG_NEXT_ID, STATUTS, MIN_STAKE } from './duels-plan.js';
import { resultatDuel } from './duels-plan-app.js';
import { refusGuess } from './blockrolls-plan.js';
import { selecteur } from './keccak.js';

const ZERO = '0x' + '0'.repeat(40);
const bas = (x) => String(x || '').toLowerCase();
const nul = (a) => bas(a) === ZERO;
const guessOk = (g) => Array.isArray(g) && refusGuess(g).length === 0;

/** les statuts apres lesquels un duel ne change plus jamais (le contrat n a aucune transition qui en sorte) */
export const STATUTS_FINAUX = Object.freeze(['Settled', 'Cancelled', 'Refunded']);

export const appelNextIdEtat = () => selecteur(SIG_NEXT_ID);
export function appelDuelEtat(id) {
  const v = BigInt(id);
  if (v < 1n || v >= (1n << 256n)) throw new Error('duel id out of range: ' + id);
  return selecteur(SIG_DUELS) + v.toString(16).padStart(64, '0');
}

/** le retour de nextId() -> un entier >= 1, ou null (jamais un 0 « par defaut » : un mot illisible ne veut pas dire « aucun duel ») */
export function lireNextId(hex) {
  const s = bas(hex);
  if (!/^0x[0-9a-f]{64}$/.test(s)) return null;
  const v = BigInt(s);
  return v >= 1n && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : null;
}

/**
 * le retour de duels(id) -> { statut, duel } (duel a la forme de lireDuels) ; null s il est illisible ou INCOHERENT avec le contrat
 * (statut None pour un id < nextId = noeud en retard ; createur ou jeton nul ; mise sous MIN_STAKE ; guess hors bornes ; un duel ouvert ou
 * annule qui aurait un joueur, un duel rejoint ou regle qui n en aurait pas). Un duel REGLE rendu ici a settled = null : il n est complet
 * qu avec reglerDepuisHash (sinon il serait pris pour un duel rejoint, et l app proposerait un remboursement qui revertirait).
 */
export function duelDepuisEtat(id, retour) {
  const r = lireDuel(retour);
  if (!r) return null;
  const statut = STATUTS[r.status];
  if (!statut || statut === 'None') return null;
  if (nul(r.creator) || nul(r.token) || !(r.stake >= MIN_STAKE) || !guessOk(r.guessA) || !Number.isSafeInteger(r.expiresAt) || r.expiresAt <= 0) return null;
  const pris = !nul(r.joiner);
  if ((statut === 'Joined' || statut === 'Settled') && !pris) return null;
  if ((statut === 'Open' || statut === 'Cancelled') && pris) return null;
  if (pris && (!guessOk(r.guessB) || !Number.isSafeInteger(r.targetBlock) || r.targetBlock <= 0)) return null;
  const duel = {
    id: String(BigInt(id)), creator: bas(r.creator), token: bas(r.token), stake: r.stake, guessA: r.guessA, expiresAt: r.expiresAt, blocCree: null,
    joiner: pris ? bas(r.joiner) : null, guessB: pris ? r.guessB : null, targetBlock: pris ? r.targetBlock : null,
    settled: null, cancelled: statut === 'Cancelled', refunded: statut === 'Refunded',
  };
  return { statut, duel, final: STATUTS_FINAUX.includes(statut) };
}

/**
 * un duel REGLE + le hash de son bloc cible (eth_getBlockByNumber(targetBlock).hash = blockhash(targetBlock) du settle) -> le duel complet,
 * comme les logs l auraient dit : settled { blockHash, scoreA, scoreB, winner, payout } ; egalite = winner nul, payout 0 ET refunded
 * (le contrat emet Settled puis Refunded). null si le hash ou le duel est illisible.
 */
export function reglerDepuisHash(duel, blockHash) {
  const h = bas(blockHash);
  if (!/^0x[0-9a-f]{64}$/.test(h) || /^0x0{64}$/.test(h) || !duel || !duel.joiner) return null;
  const res = resultatDuel(duel, h);
  if (!res) return null;
  return { ...duel, settled: { blockHash: h, scoreA: res.scoreA, scoreB: res.scoreB, winner: res.egalite ? ZERO : res.gagnant, payout: res.egalite ? 0n : res.auGagnant }, refunded: res.egalite };
}

/**
 * les ids a lire CE tour. `cache` : Map id (texte) -> { final, luA }. Fenetre : les `garde` ids les plus recents, [nextId - garde, nextId - 1].
 * D abord les ids JAMAIS lus, du plus recent au plus ancien ; puis les non finaux, le moins recemment lu d abord. Au plus `budget` ids ;
 * quand il y a des non finaux a relire, la moitie du budget leur est reservee (un premier remplissage ne les affame pas).
 * Rend { ids, restants } : restants = ids de la fenetre jamais lus qui restent APRES ce tour (0 = la liste est complete).
 */
export function idsDuelsATour({ nextId, cache, budget = 50, garde = 2000 }) {
  const haut = Number(nextId) - 1;
  if (!Number.isSafeInteger(haut) || haut < 1) return { ids: [], restants: 0 };
  const plancher = Math.max(1, haut - garde + 1);
  const relire = [...cache.entries()].filter(([id, e]) => e && !e.final && Number(id) >= plancher && Number(id) <= haut)
    .sort((x, y) => (x[1].luA || 0) - (y[1].luA || 0)).map(([id]) => Number(id));
  let dansFenetre = 0;
  for (const id of cache.keys()) { const v = Number(id); if (v >= plancher && v <= haut) dansFenetre += 1; }
  const jamaisLus = haut - plancher + 1 - dansFenetre;
  const nRelire = Math.min(relire.length, relire.length ? Math.floor(budget / 2) : 0);
  const neufs = [];
  for (let id = haut; id >= plancher && neufs.length < budget - nRelire; id--) if (!cache.has(String(id))) neufs.push(id);
  /* le budget que les neufs n ont pas pris revient aux relectures */
  const relus = relire.slice(0, Math.min(relire.length, budget - neufs.length));
  return { ids: [...neufs, ...relus], restants: jamaisLus - neufs.length };
}
