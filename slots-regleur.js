/* slots-regleur.js — LE REGLEUR (keeper) DU JEU (v4 slots, option 3 de Phil, 2026-10-23 ; v5 2026-10-24 : duels + pot du pass des rolls).
 * Pourquoi : un spin non regle dans sa fenetre (256 blocs, ~51 s a 200 ms/bloc) est PERDU ; un duel rejoint non regle devient un
 * remboursement (le joueur qui a rejoint garde une OPTION GRATUITE : il regle s il gagne, se tait s il perd) ; un pot du jour arme non tire
 * se re-arme (un acheteur peut re-armer jusqu a ce que le hash le choisisse). settle / settleMany (slots), settle (duels), closeDay /
 * drawDay (rolls) sont PERMISSIONLESS et paient TOUJOURS selon les regles du contrat : le regleur ne paie que son gas, il ne touche rien.
 *
 * ⛔ CE QUE CE MODULE FAIT, ET RIEN D AUTRE :
 *   - SANS la variable SLOTS_KEEPER_KEY (le proprietaire cree et approvisionne ce wallet lui-meme ; personne d autre ne voit la cle) : il
 *     ne fait RIEN et le dit (etat OFF, et pourquoi) ; aucune lecture de chaine. UNE seule cle pour les trois contrats.
 *   - AVEC : toutes les `intervalleMs` (derive du temps de bloc MESURE : un cinquieme de la fenetre, borne a [2 s, 10 s]), il lit :
 *       slots  — les Spun d une fenetre BORNEE (<= 300 blocs, puis les seuls blocs nouveaux + 8), les statuts, les hashes, le pot ;
 *                refait le calcul du contrat (slots-plan.js planReglement) -> settleMany(ids) des spins que le pot paie en ENTIER ;
 *       duels  — les Joined d une fenetre BORNEE (meme regle), le duel relu (duels(id) : statut, les deux guesses, la mise) et le hash
 *                de sa cible -> le VAINQUEUR calcule comme le contrat (faceDuHash = BlockDuels.faceOf, puis les deux scores) :
 *                  egalite      -> JAMAIS regle (les deux mises sont rendues, par settle comme par refundExpired : rien a proteger) ;
 *                  createur     -> settle(id) des cible + delaiDuelBlocs (l OPTION GRATUITE : le perdant qui a rejoint se tait) ;
 *                  rejoignant   -> settle(id) seulement PRES DE LA FIN (tete + 1 >= cible + 256 - marge) : le gagnant qui a rejoint,
 *                  (ou hash       en ligne, a toutes les raisons de regler lui-meme ; le regleur ne passe que s il ne l a pas fait.
 *                   illisible)
 *                Pourquoi un delai et pas cible + 1 (2026-10-24, revue keeper 1) : le risque du createur n existe qu A LA FIN de la
 *                fenetre (le rejoignant perdant laisse filer jusqu au remboursement) ; envoyer a cible + 1 fait COURIR le regleur contre
 *                le gagnant (ou un attaquant) qui regle au meme bloc — sa tx minee revert (NotJoined) pour rien. Le delai laisse le
 *                gagnant regler d abord ; la marge de fin (>= margeFinDuelBlocs, et >= 3 tours au temps de bloc MESURE, 200 ms sans
 *                mesure) laisse plusieurs tours pour que le settle du regleur tombe dans la fenetre. Parmi les duels prets : les
 *                PRESSES d abord (par echeance), puis ceux ou le createur gagne, par MISE decroissante ;
 *       rolls  — today() et les `joursRecul` jours passes : un jour fini avec des acheteurs, Open -> closeDay(jour) ; Armed dans sa
 *                fenetre -> drawDay(jour) ; Armed hors fenetre -> closeDay(jour) (re-arme, puis tire au tour suivant). ⛔ buyerCount = 0
 *                n est retenu (jour sans acheteur, plus jamais relu) que lu PLUS D UN JOUR apres la fin du jour (today() > jour + 1) :
 *                juste apres minuit un noeud en retard peut rendre 0 pour un jour dont les acheteurs ont achete dans ses dernieres
 *                secondes (revue keeper 4) — relu a chaque tour jusque-la. Un compte > 0 ne sert qu a « il y a des acheteurs ».
 *     Au plus UNE tx par tour, la plus PRESSEE d abord (le dernier bloc ou elle passe encore ; un closeDay n a pas d echeance) ; chaque
 *     contrat garde son propre ordre (duels : presses, puis createur gagnant par mise) et la tete de chaque liste est comparee.
 *   - ⛔ FENETRE : une tx signee a la tete H est minee au mieux en H + 1 : rien n est envoye si H + 1 depasse la fenetre du contrat.
 *   - BORNES (BORNES_DEFAUT, chacune verifiee par test-slots-regleur) : au plus `spinsParTx` spins par tx ; jamais au-dessus de
 *     `maxFeeWei` par unite de gas ; au plus `txParHeure[contrat]` tx par heure glissante POUR CHAQUE contrat (slots, duels, rolls : un
 *     contrat inonde n affame pas les deux autres — revue keeper 2) ; au plus `gasMaxParTx` de gas ; une seule tx en vol ;
 *     au plus `simulationsParTour` simulations par tour ; ARRET apres `echecsMax` echecs de suite — jusqu au redemarrage.
 *   - ⛔ CE QUI EST UN ECHEC (compte vers l arret) : un revert MINE que le regleur ne s EXPLIQUE pas, un envoi REFUSE d une tx bien formee
 *     (apres verification : un « nonce too low » / « replacement underpriced » dont la tx est vue sur la chaine n en est pas un), une tx
 *     jamais incluse (120 s), un recu illisible pendant 120 s (l issue de la tx est INCONNUE : comptee comme non incluse — revue keeper 3).
 *     Un revert EXPLIQUE (revue keeper 1) : la cible relue apres le revert montre qu un AUTRE l a deja fait — duel Settled ; jour tire
 *     (Drawn) ou arme / re-arme par un autre au bloc du recu ou avant — compte a part (revertsExpliques), jamais vers l arret. Un revert
 *     des slots ne s explique jamais ainsi (settleMany SAUTE un spin deja regle, il ne revert pas pour lui). Cible illisible apres le
 *     revert : relue aux tours suivants, comptee au bout de 120 s. Une erreur RPC (eth_estimateGas) est PASSAGERE : jamais comptee. Un
 *     tour SAIN (tout lu, rien a faire) remet le compte a zero. etat().degrade le dit tant que des echecs sont en cours (/sante).
 *   - ⛔ settleMany qui ne se simule pas (un paiement refuse, liste noire USDC) : le lot est COUPE en deux jusqu a isoler le spin fautif,
 *     ecarte jusqu a la fin de sa fenetre ; les autres spins couverts partent.
 *   - ⛔ JAMAIS autre chose que : settleMany(uint256[]) / settle(uint256) vers le contrat des SLOTS ; settle(uint256) vers le contrat des
 *     DUELS ; closeDay(uint32) / drawDay(uint32) vers le contrat des ROLLS (les adresses des fiches) ; value 0 ; la chaine de la fiche.
 *     verifierEnvoi() le controle juste avant CHAQUE signature et jette sinon (rien n est signe).
 *   - ⛔ La cle n est lue que du parametre `cle` (le serveur le prend dans process.env, et nulle part ailleurs) ; elle reste dans la
 *     fermeture ; etat() ne la rend jamais, aucune erreur ne la cite, rien ne la journalise. L ADRESSE du regleur est publique (/sante).
 * NE PROUVE PAS (dit) : un reglement reel sur Base ; le banc anvil execute les vrais contrats sur une chaine LOCALE (la course perdue y est
 *   rejouee par un minage manuel, pas par un vrai sequenceur). RESTE (dit, 2026-10-24) : un attaquant peut encore user le plafond des DUELS
 *   avec des duels a lui ou SON createur gagne (deux wallets) — chacun lui coute 10 % de la mise (MIN_STAKE 0,10 USDC : 0,01 USDC) plus
 *   le gas ; les slots et les rolls gardent leur plafond, et parmi les duels la plus grosse mise passe d abord. */
