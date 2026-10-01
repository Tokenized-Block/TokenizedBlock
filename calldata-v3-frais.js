/* calldata-v3-frais.js — LA JAMBE UNISWAP v3 QUI PORTE NOTRE FRAIS, EN UNE SEULE TRANSACTION.
 *
 * ⛔⛔ CE MODULE NE SIGNE RIEN ET N ENVOIE RIEN. Il rend `{ to, data, value }`. Un wallet humain
 *     execute. Aucun reseau, aucune horloge : tout ce qui varie entre par parametre, pour que le
 *     module soit rejouable a l octet.
 *
 * ⭐⭐ POURQUOI IL EXISTE, ET LA MESURE QUI L A DECIDE (2026-10-01). Deux actifs que l app PROPOSE
 *   etaient injoignables par nos rails, et ce n est pas un probleme de hook :
 *       TOSHI  1 189 464 $ de liquidite — 0 marche atteignable sur 245
 *       cbBTC  2 200 168 $ de liquidite — 0 marche atteignable, ALORS QUE le hook V8 l ADMET
 *   TOSHI est le premier memecoin-stock de l app. Sa pool, lue sur la chaine et non sur un
 *   agregateur : `0x4b0aaf3ebb163dd45f663b38b6d93f6093ebc2d3`, `factory()` =
 *   `0x33128a8fc17869897dce68ed026d694621f6fdfd` = **Uniswap V3 sur Base**, paire WETH/TOSHI,
 *   `fee()` 10000, `tickSpacing()` 200.
 *   ⛔ Notre serveur rendait `famille: "autre"` : ca voulait dire « la factory AERODROME ne le
 *     reconnait pas », PAS « on ne sait pas ou il est ». Lire le premier comme le second aurait
 *     classe TOSHI « sans marche » — il a 1,19 M$.
 *
 * ⛔⛔ CE QUE `calldata-v3.js` NE SAVAIT PAS FAIRE, ET POURQUOI CA COMPTE. Il construit le swap v3,
 *     mais ne prend AUCUN frais. Router TOSHI dessus aurait fait passer du volume pour ZERO revenu.
 *     Ce depot vit de ce prelevement ; un rail qui ne preleve pas n est pas un rail, c est un cadeau.
 *
 * ⭐ LA MESURE QUI DEBLOQUE, FAITE AVEC SON TEMOIN NEGATIF (2026-10-01, `eth_call` lecture seule
 *   sur le routeur `0x6ff5693b99212DA76aD316178A184AB56D299b43`) :
 *       0x00  V3_SWAP_EXACT_IN   -> revert AUTRE que InvalidCommandType  = reconnue
 *       0x04  SWEEP              -> revert AUTRE que InvalidCommandType  = reconnue
 *       0x06  PAY_PORTION        -> PASSE                                 = reconnue
 *       0x3f  temoin invente     -> InvalidCommandType 0xd76a1e9e
 *       0x2e  second temoin      -> InvalidCommandType 0xd76a1e9e
 *   ⛔ SANS LES DEUX TEMOINS, CES TROIS « OUI » NE VAUDRAIENT RIEN : un routeur qui accepterait
 *     n importe quel octet rendrait exactement le meme resultat. Ce sont eux qui prouvent que la
 *     question a ete posee. Et `0x00`/`0x04` qui revertent « autrement », c est le bon signe : ils
 *     ont passe le dispatch et se sont plaints de leur INPUT, pas de leur existence.
 *
 * ⛔⛔⛔ LE MEILLEUR PROFIL DE NOS QUATRE RAILS, ET C EST LA RAISON DE LE PREFERER :
 *       · UNE SEULE TRANSACTION — les trois commandes vivent dans le MEME `execute` ;
 *       · AUCUNE ATOMICITE A DEMANDER — donc il marche pour un EOA ordinaire, la ou le
 *         franchissement exige un smart wallet capable de `wallet_sendCalls` ;
 *       · le frais est pris sur la SORTIE, par le routeur lui-meme, avant que l acheteur ne touche
 *         quoi que ce soit : il ne peut pas etre « oublie » par une seconde transaction qui ne part
 *         jamais. Sur Aerodrome, nos deux appels sont INDEPENDANTS — si le second ne part pas, le
 *         frais est perdu. Ici, c est structurellement impossible.
 *   ⚠️ ET LE PRIX A PAYER, QU ON NE CACHE PAS : la v3 passe par PERMIT2, donc DEUX signatures
 *     (`echange-v3.js` l a mesure), la ou Aerodrome n en demande qu une par une allowance directe.
 *
 * ⚠️ CE QUE CE MODULE NE PROUVE PAS : qu un swap aboutisse. Le glissement, la profondeur au bloc et
 *   l existence de la pool (jetonA, fee, jetonB) ne sont pas simules ici. Un `fee` qui ne
 *   correspond a aucune pool fait reverter a l EXECUTION, pas a la construction.
 */
