/* LE DERNIER RECOURS : LIRE LA CHAINE PAR NOTRE SERVEUR QUAND LES NOEUDS PUBLICS REFUSENT.
 *
 * ⭐⭐ POURQUOI CE MODULE EXISTE, ET LA MESURE QUI L A SORTI. Le 2026-10-01, le Grok Bot a ouvert
 *   l app depuis SA machine et a releve dans sa console :
 *       429  https://mainnet.base.org/
 *       403  https://base-rpc.publicnode.com/
 *       400  https://base.drpc.org/
 *   J ai mesure LES MEMES TROIS endpoints depuis ma machine dans la minute : HTTP 200 partout, meme
 *   bloc. Ce ne sont donc PAS des pannes — ce sont des refus PAR CLIENT. Un 403 et un 400 sont des
 *   refus d ORIGINE, pas des indisponibilites.
 *   ⇒ ET L APP LIT LA CHAINE DEPUIS LE NAVIGATEUR DU VISITEUR. Les trois adresses de `RESEAUX` sont
 *     PUBLIQUES (`publicnode` puis `mainnet.base.org` puis `drpc`), donc un visiteur refusé par son
 *     egress les perd TOUTES LES TROIS d un coup : il ne reste aucun secours, et tout l ecran tombe
 *     en « Market unread ». Ni notre code, ni le block.
 *   ⇒ Notre SERVEUR, lui, lit la chaine sans difficulte — il sert deja `/api/trending`,
 *     `/api/prix-usd` et `/api/cle` depuis la chaine. La capacite existait ; personne ne la
 *     proposait au navigateur.
 *
 * ⛔⛔⛔ LA BORNE QUI COMPTE PLUS QUE TOUTES LES AUTRES : **AUCUNE ECRITURE, JAMAIS**.
 *   `eth_sendRawTransaction` et toute la famille `eth_sign*` / `personal_*` / `wallet_*` sont
 *   INTERDITS. Relayer une transaction signee ferait de nous un DIFFUSEUR, ce qui est une
 *   responsabilite d une tout autre nature que « lire » : on deviendrait le dernier maillon entre
 *   une signature et la chaine, pour des fonds qui ne sont pas les notres.
 *   ⇒ ET C EST UNE LISTE BLANCHE, PAS UNE LISTE NOIRE. Une liste noire laisse passer ce qu on n a
 *     pas pense a interdire — et les clients RPC inventent des methodes tous les mois. Ici, ce qui
 *     n est pas NOMME est refuse.
 *
 * ⛔ ET CE N EST PAS LE PREMIER CHOIX, C EST LE DERNIER. Si le navigateur l appelait d emblee, notre
 *   serveur paierait la lecture de CHAQUE visiteur et se ferait limiter a son tour — on aurait
 *   deplace le probleme sur un seul point, au lieu de le repartir. Le navigateur n y vient que
 *   lorsque tous les noeuds publics ont echoue.
 */

/**
 * LES METHODES QU ON ACCEPTE DE RELAYER. ⛔ Liste blanche : ce qui n est pas ici est REFUSE.
 * Chacune est une LECTURE, et chacune est reellement utilisee par l app.
 */
export const METHODES_RELAYEES = Object.freeze([
  'eth_blockNumber',
  'eth_call',
  'eth_getCode',
  'eth_getLogs',
  'eth_getBalance',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_getBlockByNumber',
  'eth_chainId',
]);

/** ⛔ Nommees pour que le refus puisse DIRE pourquoi, au lieu d un « non » muet. */
export const FAMILLES_INTERDITES = Object.freeze([
  'eth_sendRawTransaction', 'eth_sendTransaction',
  'eth_sign', 'eth_signTransaction', 'eth_signTypedData',
  'personal_sign', 'personal_unlockAccount',
  'wallet_sendCalls', 'wallet_sendTransaction',
  'anvil_', 'hardhat_', 'evm_', 'debug_', 'admin_', 'miner_', 'txpool_',
]);

/** ⛔ Un corps de requete demesure n est pas une lecture, c est une charge. */
export const TAILLE_MAX_OCTETS = 32 * 1024;
/** ⛔ Un lot illimite permettrait de faire passer mille appels pour un. */
export const PARAMS_MAX = 8;

const estEcriture = (m) => FAMILLES_INTERDITES.some((f) => (f.endsWith('_') ? m.startsWith(f) : m === f));

/**
 * CE RELAIS ACCEPTE-T-IL CETTE REQUETE ?
 *
 * @returns {{ok:boolean, pourquoi:string|null, categorie:string|null}}
 *
 * ⛔ LE REFUS PORTE UNE CATEGORIE, parce qu un compteur par categorie dira si ce relais sert
 *   vraiment aux visiteurs refuses — ou s il sert surtout a autre chose. Un relais dont on ne
 *   mesure pas l usage est un relais qu on ne saura pas fermer.
 */
export function relaisAccepte({ methode, params, tailleOctets } = {}) {
  if (typeof methode !== 'string' || !methode) {
    return { ok: false, categorie: 'forme', pourquoi: 'a method name is required' };
  }
  /* ⛔⛔ L INTERDIT EST TESTE AVANT LA LISTE BLANCHE, et ce n est pas redondant : si une ecriture
   *   entrait un jour dans la liste blanche par erreur, ce controle la rattraperait quand meme.
   *   Deux gardes qui se recouvrent valent mieux qu une seule sur le chemin de l argent. */
  if (estEcriture(methode)) {
    return { ok: false, categorie: 'ecriture',
      pourquoi: 'this relay never broadcasts or signs anything — it reads the chain, nothing else' };
  }
  if (!METHODES_RELAYEES.includes(methode)) {
    return { ok: false, categorie: 'hors_liste',
      pourquoi: 'this relay only forwards the ' + METHODES_RELAYEES.length
        + ' read methods the app actually uses, and this is not one of them' };
  }
  if (params !== undefined && params !== null && !Array.isArray(params)) {
    return { ok: false, categorie: 'forme', pourquoi: 'params must be an array when present' };
  }
  if (Array.isArray(params) && params.length > PARAMS_MAX) {
    return { ok: false, categorie: 'taille',
      pourquoi: 'at most ' + PARAMS_MAX + ' parameters — a longer call is not a read, it is a batch' };
  }
  if (typeof tailleOctets === 'number' && tailleOctets > TAILLE_MAX_OCTETS) {
    return { ok: false, categorie: 'taille',
      pourquoi: 'the request body is over ' + TAILLE_MAX_OCTETS + ' bytes' };
  }
  return { ok: true, categorie: null, pourquoi: null };
}

/**
 * LA PHRASE DU REFUS, pour l ecran. ⛔ Elle dit ce qu on ne fait PAS, pas seulement « non ».
 * Un visiteur qui lit « refuse » cherche ce qu il a mal fait ; un visiteur qui lit « ce relais ne
 * diffuse rien » comprend la frontiere.
 */
export function phraseRefusRelais(r) {
  if (!r || r.ok) return null;
  return 'Not forwarded: ' + (r.pourquoi || 'unknown') + '.';
}