import * as Slots from './slots-plan.js';
import { selecteur, topic, keccak256 } from './keccak.js';
import { adresseDe } from './signeur-secp256k1.js';
import { signerEip1559 } from './tx-eip1559.js';

export const SEL_SETTLE_MANY = selecteur(Slots.SIG_SETTLE_MANY).toLowerCase();
/* settle(uint256) : le MEME selecteur pour BlockSlots et BlockDuels ; la garde le juge par la DESTINATION */
export const SEL_SETTLE = selecteur(Slots.SIG_SETTLE).toLowerCase();
export const SEL_CLOSE_DAY = selecteur('closeDay(uint32)').toLowerCase();
export const SEL_DRAW_DAY = selecteur('drawDay(uint32)').toLowerCase();
export const SEL_DUELS = selecteur('duels(uint256)').toLowerCase();
export const SEL_TODAY = selecteur('today()').toLowerCase();
export const SEL_DAY_POTS = selecteur('dayPots(uint32)').toLowerCase();
export const SEL_BUYER_COUNT = selecteur('buyerCount(uint32)').toLowerCase();
export const TOPIC_JOINED = topic('Joined(uint256,address,uint8[5],uint256)');
export const TOPIC_DUEL_SETTLED = topic('Settled(uint256,bytes32,uint8,uint8,address,uint256)');
export const TOPIC_DAY_CLOSED = topic('DayClosed(uint32,uint256,uint256,uint256,address)');
export const TOPIC_DAY_DRAWN = topic('DayDrawn(uint32,address,bytes32,uint256,uint256)');
/* BlockDuels.Status : None 0, Open 1, Joined 2, Settled 3, Cancelled 4, Refunded 5 ; BlockRolls.DayState : Open 0, Armed 1, Drawn 2 */
const DUEL_JOINED = 2, DUEL_SETTLED = 3;
const FENETRE = 256;
const ROLLS_DELAI_CIBLE = 2; /* BlockRolls.TARGET_DELAY : closeDay arme a bloc + 2 */
export const CONTRATS = Object.freeze(['slots', 'duels', 'rolls']);

export const BORNES_DEFAUT = Object.freeze({
  spinsParTx: 10,
  maxFeeWei: 1_000_000_000n, /* 1 gwei : Base tourne d ordinaire bien en dessous ; au-dessus, le regleur attend */
  prioWeiMax: 100_000_000n, /* 0,1 gwei de pourboire au plus */
  /* PAR CONTRAT (un nombre seul = le meme plafond pour chacun) : slots 60, duels 30, rolls 12 tx par heure glissante */
  txParHeure: Object.freeze({ slots: 60, duels: 30, rolls: 12 }),
  delaiDuelBlocs: 16, /* un duel ou le createur gagne : regle a partir de cible + 16 (le gagnant en ligne regle d abord) */
  margeFinDuelBlocs: 64, /* un duel ou le rejoignant gagne : regle a partir de cible + 256 - marge (marge >= 3 tours mesures) */
  gasMaxParTx: 3_000_000n,
  echecsMax: 3,
  intervalleMinMs: 2000,
  intervalleMaxMs: 10000,
  reculLogs: 300, /* > 256 + 2 : un spin / un duel plus vieux ne se regle plus */
  suivisMax: 200,
  statutsParTour: 30,
  simulationsParTour: 12, /* la coupe en deux d un lot de 10 avec un spin fautif : 1 + 2 x 4 au plus */
  joursRecul: 7, /* les pots du pass des 7 derniers jours UTC */
  inclusionMaxMs: 120000,
  mesureToutesMs: 600000,
  blocsMesure: Slots.BLOCS_MESURE,
});

/** l intervalle entre deux tours : un cinquieme de la fenetre au temps de bloc MESURE, borne ; sans mesure, la borne haute (10 s) */
export function intervalleDepuisBloc(msParBloc, bornes = BORNES_DEFAUT) {
  if (!(Number(msParBloc) > 0)) return bornes.intervalleMaxMs;
  const v = Math.floor((Slots.secondesFenetre(msParBloc) * 1000) / 5);
  return Math.max(bornes.intervalleMinMs, Math.min(bornes.intervalleMaxMs, v));
}