import { selecteur, mot, motAdr, dyn } from './pool.js';
import { encoderChemin, ROUTEUR_UNIVERSEL, COMMANDE_V3_SWAP_EXACT_IN } from './calldata-v3.js';

/** ⛔ MESUREES, pas recitees — voir l en-tete, temoins compris. */
export const COMMANDE_SWEEP = '04';
export const COMMANDE_PAY_PORTION = '06';

/**
 * Les deux constantes d adresse du routeur universel.
 *
 * ⛔⛔ ELLES SONT DECLAREES ICI MAIS PROUVEES AILLEURS — par le banc sur fork, aux SOLDES. Un
 *     module ne peut pas prouver qu une sentinelle designe bien « le routeur lui-meme » : seule
 *     l execution le montre. Si `ROUTEUR_LUI_MEME` etait faux, la sortie du swap partirait a
 *     l adresse `0x…02` reelle et serait PERDUE — et le calldata serait parfaitement valide.
 *     C est exactement le genre d erreur qui ne reverte pas.
 */
export const ROUTEUR_LUI_MEME = '0x0000000000000000000000000000000000000002';
export const APPELANT = '0x0000000000000000000000000000000000000001';

/** ⛔ LE MEME PLAFOND QUE LA JAMBE AERODROME, importe en esprit et redit ici : un frais au-dessus
 *   de 1 % n est plus un frais d interface, c est une ponction. Un plafond cote construction
 *   empeche qu un reglage errone parte en production. */
export const FRAIS_BPS_MAX_PRUDENT = 100n;
export const BASE_BPS = 10000n;

const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (a) => String(a || '').toLowerCase();

/**
 * Ce que l acheteur doit recevoir AU MINIMUM une fois le frais preleve.
 *
 * ⛔⛔ ON ARRONDIT LE FRAIS VERS LE BAS, DONC LE MINIMUM DE L ACHETEUR VERS LE BAS AUSSI. Le routeur
 *     calcule `sortie * bips / BASE` en division entiere : il prend au plus ce que cette formule
 *     donne. Si on exigeait pour l acheteur `total - ceil(frais)`, un wei d arrondi ferait reverter
 *     le SWEEP sur une transaction par ailleurs parfaite. Un garde juste au wei pres qui fait
 *     echouer le cas nominal est un garde qui coute de l argent.
 * ⛔ ET ON NE REND JAMAIS ZERO : un minimum a zero autoriserait le routeur a tout donner au frais.
 */
export function minimumAcheteur(sortieMinimumTotale, fraisBps) {
  const t = BigInt(sortieMinimumTotale);
  const b = BigInt(fraisBps);
  if (t <= 0n) return 0n;
  return t - (t * b) / BASE_BPS;
}

/**
 * Un swap v3 exact-in QUI PREND NOTRE FRAIS, en une transaction.
 *
 * @param {object} p
 * @param {object[]} p.sauts                 [{ de, vers, fee }] — au moins un
 * @param {string}   p.acheteur              qui recoit la sortie nette
 * @param {string}   p.beneficiaireFrais     ou va le frais
 * @param {bigint}   p.fraisBps              en points de base, > 0 et <= FRAIS_BPS_MAX_PRUDENT
 * @param {bigint}   p.amountIn
 * @param {bigint}   p.sortieMinimumTotale   ⛔ AVANT frais, et > 0
 * @param {bigint}   p.deadline              instant ABSOLU, en secondes
 * @param {bigint}   [p.maintenant]          instant de reference, pour juger le deadline
 * @param {number}   [p.chaine]
 */
