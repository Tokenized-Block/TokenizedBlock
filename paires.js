// paires.js — avec quoi un block peut etre paire au lancement : ETH, USDC, une action, ou un jeton.
// ================================================================================================
// ⛔⛔ PAIRER = CHOISIR LA DEVISE DE COTATION DE LA POOL. Mesure du 2026-09-09 sur trois launches
//    OpenLaunch : la paire EST la devise contre laquelle la pool s ouvre (ETH, GITLAWB, COINc, AAPLc).
//    Aucune magie de plus — et donc aucune promesse de plus a l ecran.
//
// ⛔⛔ DECISION DE PHIL, 2026-09-12 : « le paired, tu peux choisir un stock dispo via Coinbase, ou un
//    token qu ils veulent ». L ANCIEN ecran refuse les actions (et renvoie vers OpenLaunch) ; ce
//    module ne le contredit pas en silence — il sert le NOUVEL ecran, et l ancien reste tel quel.
//
// ⛔ UNE ADRESSE N EST JAMAIS APPELEE « ACTION » SI ELLE N EST PAS DANS LE REGISTRE. Le registre est
//    RECOPIE de `index.html` (STOCKS_BASE_REGISTRY, liste publiee des emetteurs Coinbase B20), et
//    `test-paires.mjs` le compare au fichier. Un ticker invente mettrait l argent de quelqu un dans
//    un jeton que personne n a verifie.
//
// ⛔ UN JETON SAISI A LA MAIN EST DIT « TYPED BY YOU, NOT VERIFIED ». On l accepte (Phil le veut), on
//    ne le blanchit pas : ni nom, ni logo, ni etiquette empruntes.

export const ETH_NATIF = '0x0000000000000000000000000000000000000000';

/** Les devises « de base ». ⛔ Adresses recopiees de `DEVISES` dans index.html. */
/** TBLOCK — standard quote for new blocks (mainnet). Address from tokenomics / B20Created. */
export const TBLOCK_MAINNET = '0xb20000000000000000000024c30d3fcb7931272e';

/* ⛔⛔ ETH D ABORD (Phil, 2026-09-18 : « la pool sur ETH par defaut, oublie le TBLOCK paired — gros
 *    probleme »). Un block paire a TBLOCK ne s achete QU avec du TBLOCK, qu un nouvel utilisateur n a
 *    pas : son propre block lui etait inachetable des la naissance. L ordre de cette liste est le premier
 *    choix montre a l ecran — ETH en tete, TBLOCK reste disponible mais n est plus « le standard ». */
export const DEVISES_BASE = [
  { adr: ETH_NATIF, symbole: 'ETH', nom: 'Ether (native) — recommended', type: 'NATIF', chaines: [8453, 84532] },
  { adr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbole: 'USDC', nom: 'USD Coin', type: 'STABLE', chaines: [8453] },
  /* cbBTC : adresse lue sur Blockscout (« Coinbase Wrapped BTC », 623 614 detenteurs, 8 decimales) — les homonymes sont des imitations */
  { adr: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbole: 'cbBTC', nom: 'Coinbase Wrapped BTC', type: 'MAJEUR', chaines: [8453] },
  /* ⛔⛔ `lancePubliquement: false` — DECISION DE PHIL, 2026-09-24 : « retirer le TBLOCK de la, car
   *     le coin est pas reellement lance au public ». Il le disait du selecteur « From » du Swap.
   *   ⇒ MESURE QUI VA DANS LE MEME SENS, faite le meme jour : TBLOCK fait partie des 7 jetons
   *     detenus par le wallet de frais, et AUCUN des 7 n a de marche vivant (croise avec les 268
   *     marches suivis). Proposer TBLOCK comme monnaie d echange, c est proposer d echanger quelque
   *     chose qui ne s echange pas.
   *   ⛔ Le jeton RESTE dans cette liste : d autres ecrans s en servent legitimement, et le retirer
   *     d un coup casserait les blocks deja cotes en TBLOCK. C est le drapeau qui le retire des
   *     endroits ou on PROPOSE un echange. */
  { adr: TBLOCK_MAINNET, symbole: 'TBLOCK', nom: 'TokenizedBlock — buyers need TBLOCK to buy', type: 'TBLOCK', chaines: [8453], lancePubliquement: false },
  /* ⛔⛔ TOSHI, AJOUTE LE 2026-09-27 (Phil : « ajoute Toshi »), ET *PAS* COMME UN B20.
   *     L adresse a ete RESOLUE par l API DexScreener, jamais rappelee de memoire — completer une
   *     adresse de tete a deja envoye une enquete entiere sur une fausse piste dans ce projet.
   *   ⛔⛔ CE QU IL EST, TECHNIQUEMENT, avec temoin positif le meme jour :
   *         TOSHI  `eth_getCode` = 0x608060405260… (23 898 caracteres de bytecode ordinaire)
   *         TBLOCK `eth_getCode` = 0xef  ← le marqueur B20, EXACTEMENT
   *       TOSHI n a pas le prefixe `0xb2` et n est donc PAS un B20. On ne l affichera JAMAIS comme
   *       tel — ce serait l usurpation que ce depot chasse ailleurs. Type MAJEUR, rang de cbBTC.
   *   ⛔ MAIS CETTE DISTINCTION EST INTERNE, ET N A RIEN A FAIRE DANS LE NOM QUE L UTILISATEUR LIT.
   *     Le produit, c est qu on rend N IMPORTE QUEL actif en block : les actions tokenisees sont
   *     exactement ca. Coter un block en TOSHI est donc le concept, pas une exception a excuser.
   *     Un libelle « not a B20 » dans un selecteur de paire repond a une question que personne ne
   *     se pose et jette un doute la ou il n y en a pas.
   *   ✅ CE QUI JUSTIFIE SA PRESENCE : un marche REEL, mesure le jour meme — 1 230 755 $ de
   *     liquidite sur Uniswap. C est la seule chose qui compte pour une devise de paire : qu on
   *     sache lire son prix, et qu il y ait de quoi echanger en face. */
  { adr: '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4', symbole: 'TOSHI', nom: 'Toshi — quote your block in TOSHI', type: 'MAJEUR', chaines: [8453] },
];