const bas = (x) => String(x || '').toLowerCase();
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const motsDe = (data) => (String(data || '').replace(/^0x/, '').match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
const adresseOk = (x) => (/^0x[0-9a-f]{40}$/.test(bas(x)) ? bas(x) : null);
const resoudre = (x) => { try { return adresseOk(typeof x === 'function' ? x() : x); } catch (_) { return null; } };

/** les donnees de settleMany(ids) (ABI : offset 32, longueur, ids) */
export const donneesSettleMany = (ids) => SEL_SETTLE_MANY + u(32) + u(ids.length) + ids.map((x) => u(x)).join('');
/** un appel a UN argument : selecteur + un mot */
const donnees1 = (sel, x) => sel + u(x);

/** une erreur de simulation = un REVERT de l execution (le contrat refuse), pas une panne de transport (rate limit, delai, noeud muet) */
export const estRevert = (e) => /revert/i.test(String((e && e.message) || e)) || (e && typeof e.data === 'string' && /^0x[0-9a-f]{8,}/i.test(e.data));

/** la face d un hash de bloc, comme BlockDuels.faceOf (= BlockRolls.faceOf) : keccak256 de "0x" + les 40 premiers chiffres hex
 *  MINUSCULES du hash ; teinte = (k0*256+k1) % 361 ; [((teinte+30) % 360) / 60, k6 % 10, k7 % 19, k8 % 9, k9 % 8]. null si illisible.
 *  (le banc anvil compare au contrat COMPILE : le vainqueur predit = celui de l evenement Settled) */
export function faceDuHash(h) {
  const s = bas(h);
  if (!/^0x[0-9a-f]{64}$/.test(s)) return null;
  const k = keccak256(new TextEncoder().encode('0x' + s.slice(2, 42)));
  const teinte = (k[0] * 256 + k[1]) % 361;
  return [Math.floor(((teinte + 30) % 360) / 60), k[6] % 10, k[7] % 19, k[8] % 9, k[9] % 8];
}
/** un guess EMBALLE (uint24 de BlockDuels._pack) -> [bande, orbite, facette, matiere, ornement] (BlockDuels._unpack) */
export const deballerGuess = (p) => { const x = Number(p); return [(x >> 16) & 0x0f, (x >> 12) & 0x0f, (x >> 7) & 0x1f, (x >> 3) & 0x0f, x & 0x07]; };
/** le vainqueur d un duel comme BlockDuels._settle : 'createur' | 'rejoignant' | 'egalite' ; null si le hash est illisible */
export function vainqueurDuel(hash, guessA, guessB) {
  const f = faceDuHash(hash);
  if (!f) return null;
  const score = (g) => deballerGuess(g).reduce((s, x, i) => s + (x === f[i] ? 1 : 0), 0);
  const a = score(guessA), b = score(guessB);
  return a === b ? 'egalite' : a > b ? 'createur' : 'rejoignant';
}
/** le plafond horaire d UN contrat : `txParHeure` nombre (le meme pour tous) ou { slots, duels, rolls } */
export const plafondHeure = (bornes, cible) => { const p = bornes.txParHeure; const v = typeof p === 'object' && p !== null ? p[cible] : p; return Number.isFinite(Number(v)) ? Number(v) : 0; };
/** la marge de fin d un duel ou le rejoignant gagne (blocs avant cible + 256) : >= margeFinDuelBlocs et >= 3 tours au temps de bloc
 *  mesure (200 ms sans mesure, le pire cas de Base) ; jamais au point de preceder cible + delaiDuelBlocs */
export function margeFinDuel(bornes, msParBloc, intervalleMs) {
  const ms = Number(msParBloc) > 0 ? Number(msParBloc) : 200;
  const tours = Math.ceil((3 * Number(intervalleMs || bornes.intervalleMaxMs)) / ms);
  return Math.min(FENETRE - bornes.delaiDuelBlocs - 1, Math.max(bornes.margeFinDuelBlocs, tours));
}

/**
 * ⛔ LA GARDE AVANT CHAQUE SIGNATURE : jette sauf si la tx est sans valeur, sur la bonne chaine, et ne porte QUE :
 *   vers `contrat` (slots) : settleMany(ids) (1..spinsParTx ids, encodage canonique) ou settle(id) ;
 *   vers `duels`           : settle(id) ;
 *   vers `rolls`           : closeDay(jour) / drawDay(jour) (jour < 2^32, un seul mot).
 * Rend le nombre de spins (slots) ou 1.
 */
export function verifierEnvoi(tx, { contrat, chainId, bornes = BORNES_DEFAUT, duels = null, rolls = null }) {
  const cS = adresseOk(contrat), cD = adresseOk(duels), cR = adresseOk(rolls);
  if (!cS && !cD && !cR) throw new Error('keeper: no keeper contract');
  if (BigInt(tx.value ?? 0) !== 0n) throw new Error('keeper: refused, a keeper call carries no value');
  if (BigInt(tx.chainId) !== BigInt(chainId)) throw new Error('keeper: refused, wrong chain');
  const to = bas(tx.to), d = bas(tx.data);
  if (cS && to === cS) {
    if (d.startsWith(SEL_SETTLE) && d.length === 10 + 64) return 1;
    if (!d.startsWith(SEL_SETTLE_MANY)) throw new Error('keeper: refused, only settleMany / settle are ever sent to the slots contract');
    const m = motsDe('0x' + d.slice(10));
    if ((d.length - 10) % 64 !== 0 || m.length < 3 || m[0] !== 32n || m[1] !== BigInt(m.length - 2)) throw new Error('keeper: refused, settleMany data is not canonical');
    const k = m.length - 2;
    if (k < 1 || k > bornes.spinsParTx) throw new Error('keeper: refused, ' + k + ' spins in one transaction (max ' + bornes.spinsParTx + ')');
    return k;
  }
  if (cD && to === cD) {
    if (d.startsWith(SEL_SETTLE) && d.length === 10 + 64) return 1;
    throw new Error('keeper: refused, only settle(uint256) is ever sent to the duels contract');
  }
  if (cR && to === cR) {
    if ((d.startsWith(SEL_CLOSE_DAY) || d.startsWith(SEL_DRAW_DAY)) && d.length === 10 + 64 && /^[0-9a-f]{64}$/.test(d.slice(10)) && BigInt('0x' + d.slice(10)) < 2n ** 32n) return 1;
    throw new Error('keeper: refused, only closeDay / drawDay are ever sent to the rolls contract');
  }
  throw new Error('keeper: refused, the destination is not a keeper contract');
}

class Passagere extends Error {}

/**
 * le regleur. `rpc(methode, params)` -> resultat JSON-RPC (jette sur une erreur) ; `rpcEnvoi` (defaut rpc) sert au SEUL
 * eth_sendRawTransaction. `contrat` + `table` + `blocDeploiement` : les slots ; `duels` = { contrat, bloc } et `rolls` = { contrat }
 * (une adresse, ou une fonction relue a chaque tour : la fiche des duels arrive par un import dynamique). `maintenant` (ms) et `bornes`
 * sont injectables pour les tests.
 */
export function creerRegleur({ cle = null, contrat = null, chainId = 8453, table = null, blocDeploiement = 0, rpc = null, rpcEnvoi = null,
  maintenant = () => Date.now(), bornes: bornesIn = {}, journal = () => {}, desactive = null, duels = null, rolls = null } = {}) {
  const bornes = { ...BORNES_DEFAUT, ...bornesIn };
  const c = adresseOk(contrat);
  const off = (pourquoi) => ({
    etat: () => ({ etat: 'OFF', pourquoi, adresse: null }),
    tour: async () => ({ fait: false, pourquoi }),
    demarrer: () => false,
    arreter: () => {},
  });
  if (desactive) return off(String(desactive));
  if (!cle) return off('SLOTS_KEEPER_KEY is not set: the server settles nothing (anyone can still settle; prizes always go to the player)');
  const duelsCfg = duels && duels.contrat ? duels : null, rollsCfg = rolls && rolls.contrat ? rolls : null;
  if (!c && !duelsCfg && !rollsCfg) return off('no contract address in the slots, duels or rolls records');
  if (typeof rpc !== 'function') return off('no RPC reader');
  if (c && (!Array.isArray(table) || table.length !== Slots.MAX_POINTS + 1)) return off('no prize table in slots-deploiement.js');
  let adresse;
  try { adresse = adresseDe(cle); } catch (_) { return off('SLOTS_KEEPER_KEY is malformed (its value is never shown)'); }
  const envoi = typeof rpcEnvoi === 'function' ? rpcEnvoi : rpc;
  const tb = c ? table.map((x) => BigInt(x)) : null;
  const blocDuels = () => { try { const b = typeof duelsCfg.bloc === 'function' ? duelsCfg.bloc() : duelsCfg.bloc; return Number(b) || 0; } catch (_) { return 0; } };

  const activite = () => ({ envois: 0, inclus: 0, reverts: 0, revertsExpliques: 0, regles: 0, sautsHeure: 0, dernierEnvoi: null, dernierInclus: null });
  const st = {
    etat: 'ON', adresse, depuis: new Date(maintenant()).toISOString(), msParBloc: null, mesureA: 0, intervalleMs: intervalleDepuisBloc(null, bornes),
    scanne: null, enVol: null, envoisHeure: { slots: [], duels: [], rolls: [] }, echecsSuite: 0, dernierEchec: null, dernierTour: null, dernierEnvoi: null, dernierRegle: null, erreurs: [],
    compteurs: { tours: 0, envois: 0, spinsEnvoyes: 0, spinsRegles: 0, reverts: 0, revertsExpliques: 0, simulationsRefusees: 0, simulationsNonLues: 0, envoisRefuses: 0, envoisRetrouves: 0,
      nonInclus: 0, recusIlisibles: 0, sautsGas: 0, sautsHeure: 0, spinsEcartes: 0, toursSains: 0, duelsEgalites: 0 },
    parContrat: { slots: activite(), duels: activite(), rolls: activite() },
    arret: null, chaineVue: false,
  };
  const suivis = new Map(); /* slots : id -> { t, player } */
  const ecartes = new Map(); /* slots : id -> t — settle seul qui ne se simule pas (paiement refuse) : ecarte jusqu a la fin de sa fenetre */
  const hashes = new Map(); /* bloc -> hash */
  const duelsSuivis = new Map(); /* id -> { t, vainqueur (null tant que non lu), mise } */
  const scanDuels = { contrat: null, scanne: null };
  const jours = { contrat: null, finis: new Set(), acheteurs: new Map(), aujourdhui: null };
  let enCours = false, minuteur = null, echecsCeTour = 0;

  const erreur = (quoi) => {
    const e = { a: new Date(maintenant()).toISOString(), quoi: String(quoi).slice(0, 160) };
    st.erreurs.push(e); while (st.erreurs.length > 10) st.erreurs.shift();
    journal('[keeper] ' + e.quoi);
  };
  /* un echec : `contrat` (slots / duels / rolls, ou null) est NOMME dans le message d arret (revue keeper 7 : il etait coupe) */
  const echec = (quoi, compteur, contrat = null) => {
    st.compteurs[compteur] += 1; st.echecsSuite += 1; echecsCeTour += 1; erreur(quoi);
    st.dernierEchec = { a: new Date(maintenant()).toISOString(), contrat, quoi: String(quoi).slice(0, 160) };
    if (st.echecsSuite >= bornes.echecsMax) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), contrat, pourquoi: st.echecsSuite + ' failures in a row (last, ' + (contrat || 'keeper') + ': ' + String(quoi).slice(0, 140) + ') — stopped until restart' }; journal('[keeper] STOPPED: ' + st.arret.pourquoi); }
  };
  const msg = (e) => String((e && e.message) || e).slice(0, 120);
  const entier = (h) => { const v = parseInt(String(h), 16); return Number.isSafeInteger(v) ? v : null; };
  const appel = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);

  const nomTx = (v) => v.cible + ' ' + v.quoi + ' #' + v.ids[0] + (v.ids.length > 1 ? '..' + v.ids[v.ids.length - 1] : '');
  /* ⛔ revue keeper 1 : un revert MINE est-il explique par un AUTRE qui a deja fait le travail ? la cible est RELUE (latest).
   *   duels : statut Settled (3) — seul un settle reussi y mene ; le notre a revert, donc un autre l a regle (NotJoined).
   *   rolls : jour Drawn ; ou Armed avec une AUTRE cible que celle vue a l envoi, armee au bloc du recu ou avant (cible - 2 <= bloc) —
   *           un autre a ferme / re-arme le jour (StillSettleable, DayNotArmed, TooEarly). Une cible armee APRES notre bloc ne l explique pas.
   *   slots : jamais (settleMany saute un spin deja regle sans revert). Rend la raison, ou null ; jette si la cible n est pas lue. */
  async function expliquer(v, blocRecu) {
    if (v.cible === 'duels') {
      const m = motsDe(await appel(v.to, donnees1(SEL_DUELS, v.ids[0])));
      if (m.length !== 9) throw new Error('duel not read');
      return Number(m[2]) === DUEL_SETTLED ? 'duel #' + v.ids[0] + ' already settled by another transaction' : null;
    }
    if (v.cible === 'rolls') {
      const m = motsDe(await appel(v.to, donnees1(SEL_DAY_POTS, v.ids[0])));
      if (m.length !== 3) throw new Error('dayPots not read');
      const etat = Number(m[2]), t = Number(m[1]);
      if (etat === 2) return 'day ' + v.ids[0] + ' already drawn by another transaction';
      const avant = v.avant || {};
      if (etat === 1 && t !== Number(avant.t) && blocRecu !== null && t - ROLLS_DELAI_CIBLE <= blocRecu) return 'day ' + v.ids[0] + ' armed by another transaction (target ' + t + ')';
      return null;
    }
    return null;
  }

  async function suivreInclusion() {
    const v = st.enVol;
    let r = null;
    try { r = await rpc('eth_getTransactionReceipt', [v.hash]); } catch (e) {
      erreur('receipt not read: ' + msg(e));
      /* ⛔ un recu qui jette sans fin ne retient pas le regleur pour toujours : au bout de inclusionMaxMs la tx est relachee ; la suivante
       *    part au nonce 'pending'. revue keeper 3 : son issue est INCONNUE (un revert mine serait invisible) — comptee comme une tx non
       *    incluse, vers l arret ; etat().degrade le dit */
      if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; echec(nomTx(v) + ': receipt of tx ' + v.hash + ' unreadable for ' + Math.round(bornes.inclusionMaxMs / 1000) + ' s, released (outcome unknown, counted as a failure)', 'recusIlisibles', v.cible); return true; }
      return false;
    }
    if (!r) {
      if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; echec(nomTx(v) + ': tx ' + v.hash + ' not included after ' + Math.round(bornes.inclusionMaxMs / 1000) + ' s', 'nonInclus', v.cible); }
      return false;
    }
    const act = st.parContrat[v.cible];
    if (String(r.status) !== '0x1') {
      let pourquoi = null;
      try { pourquoi = await expliquer(v, entier(r.blockNumber)); } catch (e) {
        /* la cible n est pas lue : la tx reste « en vol » (rien d autre ne part), relue au tour suivant ; comptee au bout de inclusionMaxMs */
        if (v.revertA === undefined) v.revertA = maintenant();
        if (maintenant() - v.revertA <= bornes.inclusionMaxMs) { erreur(nomTx(v) + ': tx ' + v.hash + ' reverted; its target was not re-read (' + msg(e) + '), re-read next round'); return false; }
      }
      st.enVol = null;
      if (pourquoi) {
        act.revertsExpliques += 1; st.compteurs.revertsExpliques += 1;
        erreur(nomTx(v) + ': tx ' + v.hash + ' reverted — ' + pourquoi + ' (not counted as a failure)');
        if (v.cible === 'duels') duelsSuivis.delete(String(v.ids[0]));
        return true;
      }
      act.reverts += 1; echec(nomTx(v) + ': tx ' + v.hash + ' reverted', 'reverts', v.cible); return true;
    }
    st.enVol = null;
    st.echecsSuite = 0;
    const a = new Date(maintenant()).toISOString(), bloc = entier(r.blockNumber);
    act.inclus += 1;
    if (v.cible === 'slots') {
      const regles = Slots.lireSettledTous(r.logs || [], v.to);
      st.compteurs.spinsRegles += regles.length; act.regles += regles.length;
      st.dernierRegle = { a, hash: v.hash, envoyes: v.ids.length, regles: regles.length, paye: regles.reduce((s, d) => s + d.payout, 0n).toString(), bloc };
      act.dernierInclus = { a, hash: v.hash, ids: v.ids, regles: regles.length, bloc };
      for (const d of regles) suivis.delete(String(d.spinId));
    } else if (v.cible === 'duels') {
      const n = (r.logs || []).filter((l) => bas(l.address) === v.to && bas(l.topics && l.topics[0]) === TOPIC_DUEL_SETTLED).length;
      act.regles += n; act.dernierInclus = { a, hash: v.hash, duel: v.ids[0], regles: n, bloc };
      duelsSuivis.delete(String(v.ids[0]));
    } else {
      const tir = (r.logs || []).filter((l) => bas(l.address) === v.to && bas(l.topics && l.topics[0]) === TOPIC_DAY_DRAWN).length;
      const fer = (r.logs || []).filter((l) => bas(l.address) === v.to && bas(l.topics && l.topics[0]) === TOPIC_DAY_CLOSED).length;
      act.regles += tir + fer; act.dernierInclus = { a, hash: v.hash, quoi: v.quoi, jour: v.ids[0], bloc };
      if (tir) jours.finis.add(String(v.ids[0]));
    }
    return true;
  }

  async function mesurerBloc(tete) {
    if (maintenant() - st.mesureA < bornes.mesureToutesMs && st.msParBloc !== null) return;
    st.mesureA = maintenant();
    try {
      const n = Math.min(bornes.blocsMesure, tete);
      const [a, b] = await Promise.all([rpc('eth_getBlockByNumber', ['0x' + tete.toString(16), false]), rpc('eth_getBlockByNumber', ['0x' + (tete - n).toString(16), false])]);
      const ms = Slots.msParBlocMesure({ tsTete: entier(a && a.timestamp), tsAvant: entier(b && b.timestamp), n });
      if (ms !== null) { st.msParBloc = ms; st.intervalleMs = intervalleDepuisBloc(ms, bornes); }
    } catch (e) { erreur('block time not measured: ' + msg(e)); }
  }

  async function hashesDe(t) {
    const ns = Slots.blocsDesFaces(t);
    for (const b of ns) {
      if (hashes.has(b)) continue;
      const blk = await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]);
      if (blk && /^0x[0-9a-f]{64}$/i.test(String(blk.hash))) hashes.set(b, bas(blk.hash));
    }
    while (hashes.size > 900) hashes.delete(hashes.keys().next().value);
    const h = ns.map((b) => hashes.get(b));
    return h.every(Boolean) ? h : null;
  }

  /* ---------------------------------------------------------------- slots : le lot settleMany du tour (au plus un candidat) */
  async function candidatsSlots(tete, info) {
    /* les Spun d une fenetre BORNEE : jamais plus de reculLogs blocs, jamais avant le deploiement ; puis les seuls blocs nouveaux (+ 8) */
    const plancher = Math.max(Number(blocDeploiement) || 0, tete - bornes.reculLogs + 1);
    const de = st.scanne === null ? plancher : Math.max(plancher, st.scanne + 1 - 8);
    if (de <= tete) {
      const logs = await rpc('eth_getLogs', [{ address: c, topics: [Slots.TOPIC_SPUN], fromBlock: '0x' + de.toString(16), toBlock: '0x' + tete.toString(16) }]);
      if (!Array.isArray(logs)) throw new Error('getLogs did not return a list');
      for (const s of Slots.lireSpunTous(logs, c)) { const id = String(s.spinId); if (!suivis.has(id)) suivis.set(id, { t: s.targetBlock, player: s.player }); }
      st.scanne = tete;
    }
    /* hors fenetre (une tx signee maintenant ne passerait plus) : perdu, plus rien a faire ; la liste suivie est bornee */
    for (const [id, s] of suivis) if (Slots.etatReglement(s.t, tete).etat === 'PERDU') { suivis.delete(id); ecartes.delete(id); }
    for (const [id, t] of ecartes) if (Slots.etatReglement(t, tete).etat === 'PERDU') ecartes.delete(id);
    while (suivis.size > bornes.suivisMax) suivis.delete(suivis.keys().next().value);
    const reglables = [...suivis.entries()].filter(([id, s]) => Slots.etatReglement(s.t, tete).etat === 'REGLABLE' && !ecartes.has(id))
      .sort((a, b) => (BigInt(a[0]) < BigInt(b[0]) ? -1 : 1)).slice(0, bornes.statutsParTour);
    if (!reglables.length) return [];
    const spins = [];
    for (const [id, s] of reglables) {
      const v = Slots.lireSpin(await appel(c, Slots.appelSpin(id)));
      if (!v) continue;
      /* ⛔ statut 0 (None) pour un id VU dans un Spun : un noeud en retard d un bloc, pas un spin clos — garde, relu au tour suivant */
      if (v.status === 0) { info.sain = false; continue; }
      if (v.status !== 1) { suivis.delete(id); continue; }
      const h = await hashesDe(s.t);
      spins.push({ id, t: s.t, faces: h ? Slots.facesDuSpin(h, BigInt(id)) : null });
    }
    if (!spins.length) return [];
    const pot = Slots.lireUint(await appel(c, Slots.appelPot()));
    if (pot === null) throw new Error('pot not read');
    const plan = Slots.planReglement({ spins, pot, table: tb, tete });
    info.courts = plan.courts.length;
    const lignes = plan.lignes.filter((l) => l.decision === 'LOT').slice(0, bornes.spinsParTx);
    if (!lignes.length) return [];
    return [{ cible: 'slots', to: c, ids: lignes.map((l) => l.id), fin: Math.min(...lignes.map((l) => l.dernierBloc)), quoi: 'settleMany' }];
  }

  /* ---------------------------------------------------------------- duels : settle(id) de chaque duel rejoint dans sa fenetre */
  async function candidatsDuels(cD, tete, info) {
    if (scanDuels.contrat !== cD) { scanDuels.contrat = cD; scanDuels.scanne = null; duelsSuivis.clear(); }
    const plancher = Math.max(blocDuels(), tete - bornes.reculLogs + 1);
    const de = scanDuels.scanne === null ? plancher : Math.max(plancher, scanDuels.scanne + 1 - 8);
    /* 2026-10-24 : les rejoints lus par l ETAT (duelsCfg.joints : le cache de lireDuelsSrv, nextId + duels(id)) s ajoutent aux Joined des
     *   logs RECENTS : un log refuse ne perd plus un duel. Les logs refuses ET aucun etat fourni : le tour jette, comme avant. Le statut est
     *   RELU ci-dessous (duels(id) == Joined) avant tout envoi : une liste perimee ne fait rien partir. */
    let refusLogs = null, parEtat = false;
    if (de <= tete) {
      try {
        const logs = await rpc('eth_getLogs', [{ address: cD, topics: [TOPIC_JOINED], fromBlock: '0x' + de.toString(16), toBlock: '0x' + tete.toString(16) }]);
        if (!Array.isArray(logs)) throw new Error('getLogs did not return a list');
        for (const l of logs) {
          if (bas(l.address) !== cD || bas(l.topics && l.topics[0]) !== TOPIC_JOINED || !l.topics[1]) continue;
          const m = motsDe(l.data);
          if (m.length !== 6) continue;
          const id = String(BigInt(l.topics[1])), t = Number(m[5]);
          if (Number.isSafeInteger(t) && !duelsSuivis.has(id)) duelsSuivis.set(id, { t, vainqueur: null, mise: 0n });
        }
        scanDuels.scanne = tete;
      } catch (e) { refusLogs = e; }
    }
    if (typeof duelsCfg.joints === 'function') {
      try {
        for (const j of duelsCfg.joints() || []) { const id = String(j && j.id), t = Number(j && j.targetBlock); if (/^\d+$/.test(id) && Number.isSafeInteger(t) && !duelsSuivis.has(id)) duelsSuivis.set(id, { t, vainqueur: null, mise: 0n }); }
        parEtat = true;
      } catch (_) { parEtat = false; }
    }
    if (refusLogs && !parEtat) throw refusLogs;
    if (refusLogs) { info.sain = false; erreur('duels logs not read (state list used): ' + msg(refusLogs)); }
    /* settle passe si cible < bloc <= cible + 256 ; mine au mieux a tete + 1 : tete + 1 <= cible + 256. Simule a la tete : tete > cible. */
    for (const [id, d] of duelsSuivis) if (tete + 1 > d.t + FENETRE) duelsSuivis.delete(id);
    while (duelsSuivis.size > bornes.suivisMax) duelsSuivis.delete(duelsSuivis.keys().next().value);
    /* ⛔ revue keeper 1 et 2 : jamais avant cible + delaiDuelBlocs ; le vainqueur lu UNE fois (guesses et hash ne changent plus) ;
     *   egalite -> plus suivi ; rejoignant (ou hash illisible) -> attend la marge de fin ; le statut relu juste avant chaque envoi */
    const marge = margeFinDuel(bornes, st.msParBloc, st.intervalleMs);
    const presse = (d) => tete + 1 >= d.t + FENETRE - marge;
    const prets = [...duelsSuivis.entries()].filter(([, d]) => tete > d.t && tete >= d.t + bornes.delaiDuelBlocs).sort((a, b) => a[1].t - b[1].t);
    const out = [];
    let lectures = bornes.statutsParTour;
    for (const [id, d] of prets) {
      /* un duel deja lu, ou le rejoignant gagne, et pas encore presse : rien a lire ce tour-ci */
      if (d.vainqueur !== null && d.vainqueur !== 'createur' && !presse(d)) continue;
      if (lectures <= 0) break;
      lectures -= 1;
      const m = motsDe(await appel(cD, donnees1(SEL_DUELS, id)));
      if (m.length !== 9) { info.sain = false; continue; }
      const s = Number(m[2]);
      if (s === 0) { info.sain = false; continue; } /* noeud en retard : relu au tour suivant */
      if (s !== DUEL_JOINED) { duelsSuivis.delete(id); continue; }
      if (d.vainqueur === null) {
        d.mise = m[8];
        const h = await hashDe(d.t);
        const v = h ? vainqueurDuel(h, m[3], m[6]) : null;
        if (v === 'egalite') { duelsSuivis.delete(id); st.compteurs.duelsEgalites += 1; continue; } /* les deux mises rendues quoi qu il arrive */
        if (v) d.vainqueur = v; /* hash illisible : relu au tour suivant ; traite d ici la comme un rejoignant gagnant (attend la fin) */
      }
      if (d.vainqueur !== 'createur' && !presse(d)) continue;
      out.push({ cible: 'duels', to: cD, ids: [id], fin: d.t + FENETRE, quoi: 'settle', presse: presse(d), mise: d.mise, vainqueur: d.vainqueur || 'inconnu', avant: { t: d.t } });
    }
    /* l ordre des duels : les PRESSES d abord (par echeance), puis ceux ou le createur gagne, par mise DECROISSANTE (puis echeance) */
    out.sort((a, b) => (Number(b.presse) - Number(a.presse)) || (a.presse ? a.fin - b.fin : (b.mise > a.mise ? 1 : b.mise < a.mise ? -1 : a.fin - b.fin)));
    return out;
  }
  /* le hash d UN bloc (la cible d un duel), par le meme cache que les slots */
  async function hashDe(b) {
    if (!hashes.has(b)) {
      const blk = await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]);
      if (blk && /^0x[0-9a-f]{64}$/i.test(String(blk.hash))) hashes.set(b, bas(blk.hash));
    }
    return hashes.get(b) || null;
  }

  /* ---------------------------------------------------------------- rolls : le pot du pass de chaque jour fini (closeDay / drawDay) */
  async function candidatsRolls(cR, tete) {
    if (jours.contrat !== cR) { jours.contrat = cR; jours.finis = new Set(); jours.acheteurs = new Map(); }
    const auj = Slots.lireUint(await appel(cR, SEL_TODAY));
    if (auj === null) throw new Error('today() not read');
    const a = Number(auj); jours.aujourdhui = a;
    for (const k of [...jours.acheteurs.keys()]) if (Number(k) < a - bornes.joursRecul) jours.acheteurs.delete(k);
    for (const k of [...jours.finis]) if (Number(k) < a - bornes.joursRecul) jours.finis.delete(k);
    const out = [];
    for (let d = a - 1; d >= Math.max(0, a - bornes.joursRecul); d--) {
      const k = String(d);
      if (jours.finis.has(k)) continue;
      /* un jour PASSE ne gagne plus d acheteur (buyPass inscrit au jour en cours) : un compte > 0 est garde (il ne sert qu a « il y a des
       *   acheteurs ») ; ⛔ revue keeper 4 : un 0 n est definitif que lu plus d un jour apres la fin du jour (a > d + 1) — avant, un noeud
       *   en retard peut le rendre juste apres minuit : il n est PAS garde, relu au tour suivant */
      if (!jours.acheteurs.has(k)) {
        const n = Slots.lireUint(await appel(cR, donnees1(SEL_BUYER_COUNT, d)));
        if (n === null) throw new Error('buyerCount not read');
        if (n === 0n && a <= d + 1) continue;
        jours.acheteurs.set(k, n);
      }
      if (jours.acheteurs.get(k) === 0n) { jours.finis.add(k); continue; }
      const m = motsDe(await appel(cR, donnees1(SEL_DAY_POTS, d)));
      if (m.length !== 3) throw new Error('dayPots not read');
      const etat = Number(m[2]), t = Number(m[1]), avant = { etat, t };
      if (etat === 2) { jours.finis.add(k); continue; }
      if (etat === 0) { out.push({ cible: 'rolls', to: cR, ids: [k], fin: Infinity, quoi: 'closeDay', avant }); continue; }
      if (etat !== 1) continue;
      /* Armed : drawDay passe si cible < bloc <= cible + 256 ; mine au mieux a tete + 1 ; simule a la tete : tete > cible */
      if (tete <= t) continue;
      if (tete + 1 <= t + FENETRE) out.push({ cible: 'rolls', to: cR, ids: [k], fin: t + FENETRE, quoi: 'drawDay', avant });
      else out.push({ cible: 'rolls', to: cR, ids: [k], fin: Infinity, quoi: 'closeDay', avant }); /* fenetre passee sans tirage : re-armer */
    }
    return out.sort((x, y) => (x.fin === y.fin ? 0 : x.fin < y.fin ? -1 : 1));
  }

  const donneesDe = (k) => (k.cible === 'slots' ? donneesSettleMany(k.ids) : k.cible === 'duels' ? donnees1(SEL_SETTLE, k.ids[0]) : donnees1(k.quoi === 'drawDay' ? SEL_DRAW_DAY : SEL_CLOSE_DAY, k.ids[0]));
  const estimer = async (to, data) => BigInt(await rpc('eth_estimateGas', [{ from: adresse, to, data, value: '0x0' }]));

  /* la simulation d UN candidat : rend { k, estime } ou null (revert : rien a envoyer pour lui) ; jette Passagere sur une panne RPC.
   * slots : un lot qui ne se simule pas est COUPE EN DEUX ; un spin seul qui ne se simule pas est ECARTE (son paiement echoue). */
  async function simuler(k, budget, tete) {
    const essai = async (ids) => {
      if (budget.n <= 0) return null;
      budget.n -= 1;
      const kk = { ...k, ids };
      try { return { k: kk, estime: await estimer(k.to, donneesDe(kk)) }; } catch (e) {
        if (!estRevert(e)) throw new Passagere(msg(e));
        st.compteurs.simulationsRefusees += 1;
        if (k.cible !== 'slots') { erreur('simulation reverted (' + k.quoi + ' ' + k.cible + ' #' + ids[0] + '): ' + msg(e)); return null; }
        if (ids.length === 1) {
          const s = suivis.get(ids[0]);
          ecartes.set(ids[0], s ? s.t : tete); st.compteurs.spinsEcartes += 1;
          erreur('spin #' + ids[0] + ': settling it alone reverts (its payout transfer fails?), left out of the batches: ' + msg(e));
          return null;
        }
        const m = Math.ceil(ids.length / 2);
        return (await essai(ids.slice(0, m))) || (await essai(ids.slice(m)));
      }
    };
    return essai(k.ids);
  }

  /** UN tour : suivre la tx en vol, sinon lire, calculer, et envoyer au plus UNE tx. Rend ce qui a ete fait (pour les tests et /sante). */
  async function tour() {
    if (st.etat !== 'ON') return { fait: false, pourquoi: st.arret ? st.arret.pourquoi : st.etat };
    if (enCours) return { fait: false, pourquoi: 'a round is running' };
    enCours = true; echecsCeTour = 0;
    st.compteurs.tours += 1; st.dernierTour = new Date(maintenant()).toISOString();
    try {
      /* la chaine du noeud = celle de la fiche, verifiee une fois : sinon ARRET (une signature pour une autre chaine ne part jamais) */
      if (!st.chaineVue) {
        const id = await rpc('eth_chainId', []);
        if (BigInt(id) !== BigInt(chainId)) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi: 'the node serves chain ' + BigInt(id) + ', the keeper record says ' + chainId + ' — stopped' }; erreur(st.arret.pourquoi); return { fait: false, pourquoi: st.arret.pourquoi }; }
        st.chaineVue = true;
      }
      if (st.enVol) { const fini = await suivreInclusion(); if (!fini || st.etat !== 'ON') return { fait: false, pourquoi: st.enVol ? 'waiting for the transaction in flight' : st.etat }; }
      const tete = entier(await rpc('eth_blockNumber', []));
      if (tete === null) { erreur('head not read'); return { fait: false, pourquoi: 'head not read' }; }
      await mesurerBloc(tete);
      const cD = duelsCfg ? resoudre(duelsCfg.contrat) : null, cR = rollsCfg ? resoudre(rollsCfg.contrat) : null;
      const info = { sain: true, courts: 0 };
      const listes = { slots: [], duels: [], rolls: [] };
      const lire = async (nom, f) => { try { listes[nom] = await f(); } catch (e) { info.sain = false; erreur(nom + ' not read: ' + msg(e)); } };
      if (c) await lire('slots', () => candidatsSlots(tete, info));
      if (cD) await lire('duels', () => candidatsDuels(cD, tete, info));
      if (cR) await lire('rolls', () => candidatsRolls(cR, tete));
      if (!CONTRATS.some((x) => listes[x].length)) {
        /* ⛔ un tour SAIN (tout lu, aucun echec, rien a faire) remet le compte des echecs a zero */
        if (info.sain && echecsCeTour === 0) { st.echecsSuite = 0; st.compteurs.toursSains += 1; }
        return { fait: false, pourquoi: info.courts ? 'the pot cannot pay any pending spin in full' : 'nothing to settle', courts: info.courts };
      }
      /* ⛔ la borne horaire PAR CONTRAT (revue keeper 2) : un contrat a son plafond ne passe plus, les autres si */
      const t0 = maintenant();
      const pleins = [];
      for (const x of CONTRATS) {
        st.envoisHeure[x] = st.envoisHeure[x].filter((y) => t0 - y < 3600000);
        if (listes[x].length && st.envoisHeure[x].length >= plafondHeure(bornes, x)) { pleins.push(x); st.parContrat[x].sautsHeure += 1; listes[x] = []; }
      }
      if (pleins.length) st.compteurs.sautsHeure += 1;
      /* la plus PRESSEE d abord (le dernier bloc ou elle passe) : chaque contrat garde SON ordre (duels : presses, puis mise), la tete de
       *   chaque liste est comparee ; a echeance egale, l ordre slots, duels, rolls */
      const candidats = [];
      for (const q = { slots: 0, duels: 0, rolls: 0 }; ;) {
        let pris = null;
        for (const x of CONTRATS) { const k = listes[x][q[x]]; if (k && (!pris || k.fin < listes[pris][q[pris]].fin)) pris = x; }
        if (!pris) break;
        candidats.push(listes[pris][q[pris]]); q[pris] += 1;
      }
      if (!candidats.length) return { fait: false, pourquoi: 'hourly cap reached (' + pleins.map((x) => x + ' ' + plafondHeure(bornes, x) + ' tx').join(', ') + ')' };
      /* le prix du gas : base du dernier bloc + pourboire borne ; au-dessus du plafond, on attend */
      const dernier = await rpc('eth_getBlockByNumber', ['latest', false]);
      const base = dernier && dernier.baseFeePerGas ? BigInt(dernier.baseFeePerGas) : null;
      if (base === null) { erreur('base fee not read'); return { fait: false, pourquoi: 'base fee not read' }; }
      let prio = 0n;
      try { prio = BigInt(await rpc('eth_maxPriorityFeePerGas', [])); } catch (_) { prio = 0n; }
      if (prio > bornes.prioWeiMax) prio = bornes.prioWeiMax;
      if (base + prio > bornes.maxFeeWei) { st.compteurs.sautsGas += 1; return { fait: false, pourquoi: 'gas price above the cap (' + (base + prio) + ' > ' + bornes.maxFeeWei + ' wei)' }; }
      const maxFee = 2n * base + prio > bornes.maxFeeWei ? bornes.maxFeeWei : 2n * base + prio;
      /* la simulation : le premier candidat qui se simule part ; un revert passe au suivant ; une panne RPC finit le tour (jamais un echec) */
      let choix = null;
      const budget = { n: bornes.simulationsParTour };
      try {
        for (const k of candidats) { choix = await simuler(k, budget, tete); if (choix || budget.n <= 0) break; }
      } catch (e) {
        if (!(e instanceof Passagere)) throw e;
        st.compteurs.simulationsNonLues += 1; erreur('simulation not run (node error, not counted as a failure): ' + e.message);
        return { fait: false, pourquoi: 'simulation not run' };
      }
      if (!choix) return { fait: false, pourquoi: 'simulation refused' };
      const k = choix.k, data = donneesDe(k);
      const gas = (choix.estime * 12n) / 10n;
      if (gas > bornes.gasMaxParTx) { erreur('gas ' + gas + ' above the per-tx cap'); return { fait: false, pourquoi: 'gas above the per-tx cap' }; }
      const nonce = BigInt(await rpc('eth_getTransactionCount', [adresse, 'pending']));
      const tx = { chainId, nonce, maxPriorityFeePerGas: prio, maxFeePerGas: maxFee, gas, to: k.to, value: 0n, data };
      verifierEnvoi(tx, { contrat: c, chainId, bornes, duels: cD, rolls: cR }); /* ⛔ jette AVANT la signature si quoi que ce soit n est pas un appel admis */
      const signe = signerEip1559(tx, cle);
      if (bas(signe.de) !== bas(adresse)) throw new Error('keeper: the signature does not recover the keeper address');
      try {
        const h = await envoi('eth_sendRawTransaction', [signe.brut]);
        if (h && bas(h) !== bas(signe.hash)) erreur('node returned another hash than the signed one');
      } catch (e) {
        const m = msg(e);
        if (!/already known|known transaction/i.test(m)) {
          /* ⛔ une relance de l envoi (delai depasse, la tx deja minee) repond « nonce too low » / « replacement underpriced » : la tx
           *    SIGNEE ICI (son hash, calcule localement) est cherchee sur la chaine, puis le nonce, avant de parler d echec */
          let retrouvee = false;
          if (/nonce too low|nonce has already been used|replacement transaction underpriced|replacement fee too low/i.test(m)) {
            try {
              if (await rpc('eth_getTransactionReceipt', [signe.hash])) retrouvee = true;
              else if (await rpc('eth_getTransactionByHash', [signe.hash])) retrouvee = true;
              else if (BigInt(await rpc('eth_getTransactionCount', [adresse, 'latest'])) > nonce) retrouvee = true;
            } catch (e2) { retrouvee = true; erreur('send answered "' + m.slice(0, 60) + '" and the check could not read the node (' + msg(e2) + '): tracked until the inclusion timeout'); }
          }
          if (!retrouvee) { echec(nomTx(k) + ': send refused: ' + m, 'envoisRefuses', k.cible); return { fait: false, pourquoi: 'send refused' }; }
          st.compteurs.envoisRetrouves += 1; erreur('send answered "' + m.slice(0, 60) + '"; the signed tx (or its nonce) is on chain: tracked, not a failure');
        }
      }
      st.enVol = { hash: signe.hash, cible: k.cible, to: k.to, quoi: k.quoi, ids: k.ids, a: maintenant(), nonce: nonce.toString(), avant: k.avant || null };
      st.envoisHeure[k.cible].push(t0);
      st.compteurs.envois += 1; if (k.cible === 'slots') st.compteurs.spinsEnvoyes += k.ids.length;
      const de = { a: new Date(t0).toISOString(), hash: signe.hash, ids: k.ids, quoi: k.quoi, maxFeeWei: maxFee.toString(), gas: gas.toString() };
      st.parContrat[k.cible].envois += 1; st.parContrat[k.cible].dernierEnvoi = de;
      st.dernierEnvoi = { ...de, cible: k.cible };
      return { fait: true, hash: signe.hash, ids: k.ids, cible: k.cible, quoi: k.quoi };
    } catch (e) {
      erreur('round failed: ' + msg(e));
      return { fait: false, pourquoi: 'round failed' };
    } finally { enCours = false; }
  }

  const heure = (x) => st.envoisHeure[x].filter((y) => maintenant() - y < 3600000).length;
  return {
    /** l etat PUBLIABLE (/sante) : jamais la cle */
    etat: () => {
      const cD = duelsCfg ? resoudre(duelsCfg.contrat) : null, cR = rollsCfg ? resoudre(rollsCfg.contrat) : null;
      return {
        etat: st.etat, adresse: st.adresse, contrat: c, chaine: chainId, chaineVerifiee: st.chaineVue, depuis: st.depuis, msParBlocMesure: st.msParBloc, intervalleMs: st.intervalleMs,
        fenetreSecondes: st.msParBloc ? Slots.secondesFenetre(st.msParBloc) : null, suivis: suivis.size, enVol: st.enVol ? { hash: st.enVol.hash, cible: st.enVol.cible, quoi: st.enVol.quoi, ids: st.enVol.ids } : null,
        dernierTour: st.dernierTour, dernierEnvoi: st.dernierEnvoi, dernierRegle: st.dernierRegle, erreurs: st.erreurs.slice(), echecsSuite: st.echecsSuite, arret: st.arret,
        /* revue keeper 3 : l etat DEGRADE (ON, mais des echecs en cours : recu illisible, revert, envoi refuse, non incluse) — dit, jamais tu */
        degrade: st.etat === 'ON' && st.echecsSuite > 0 ? { echecsSuite: st.echecsSuite, arretA: bornes.echecsMax, dernier: st.dernierEchec } : null,
        envoisDerniereHeure: CONTRATS.reduce((s, x) => s + heure(x), 0), compteurs: { ...st.compteurs },
        /* 2026-10-24 : l activite PAR CONTRAT (/sante) ; revue keeper 2 : son plafond horaire et ses envois de l heure */
        contrats: {
          slots: { contrat: c, suivis: suivis.size, ecartes: [...ecartes.keys()], envoisDerniereHeure: heure('slots'), plafondHeure: plafondHeure(bornes, 'slots'), ...st.parContrat.slots },
          duels: { contrat: cD, configure: !!duelsCfg, suivis: duelsSuivis.size, envoisDerniereHeure: heure('duels'), plafondHeure: plafondHeure(bornes, 'duels'), ...st.parContrat.duels },
          rolls: { contrat: cR, configure: !!rollsCfg, aujourdhui: jours.aujourdhui, joursClos: [...jours.finis], envoisDerniereHeure: heure('rolls'), plafondHeure: plafondHeure(bornes, 'rolls'), ...st.parContrat.rolls },
        },
        bornes: { spinsParTx: bornes.spinsParTx, maxFeeWei: String(bornes.maxFeeWei), txParHeure: Object.fromEntries(CONTRATS.map((x) => [x, plafondHeure(bornes, x)])), gasMaxParTx: String(bornes.gasMaxParTx), echecsMax: bornes.echecsMax, simulationsParTour: bornes.simulationsParTour, joursRecul: bornes.joursRecul,
          delaiDuelBlocs: bornes.delaiDuelBlocs, margeFinDuelBlocs: margeFinDuel(bornes, st.msParBloc, st.intervalleMs) },
      };
    },
    tour,
    /** la boucle : un tour, puis le suivant apres intervalleMs (re-derive a chaque tour) ; unref : ne retient pas le processus */
    demarrer() {
      const boucle = async () => { await tour(); if (st.etat === 'ON') { minuteur = setTimeout(boucle, st.intervalleMs); minuteur.unref?.(); } };
      minuteur = setTimeout(boucle, 5000); minuteur.unref?.();
      return true;
    },
    arreter() { clearTimeout(minuteur); minuteur = null; },
  };
}