export function calldataV3AvecFrais({ sauts, acheteur, beneficiaireFrais, fraisBps,
  amountIn, sortieMinimumTotale, deadline, maintenant = null, chaine = 8453 } = {}) {
  const R = ROUTEUR_UNIVERSEL[Number(chaine)];
  if (!R) return { etat: 'REFUSE', pourquoi: 'no Universal Router measured on this network' };

  /* ── LE FRAIS ────────────────────────────────────────────────────────────────────────────── */
  const bps = BigInt(fraisBps === undefined || fraisBps === null ? -1 : fraisBps);
  /* ⛔⛔ UN FRAIS A ZERO EST REFUSE, ET CE N EST PAS UN CAPRICE. Ce module existe POUR prelever ;
   *     construire silencieusement un swap gratuit redonnerait exactement le defaut qu il corrige,
   *     sans que personne ne le voie. Qui veut un swap sans frais appelle `calldata-v3.js`. */
  if (bps <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'fraisBps must be greater than zero — this builder exists to '
      + 'take the fee; for a fee-free swap use calldataV3ExactIn' };
  }
  if (bps > FRAIS_BPS_MAX_PRUDENT) {
    return { etat: 'REFUSE', pourquoi: 'fraisBps above ' + FRAIS_BPS_MAX_PRUDENT
      + ' bps is not an interface fee' };
  }

  /* ── LES ADRESSES ────────────────────────────────────────────────────────────────────────── */
  for (const [nom, v] of [['acheteur', acheteur], ['beneficiaireFrais', beneficiaireFrais]]) {
    if (!ADR.test(String(v || ''))) {
      return { etat: 'REFUSE', pourquoi: 'a whole ' + nom + ' address is required' };
    }
    if (/^0x0{40}$/i.test(String(v))) {
      return { etat: 'REFUSE', pourquoi: nom + ' cannot be the zero address' };
    }
    /* ⛔⛔ LE ROUTEUR COMME DESTINATAIRE EST UN PIEGE REEL : il accepte d etre destinataire pour
     *     chainer des commandes, donc l y mettre par erreur laisse les jetons chez lui SANS AUCUNE
     *     ERREUR. `calldata-v3.js` porte deja ce refus ; il doit valoir pour les DEUX adresses ici,
     *     parce qu un frais envoye au routeur serait perdu aussi silencieusement qu une sortie. */
    if (bas(v) === bas(R)) {
      return { etat: 'REFUSE', pourquoi: nom + ' cannot be the router itself: it accepts being the '
        + 'recipient to chain commands, so the tokens would silently stay there' };
    }
    /* ⛔ ET PAS NON PLUS LES SENTINELLES. `0x…01` et `0x…02` ne sont pas des adresses, ce sont des
     *   ordres adresses au routeur. Les accepter comme destinataire rendrait un calldata dont le
     *   sens depend d un detail d implementation du routeur, pas de notre intention. */
    if (bas(v) === bas(ROUTEUR_LUI_MEME) || bas(v) === bas(APPELANT)) {
      return { etat: 'REFUSE', pourquoi: nom + ' cannot be a router sentinel address (' + APPELANT
        + ' or ' + ROUTEUR_LUI_MEME + '): those are instructions, not recipients' };
    }
  }
  /* ⛔⛔ ET LES DEUX NE PEUVENT PAS ETRE LA MEME ADRESSE. Si l acheteur EST le beneficiaire, le
   *     `PAY_PORTION` lui rend ses propres jetons et le frais vaut ZERO — une transaction qui
   *     reussit, qui a l air d avoir preleve, et qui n a rien preleve. Exactement le motif
   *     `estWalletDeFrais(compte) ? 0n` qui fait qu un test depuis a6cf est toujours vert. */
  if (bas(acheteur) === bas(beneficiaireFrais)) {
    return { etat: 'REFUSE', pourquoi: 'acheteur and beneficiaireFrais are the same address: the fee '
      + 'would be paid back to the buyer, so the transaction would succeed having taken nothing' };
  }

  /* ── LES MONTANTS ────────────────────────────────────────────────────────────────────────── */
  const entree = BigInt(amountIn === undefined || amountIn === null ? 0 : amountIn);
  if (entree <= 0n) return { etat: 'REFUSE', pourquoi: 'amountIn must be greater than zero' };
  const minTotal = BigInt(sortieMinimumTotale === undefined || sortieMinimumTotale === null
    ? 0 : sortieMinimumTotale);
  /* ⛔⛔ UN MINIMUM A ZERO AUTORISE LA POOL A RENDRE PRESQUE RIEN POUR LA TOTALITE DE L ENTREE —
   *     un cadeau ouvert a quiconque regarde la mempool. `calldata-v3.js` porte le meme refus. */
  if (minTotal <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'sortieMinimumTotale must be greater than zero — a zero '
      + 'minimum lets the pool return almost nothing for the whole input' };
  }
  const minAcheteur = minimumAcheteur(minTotal, bps);
  /* ⛔ ZERO PAR IMPOSSIBILITE : avec bps <= 100 et minTotal > 0, le minimum de l acheteur ne peut
   *   etre nul que si minTotal vaut 1 wei et que l arrondi mange tout. On le dit plutot que de
   *   laisser partir un SWEEP a zero, qui autoriserait le routeur a tout verser au frais. */
  if (minAcheteur <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'the buyer minimum rounds down to zero at this size: a zero '
      + 'sweep minimum would let the whole output go to the fee' };
  }

  /* ── LE DEADLINE ─────────────────────────────────────────────────────────────────────────── */
  const dl = BigInt(deadline === undefined || deadline === null ? 0 : deadline);
  if (dl <= 0n) return { etat: 'REFUSE', pourquoi: 'an absolute deadline in seconds is required' };
  let noteDeadline = 'not judged — no reference instant was given';
  if (maintenant !== null && maintenant !== undefined) {
    const now = BigInt(maintenant);
    if (dl <= now) return { etat: 'REFUSE', pourquoi: 'the deadline is already in the past' };
    if (dl - now > 1800n) {
      return { etat: 'REFUSE', pourquoi: 'the deadline is more than 30 minutes out; a far deadline '
        + 'stays executable long after the price has moved' };
    }
    noteDeadline = 'ok — ' + String(dl - now) + ' s ahead of the given instant';
  }

  /* ── LE CHEMIN ───────────────────────────────────────────────────────────────────────────── */
  const chemin = encoderChemin(sauts);
  if (chemin.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'path refused: ' + chemin.pourquoi };
  const jetonSortie = chemin.sortie;
  /* ⛔⛔ LE JETON SUR LEQUEL ON PRELEVE EST CELUI QUE LE CHEMIN REND, PAS UN PARAMETRE. Le laisser
   *     entrer de l exterieur permettrait de prelever sur un jeton que le routeur ne detient pas :
   *     `PAY_PORTION` prendrait alors une part de ZERO, sans reverter. Le frais serait nul et la
   *     transaction verte. Une valeur deduite ne peut pas diverger de sa source. */

  /* ── LES TROIS COMMANDES, DANS UN SEUL `execute` ─────────────────────────────────────────── */
  /* 1. le swap verse au ROUTEUR, pas a l acheteur : c est ce qui permet aux deux commandes
   *    suivantes d avoir quelque chose a repartir. `payerIsUser` est VRAI — l entree vient du
   *    wallet de l acheteur (via PERMIT2), pas du solde du routeur. */
  const TETE = 5;
  const inputSwap = motAdr(ROUTEUR_LUI_MEME) + mot(entree) + mot(minTotal) + mot(TETE * 32)
    + mot(1) + dyn(chemin.hex);
  /* 2. notre frais, en part de ce que le routeur detient maintenant. */
  const inputFrais = motAdr(jetonSortie) + motAdr(beneficiaireFrais) + mot(bps);
  /* 3. le reste part chez l acheteur, avec SON minimum — c est ce minimum qui le protege, pas le
   *    notre : le minimum du swap porte sur le TOTAL, avant prelevement. */
  const inputSweep = motAdr(jetonSortie) + motAdr(acheteur) + mot(minAcheteur);

  /* ⛔⛔ L ORDRE EST EXIGE, PAS COSMETIQUE. `SWEEP` envoie TOUT le solde du jeton : place avant
   *     `PAY_PORTION`, il viderait le routeur et le frais vaudrait zero — sans revert, sans trace.
   *     C est le meme motif que « le frais jamais preleve » deja paye ici. */
  const commands = dyn(COMMANDE_V3_SWAP_EXACT_IN + COMMANDE_PAY_PORTION + COMMANDE_SWEEP);

  const blocs = [inputSwap, inputFrais, inputSweep].map((x) => dyn(x));
  /* ⛔ LES OFFSETS SONT CALCULES, JAMAIS ECRITS EN DUR. Trois mots de tete, puis chaque bloc a la
   *   suite — et un offset faux ne reverte pas toujours : il peut designer des octets qui se
   *   decodent en autre chose. */
  let courant = BigInt(blocs.length) * 32n;
  const offsets = [];
  for (const b of blocs) { offsets.push(courant); courant += BigInt(b.length / 2); }

  const offCommands = 0x60n;
  const offInputs = offCommands + BigInt(commands.length / 2);
  const data = '0x' + selecteur('execute(bytes,bytes[],uint256)')
    + mot(offCommands) + mot(offInputs) + mot(dl)
    + commands
    + mot(blocs.length) + offsets.map((o) => mot(o)).join('') + blocs.join('');

  return {
    etat: 'PRET',
    to: R,
    data,
    /* ⛔ AUCUN ETHER : cette jambe echange deux ERC-20. Un swap qui PART de l ETH natif demanderait
     *   une commande d enveloppement en plus, et ce module ne la construit pas. */
    value: '0x0',
    resume: {
      sauts: sauts.length,
      entree: chemin.entree,
      sortie: jetonSortie,
      fraisBps: bps,
      beneficiaireFrais: bas(beneficiaireFrais),
      sortieMinimumTotale: minTotal,
      recoitAuMoins: minAcheteur,
      commandes: ['V3_SWAP_EXACT_IN', 'PAY_PORTION', 'SWEEP'],
      exigeAtomique: false,
      noteDeadline,
      /* ⚠️ DIT A L APPELANT CE QUE CE PLAN LUI COUTE EN GESTES, parce que ca change le choix de
       *   rail : deux signatures PERMIT2 contre une allowance directe sur Aerodrome. */
      viaPermit2: true,
    },
  };
}