/**
 * Peut-on PROPOSER d echanger cet actif ? Un actif sans marche public ne se propose pas : le
 * choisir menerait a un echange impossible, decouvert apres coup.
 * ⛔ FAIL-OPEN ASSUME ET EXPLIQUE : l absence de drapeau vaut « lance ». Les dizaines d entrees
 *   existantes (ETH, USDC, cbBTC, actions) n en portent pas, et exiger le drapeau les ferait TOUTES
 *   disparaitre des listes d echange — un vide total serait bien pire que le defaut corrige. Seul
 *   ce qui est explicitement marque non lance est retire.
 */
export function proposableEnEchange(p) {
  return !(p && p.lancePubliquement === false);
}

/** ⛔ RECOPIE de STOCKS_BASE_REGISTRY (index.html). Un test compare les deux listes, adresse par adresse. */
export const ACTIONS_COINBASE = [
  /* ⛔⛔ COINc, CRCLc ET INTCc ONT ETE RETIRES LE 2026-09-27, ET UNE MESURE L A DECIDE. Les treize
   *     adresses ont ete interrogees sur la chaine : les treize EXISTENT, les treize sont des B20
   *     natifs (`0xef` EXACTEMENT) et les treize symboles concordent avec ce qu on annonce — ma
   *     suspicion de depart (« le prefixe `0xb2…` est imitable, ce sont peut-etre des homonymes »)
   *     etait INFONDEE. Mais CES TROIS-LA ONT UNE SUPPLY EXACTEMENT NULLE. Les dix autres
   *     circulent : NVDAc 19 486 · SPCXc 11 359 · MSTRc 8 632 · GOOGLc 8 005 · AMZNc 7 667 ·
   *     AAPLc 6 966 · TSLAc 4 115 · METAc 4 106 · MSFTc 2 452 · SNDKc 616.
   *   ⇒ Pairer un block neuf a un jeton sans une seule unite en circulation ouvre une pool contre
   *     du VIDE : elle ne pourra JAMAIS s echanger. Ce n est pas un mauvais choix, c est un choix
   *     impossible. Decision de Phil : « retire COINc CRCLc INTCc de la liste ».
   *
   * ⛔ CE N EST PAS LA MEME RAISON QUE LA POLITIQUE DES PUCES, et la confusion serait facile a
   *   faire. Les puces ecartent CINQ actions (ces trois + MSTRc + SNDKc) parce qu elles n ont AUCUN
   *   PRIX LISIBLE — mesure du 2026-09-25 — et la regle y est « on ne retire pas un choix, on
   *   arrete seulement de pousser vers un cul-de-sac ». Ici la raison est autre : un jeton sans
   *   supply n est pas un choix difficile, c est un choix VIDE. MSTRc et SNDKc RESTENT donc dans la
   *   liste — ils existent et circulent, ils n ont simplement pas de prix cote.
   *
   * ⛔ ET LA GARDE ON-CHAIN RESTE LA VRAIE PROTECTION. Cette liste est une PHOTO : une supply peut
   *   tomber a zero demain sur n importe laquelle des dix restantes, et la liste ne le saurait pas.
   *   `majPaire` lit donc la supply a chaque choix. Retirer ces trois entrees evite de PROPOSER une
   *   impasse ; c est la garde qui empeche d y ENTRER. */
  { symbole: 'AAPLc', nom: 'Apple', adr: '0xb200000000000000000000c2e324d24d7eecd1fb' },
  { symbole: 'AMZNc', nom: 'Amazon', adr: '0xb200000000000000000000d9192b6b456483c2e8' },
  { symbole: 'GOOGLc', nom: 'Alphabet', adr: '0xb2000000000000000000002d0ba3164cc74f58b7' },
  { symbole: 'METAc', nom: 'Meta Platforms', adr: '0xb2000000000000000000008bc8786b856e61707c' },
  { symbole: 'MSFTc', nom: 'Microsoft', adr: '0xb200000000000000000000ab99cfa739e253872b' },
  { symbole: 'MSTRc', nom: 'Strategy', adr: '0xb2000000000000000000004884b426556b92883d' },
  { symbole: 'NVDAc', nom: 'NVIDIA', adr: '0xb20000000000000000000078ee7ce2fe4908108c' },
  { symbole: 'SNDKc', nom: 'Sandisk', adr: '0xb200000000000000000000397293cb8cda9a10c5' },
  { symbole: 'SPCXc', nom: 'SpaceX', adr: '0xb2000000000000000000007b9fcbd005511acbd5' },
  { symbole: 'TSLAc', nom: 'Tesla', adr: '0xb2000000000000000000001e800a7f5189430cd0' },
];

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Ce qu on peut proposer comme paire sur une chaine.
 * ⛔ LES ACTIONS COINBASE N EXISTENT QUE SUR BASE MAINNET : les proposer sur Sepolia enverrait vers
 *    des adresses qui n y sont pas des actions.
 */
