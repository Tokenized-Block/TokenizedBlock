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
  /* ⛔⛔ OUSD, AJOUTE LE 2026-09-30 (Phil : « on ajoute au marche si c est le B20 qui est
   *     autorise »), ET IL EST LE SEUL STABLECOIN INSTITUTIONNEL QUI PASSE NOTRE PROPRE REGLE.
   *   ⛔ ADRESSE COPIEE de l annonce de l emetteur, jamais rappelee de memoire.
   *   ✅ CE QU IL EST, MESURE LE JOUR MEME, avec temoin :
   *        OUSD  `eth_getCode` = 0xef  ← le marqueur B20, EXACTEMENT
   *        USDC  `eth_getCode` = 1852 octets de bytecode ordinaire — PAS un B20
   *      symbol() « OUSD » · name() « OpenUSD » · decimals() 6 · supply 15 000 528,32
   *      Emis par Bridge (Stripe). C est ce qui le rend appairable SANS exception : la regle de
   *      Raksha du 2026-09-15 (« custom pair must prove native B20, no ERC-20 sprawl ») l admet
   *      de plein droit, la ou USDC n est present que par cette liste blanche.
   *   ✅ ET IL A UN MARCHE REEL — la seule chose qui compte pour une devise de paire, comme
   *      ecrit pour TOSHI juste au-dessus. Mesure DexScreener du 2026-09-30 :
   *        OUSD/USDC  Uniswap  liquidite 9 999 561 $   volume 24 h 5 234 $
   *        OUSD/ETH   Uniswap  liquidite       289 $   volume 24 h     0 $
   *      Huit fois la liquidite qui avait justifie TOSHI (1 230 755 $).
   *   ⚠️⚠️ DEUX RESERVES QUI VOYAGENT AVEC LUI, et qui ne sont pas des details :
   *      1. ⛔⛔ CE CHIFFRE ETAIT PERIME D UN FACTEUR 35, ET IL DECOURAGEAIT D UN MARCHE QUI EXISTE.
   *         J avais ecrit « LE VOLUME EST MINUSCULE (5 234 $) » le matin du 2026-09-30. Re-mesure
   *         le soir, sur notre propre `/api/trending` : OUSD fait 181 424 $ de volume 24 h et
   *         1 476 trades. Les chiffres pourrissent, et une reserve perimee ne devient pas
   *         inoffensive en vieillissant : elle continue de dire « n y va pas ».
   *         ⭐ ET CINQ BLOCKS SONT DEJA COTES EN OUSD, mesure le meme soir :
   *              OHUSD      169 381 $ / 24 h · 1 371 trades
   *              OUCAT        3 613 $ ·  30 trades
   *              FIRSTOUSD    2 238 $ ·  31 trades
   *              DANGEROUSD     105 $ ·   2 trades
   *              OBC             26 $ ·   2 trades
   *            Des gens lancent DEJA chez nous contre OUSD. La reserve qui reste vraie n est donc
   *            pas « il n y a pas de marche » mais celle du point 2 : notre routage ne l atteint pas.
   *         ⚠️ CE QUI RESTE VRAI DU DOUTE D ORIGINE : OUSD est ne le 2026-09-30. Cinq jours
   *            d activite ne font pas une tendance, et les cinq lignes ci-dessus sont dominees par
   *            UNE SEULE (OHUSD porte 93,4 % du volume des blocks cotes en OUSD). Un marche
   *            concentre sur un block peut disparaitre avec lui.
   *      2. LA POOL OUSD/ETH EST VIDE (289 $). Toute route qui passerait par ETH -> OUSD taperait
   *         dans le vide ; la profondeur est du cote USDC. Un routeur qui l ignore rendrait un
   *         devis catastrophique — a traiter quand le multi-saut le prendra en compte.
   *
   *   ⭐⭐ OU EST CETTE POOL, EXACTEMENT — LU SUR LA CHAINE LE 2026-09-30 AU SOIR.
   *      Les chiffres ci-dessus venaient de DexScreener, qui dit « Uniswap » sans dire LEQUEL.
   *      La chaine dit lequel, et avec quelle cle :
   *        Uniswap V4  poolId 0xdf5bde0fc414fcd1f803c9d1b52ebbb4db5982d8dca5316ae06b467e06fc429a
   *                    currency0 USDC · currency1 OUSD · fee 100 · tickSpacing 1 · hooks 0x0
   *                    tick -1  =>  1 USDC = 0,999999 OUSD — AU PAIR
   *        decimales LUES, jamais supposees : OUSD 6, USDC 6 (un decalage aurait inverse le prix)
   *      Temoin positif du lecteur : ETH/USDC rend 4 pools sur les memes cles. Il discrimine.
   *
   *   ⛔⛔ CE QUI DECIDE SI ON PEUT L ATTEINDRE, C EST LA FACTORY, PAS LA PROFONDEUR.
   *      `planEthVersAction` fait WETH -> USDC -> action -> block en UN SEUL `exactInput`, et un
   *      `exactInput` ne traverse que les pools de SA factory — c est la frontiere qui ne laisse
   *      passer que 13 blocks sur 123. Mesure sur les NEUF espacements que la factory Aerodrome
   *      DECLARE (`espacements-cl.js`), 0 non mesure :
   *        USDC/WETH   3 pools Aerodrome CL   <- temoin positif
   *        AAPLc/USDC  2 pools Aerodrome CL   <- temoin : une action tokenisee EN A
   *        OUSD/USDC   0 pool Aerodrome CL
   *        OUSD/ETH    0 pool Aerodrome CL
   *      ⇒ OUSD n est PAS dans la situation des actions tokenisees : il est dans celle des 110
   *        blocks refuses par ce chemin. Sa profondeur est reelle, mais sur une AUTRE factory.
   *      ✅ ET LA ROUTE EXISTE SUR L AUTRE JAMBE : ETH -> USDC -> OUSD tient ENTIEREMENT dans
   *        Uniswap V4 — une seule factory, donc franchissable en un seul `exactInput`. C est
   *        `calldata-v3.js` / `echange-v3.js` (Universal Router) qui la portent.
   *
   *   ⇒ DECISION DE PHIL (2026-09-30) : « garde pool uniswap aussi », « multi pool ». Donc OUSD
   *     RESTE propose, et c est la jambe Uniswap qu on cable — pas OUSD qu on retire. Le choix est
   *     coherent avec la mesure : la profondeur est reelle et au pair, c est notre routage qui
   *     etait borne a une seule factory.
   *     ⛔ ET TANT QUE CETTE JAMBE N EST PAS CABLEE POUR OUSD, un visiteur qui tient de l ETH ne
   *       peut pas acheter un block cote en OUSD par notre interface. Ce n est pas une opinion,
   *       c est la consequence directe des quatre lignes de mesure ci-dessus, et ca doit rester
   *       ecrit ici jusqu a ce que ce soit faux.
   *     ⚠️ POURQUOI OUSD NE PREND PAS LE DRAPEAU DE TBLOCK, dans les deux sens : TBLOCK porte
   *       `lancePubliquement: false` parce qu il n a de marche NULLE PART. OUSD en a un vrai, au
   *       pair, 10 M$ — mais sur la factory que notre chemin d achat ne traversait pas. Les deux
   *       cas se ressemblent a l ecran et ne se ressemblent pas sur la chaine.
   *
   *   ⛔ DEUX FAUTES A MOI DANS CETTE MESURE MEME, parce que la methode compte autant que le
   *     resultat :
   *      · ma premiere sonde ne testait que CINQ espacements (1, 50, 100, 200, 2000) et imprimait
   *        « 0 pool » — ce qui se lit « aucune pool n existe ». Il en manquait QUATRE des neuf
   *        declares (10, 80, 150, 500), et mon temoin positif lui-meme etait sous-compte (2 au lieu
   *        de 3). C est la faute qui avait deja rendu 49,8 % du volume invisible. Les espacements
   *        se LISENT dans `espacements-cl.js`, jamais a la main.
   *      · avant ca, un appel POSITIONNEL a `calldataGetPool` (qui prend un OBJET) rendait
   *        `tokenA: undefined` : cinq refus, pas un seul appel envoye, et mon compteur affichait
   *        encore « 0 pool ». Ce qui m a sauve, c est que `calldataGetPool` rend un REFUS NOMME au
   *        lieu d une valeur neutre. Un `null` m aurait fait publier « OUSD inatteignable ».
   *
   *   ⛔ CE QUE JE N AI PAS VERIFIE, ET QUI N EST DONC PAS UN ARGUMENT :
   *      · que le prefixe `0xB2` et le marqueur `0xef` signifient la MEME fabrique que nos blocks.
   *        Meme format ne veut pas dire meme emetteur ni meme semantique — c est exactement
   *        `b20-prefix-impersonation` : le code prouve le FORMAT, pas la parente ;
   *      · les reserves BlackRock/BNY/Lead Bank viennent de la page de l emetteur, pas d une
   *        mesure. Les attestations mensuelles sont a reserves.bridge.xyz/ousd ;
   *      · le programme de « rewards proportional to the supply and activity » d Open Standard
   *        vient de leur page aussi. C est une PISTE de revenu, pas un revenu : aucun montant,
   *        aucun bareme, aucune inscription faite. Ne pas l ecrire comme acquis. */
  { adr: '0xB2000000000000000000002fEb517dFeC7415344', symbole: 'OUSD', nom: 'Open USD — quote your block in OUSD', type: 'STABLE', chaines: [8453] },
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
  /* ── QUATRE AJOUTS DU 2026-09-28, ET LE COMPTE FERME ─────────────────────────────────────────
   * ⛔⛔ CINQ ETAIENT ANNONCEES (MUc, MRVLc, BEc, HIMSc, AVGOc) ; QUATRE PASSENT. MRVLc n a pas de
   *     pool v3/CL a prouver — elle est parmi les 82 candidates qui n existent qu en pool v4, donc
   *     ni son prix ni sa provenance ne se lisent par notre chemin. L annoncer serait proposer un
   *     choix qu on ne sait pas servir.
   * ⛔⛔ ET LA DECOUVERTE MENTAIT AVANT D ETRE CORRIGEE : le script portait un `.slice(0, 40)` sur
   *     86 candidats tout en imprimant « aucun silence ». 46 n etaient jamais regardes, et leur
   *     absence du tableau se lisait comme « elles ne qualifient pas ». HIMSc et BEc etaient
   *     precisement la. Le compte ferme maintenant : 86 examinees = 4 retenues + 82 en v4 seule.
   * ⛔ CHAQUE ADRESSE MESUREE, PAS RECITEE : `eth_getCode` == `0xef` EXACTEMENT, `symbol()` relu
   *   sur la chaine et concordant, `totalSupply()` > 0, `decimals()` == 8, et la pool prouvee par
   *   aller-retour sur sa factory.
   * ⚠️ LES FLOTTANTS SONT MINCES, et « admise » ne veut pas dire « profonde » — supply lue le
   *   2026-09-28 : BEc 62 · AVGOc 85 · MUc 433,44 · HIMSc 581, contre NVDAc 19 486. Liquidite
   *   ~9 000 a 10 000 $ chacune ; volume 24 h : MUc 27 125 $, HIMSc 916 $, AVGOc 948 $, BEc 50 $.
   * ⛔ MUc EST SUR UNISWAP, PAS AERODROME : elle est achetable, mais elle NE PEUT PAS porter notre
   *   frais de 0,1 % — `sweepTokenWithFee` n existe que sur le routeur Aerodrome. C est dit ici
   *   parce qu une ligne de liste ne dit rien de l argent qu elle rapporte. */
  { symbole: 'AAPLc', nom: 'Apple', adr: '0xb200000000000000000000c2e324d24d7eecd1fb' },
  { symbole: 'AMZNc', nom: 'Amazon', adr: '0xb200000000000000000000d9192b6b456483c2e8' },
  { symbole: 'AVGOc', nom: 'Broadcom', adr: '0xb200000000000000000000fc737aea6196ab5a4c' },
  { symbole: 'BEc', nom: 'Bloom Energy', adr: '0xb20000000000000000000016f9dfe862feba122b' },
  { symbole: 'GOOGLc', nom: 'Alphabet', adr: '0xb2000000000000000000002d0ba3164cc74f58b7' },
  { symbole: 'HIMSc', nom: 'Hims & Hers Health', adr: '0xb20000000000000000000043a599976181bcf336' },
  { symbole: 'METAc', nom: 'Meta Platforms', adr: '0xb2000000000000000000008bc8786b856e61707c' },
  { symbole: 'MSFTc', nom: 'Microsoft', adr: '0xb200000000000000000000ab99cfa739e253872b' },
  { symbole: 'MSTRc', nom: 'Strategy', adr: '0xb2000000000000000000004884b426556b92883d' },
  { symbole: 'MUc', nom: 'Micron Technology', adr: '0xb200000000000000000000fd2f87532b90095211' },
  { symbole: 'NVDAc', nom: 'NVIDIA', adr: '0xb20000000000000000000078ee7ce2fe4908108c' },
  /* ── PLTRc, AJOUTEE LE 2026-09-30, ET UNE MESURE SUR LES 40 L A ISOLEE ────────────────────────
   * ⛔⛔ D OU VIENT LE CANDIDAT : la liste de l EMETTEUR lui-meme,
   *     `https://api.coinbase.com/v1/tokenized-stocks` (HTTP 200, sondee avant d etre codee
   *     contre). Elle porte 40 entrees ; nous en servions 14. `mesure-registre-emetteur.mjs` a
   *     verifie les 40 SUR LA CHAINE : 39 passent les quatre preuves, BIRDc tombe (supply 0).
   * ⛔⛔ ET LE CHIFFRE QUI A TRANCHE, PARCE QU IL DIT L INVERSE DE L INTUITION : nos 14 portent
   *     deja 98,6 % du volume 24 h de la classe d actifs (79 897 835 $ sur 81 012 041 $) et 94,8 %
   *     de la liquidite. Ajouter les 26 autres n ajouterait pas 65 % de surface — il ajouterait
   *     1,4 % de volume. « 14 sur 40 » se lisait comme un trou de 65 % ; c est un trou de 1,4 %.
   *   ⇒ UNE SEULE SORT DU LOT : PLTRc, 984 171 $ de volume 24 h et 562 201 $ de liquidite —
   *     a elle seule PLUS que les 25 autres reunies. Les autres vont de 1 074 $ a 99 299 $.
   * ⛔ ET LE VOISIN QUI RESSEMBLE MAIS N EN EST PAS UN : NFLXc affiche 99 299 $ de liquidite, ce
   *   qui la place juste sous PLTRc dans un classement — mais c est 14 pools dont la plus grosse
   *   fait 12 154 $, toutes en v4. Un total n est pas une profondeur. Elle n entre PAS.
   * ⛔ LA POOL EST PROUVEE PAR TEMOIN DISCRIMINANT, pas par l etiquette de DexScreener :
   *   sur `0x650cc267AA248191978013d5Ae421e5Dc2A6e242`, `slot0()` REPOND et `getReserves()`
   *   REVERTE ⇒ Slipstream CL, pas v2. `tickSpacing()` == 10 (present dans
   *   `ESPACEMENTS_ALTERNATIVE`, donc notre lecteur la trouve), `fee()` == 500, `token0` == USDC.
   *   ⛔ Et `fee` n est PAS `tickSpacing` : 500 et 10 ici, la lecon est deja ecrite ailleurs.
   * ✅ CE QUE CA VAUT POUR NOUS, ET C EST LE POINT : la pool est sur AERODROME. C est le seul
   *   routeur qui porte `sweepTokenWithFee` — donc la seule famille ou notre 0,1 % peut tomber.
   *   MUc, elle, est sur Uniswap : achetable, mais aveugle a notre frais.
   * ⚠️ L adresse est EXTRAITE de la reponse JSON de l emetteur, jamais transcrite de tete.
   * ⚠️ Supply lue le 2026-09-30 : 2 068,33 — mince, et « admise » ne veut pas dire « profonde ». */
  { symbole: 'PLTRc', nom: 'Palantir Technologies', adr: '0xb2000000000000000000007d16372840df4dabbe' },
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