export function pairesProposees(chaine) {
  const c = Number(chaine);
  /* ⛔⛔ « PROPOSEES » N EST PAS « CONNUES », ET CETTE FONCTION CONFONDAIT LES DEUX.
   *     TBLOCK porte `lancePubliquement: false` depuis le 2026-09-24 — decision de Phil, appuyee
   *     par une mesure : aucun des 7 jetons detenus par le wallet de frais n a de marche vivant.
   *     Le drapeau etait pose, et PERSONNE NE LE LISAIT ICI : TBLOCK restait propose a la creation.
   *     Re-mesure du 2026-09-27 : `/tokens/v1/base/0xb20000…272e` rend AUCUNE PAIRE. Proposer de
   *     coter un block en TBLOCK, c est promettre un marche qui n existe pas — et l acheteur ne
   *     l apprend qu apres avoir paye la naissance.
   *   ⛔ LE JETON RESTE DANS `DEVISES_BASE` : d autres ecrans s en servent legitimement, et les
   *     blocks deja cotes en TBLOCK ne doivent pas perdre leur libelle. On filtre ce qu on
   *     PROPOSE, on ne supprime pas ce qu on CONNAIT. */
  const base = DEVISES_BASE.filter((d) => d.chaines.includes(c) && d.lancePubliquement !== false);
  const actions = c === 8453 ? ACTIONS_COINBASE.map((s) => ({ ...s, type: 'ACTION' })) : [];
  return [...base, ...actions];
}

/**
 * Qualifie une paire choisie.
 * @returns {{etat:'OK'|'REFUSE', paire?:object, pourquoi?:string}}
 * ⛔ L ORDRE COMPTE : registre d abord. Une adresse du registre tapee a la main reste une ACTION
 *    verifiee ; une adresse inconnue reste « tapee par vous », jamais promue.
 */
export function qualifierPaire(adresse, chaine) {
  const a = String(adresse || '').trim();
  if (!ADRESSE.test(a)) return { etat: 'REFUSE', pourquoi: 'not an address — paste it whole, nothing is completed' };
  const bas = a.toLowerCase();
  const connue = pairesProposees(chaine).find((p) => p.adr.toLowerCase() === bas);
  if (connue) return { etat: 'OK', paire: { ...connue, verifiee: true } };
  if (Number(chaine) !== 8453 && ACTIONS_COINBASE.some((s) => s.adr.toLowerCase() === bas)) {
    return { etat: 'REFUSE', pourquoi: 'that is a Coinbase stock on Base mainnet — it does not exist as a stock on this network' };
  }
  /* ⛔ RAKSHA 2026-09-15: custom pair must prove native B20 (code 0xef) in Create majPaire — no ERC-20 sprawl. */
  return { etat: 'OK', paire: { adr: a, symbole: null, nom: null, type: 'SAISIE', verifiee: false, besoinB20: true,
    avertissement: 'Typed address — must be a native B20 (code 0xef) to pair here. Not a random ERC-20. '
      + 'This app gives it no name until the chain proves B20.' } };
}

/** L etiquette a afficher. ⛔ Une paire non verifiee n emprunte jamais un nom. */
export function etiquettePaire(p) {
  if (!p) return '—';
  if (p.type === 'SAISIE') return 'B20 pair ' + p.adr.slice(0, 6) + '…' + p.adr.slice(-4) + (p.estB20 ? ' (native B20)' : ' (B20 check…)');
  if (p.type === 'TBLOCK') return p.symbole + ' — ' + p.nom;
  if (p.type === 'ACTION') return p.symbole + ' — ' + p.nom + ' (Coinbase tokenized stock)';
  return p.symbole + ' — ' + p.nom;
}
