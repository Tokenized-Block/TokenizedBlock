// tokenomics.js — la tokenomics v2 de TokenizedBlock (DECISIONS-regles-du-jeu-2026-09-13, section 1bis).
// ================================================================================================
// ⛔ RAKSHA 2026-09-14 : Create MAIN fee = ETH ≈ $1 → FEE_WALLET. No 5% / 50M token mint to fee.
//    Sealed 1B supply mints 100% to the creator (CreateRouter + Practice factory path).
// ⛔ TBLOCK EXISTE (cree par Phil le 2026-09-13, adresse LUE dans le log B20Created de sa transaction).
// ✅ TbFeeHook LIVE Base CREATE2 HOOK_PREVU 0xaa6D…2044 — FEE_WALLET() = a6cf (tip 2356). Legacy 0x34E3…6044 still 37eb — unused by new Launch.
/** @deprecated Was 5n (50M of 1B). Create fee is ETH only — keep 0 so Social never keys on a fee mint. */
export const PART_FRAIS_POUR_CENT = 0n;
/** Fixed sealed supply for every TB Create: 1 billion units × 18 decimals. Indestructible = cap == mint, nobody can mint more. */
export const DECIMALES_FIXES = 18;
export const SUPPLY_FIXE = 1_000_000_000n * 10n ** BigInt(DECIMALES_FIXES);
/** TBLOCK, lu dans le log B20Created de la tx 0xda396460…4cf3 (bloc 51 260 745). */
export const TBLOCK = '0xb20000000000000000000024c30d3fcb7931272e';
/** TBGAS — Tokenized Gas · MAIN Launch 2026-09-15 hooked HOOK_PREVU → a6cf (tip 2357). */
export const TBGAS = '0xb200000000000000000000df3ffcd9be89b3843c';
/** tip 0016: Uniswap v4 PoolId = Initialize topic1 · Launch 0x17d20e41…dcc5 · Dex/Gecko pairAddress. */
export const TBGAS_POOL_ID = '0x085294111dc0da95e5496d5c81deaa094fdf73bd5a1e08163679e5ea3b062a46';
/** tip 0019: keep HOOK_PREVU aa6D (proven TBGAS) — do NOT redeploy same bytecode. FEE_WALLET=a6cf. Dollar visibility = ETH→USDC / USDC-side volume (Launch refuses USDC pair: 6 vs 18 decimals). */
/** TbFeeHook LIVE on Base — CREATE2 a6cf (salt 56999). FEE_WALLET() = a6cf. */
export const HOOK_PREVU = '0xaa6D7bD9FC7D394bc717137936f2939834382044';
/* ⛔⛔ HOOK V2 (2026-09-19) : la mise en vie est PAYEE ON-CHAIN (inscrire payable, beforeInitialize refuse sans paiement).
 *    Mesure qui l a motivee : 2 marches sur 4 ouverts avec HOOK_PREVU en 72 h, sans les frais de vie (appel direct au
 *    PositionManager). Adresse = celle MINEE par script/DeployTBlockFeeHookV2.s.sol (simulation du 2026-09-19), deployee
 *    par Phil. Tant qu elle n a pas de code, l app garde HOOK_PREVU : la bascule est lue sur la chaine, jamais supposee. */
export const HOOK_V2 = '0x8E1Eb57AD2A87a4f7bc89ce94eFD5cd77aEc2044';
/* ⛔ HOOK V3 (2026-09-19) : le V2 + les ACTIONS TOKENISEES et gros jetons (USDC, cbBTC, 13 actions Coinbase), liste FIXEE au
 *    deploiement. Adresse = celle minee par script/DeployTBlockFeeHookV3.s.sol (simulation du 2026-09-19). Tant qu elle n a
 *    pas de code, ces paires restent « soon » dans Create : la bascule est lue sur la chaine. */
export const HOOK_V3 = '0x7a7cEBB2Ccb84C9fBfa2730e6cB23Bb192166044';
/* ⛔⛔ HOOK V4 (deploye le 2026-09-20, tx 0x3fcf05cd10ac0cef1bde29e9c877cd32b37d52bf6b5187c63283b50677786484,
 *    bloc 51555444). Le V3 + DEUX verrous, chacun prouve ROUGE avant d etre vert dans tblock-hook :
 *    1. AUCUN ECHANGE TANT QUE LA POOL EST VIDE. Sur le V2/V3, entre le paiement de la mise en vie et le
 *       mint du createur, n importe qui pouvait ouvrir la pool et pousser son prix au tick plancher avec
 *       un swap de 1 wei : le lancement revertait ensuite et les ~1 $ etaient perdus, pour le prix du gas.
 *    2. SANS LE LABEL, PAS DE MARCHE. « inscrire » relit « contractURI() » du block et exige le marqueur grave
 *       par notre Create. La factory B20 etant publique, la naissance ailleurs ne se bloque pas ; le
 *       MARCHE, si. ⚠️ C est une STRUCTURE, pas une identite : quelqu un peut graver les memes octets.
 *    Relu sur la chaine apres deploiement : feeWallet a6cf, fraisVie 3e14, marqueur 16 octets, 15 devises,
 *    exigerB20 true, porteLeLabel(BASED)=true et porteLeLabel(un block ne ailleurs)=false.
 *    ⛔ IL REMPLACE V2 ET V3 POUR LES NOUVEAUX LANCEMENTS (il porte la meme liste de devises). Les pools
 *       deja ouvertes sur V1/V2/V3 continuent de tourner et de payer a6cf — rien n est casse. */
export const HOOK_V4 = '0x11FCd588c96b1781cc88B8B9F349B6067D9BE4c4';
/* ⛔ HOOK V5 — DEPLOYE ET RELU SUR LA CHAINE LE 2026-09-20.
 *    tx 0x7fb52a1f449546e8babe55f7c9351c477735374694658b4c63a867b2859fed47, recu status 0x1,
 *    bloc 51567449, 12 463 octets de code a l adresse.
 *    Relectures faites une par une, pas prises sur un ecran : feeWallet a6cf · tailleMarqueur 16 ·
 *    DIME_CREATEUR_POUR_CENT 20 · DIVISEUR_PART_CREATEUR 3 · HOOK_FEE 30 000 (3 %) ·
 *    GAS_POUSSEE 150 000 · porteLeLabel(BASED)=true ET porteLeLabel(un block ne ailleurs)=FALSE.
 *    ⛔ Ce dernier temoin est le seul qui donne sa valeur au precedent.
 *    CE QUE LE V5 CHANGE : les frais sont VERSES pendant le swap (repli sur les claims si la devise
 *    refuse, pour qu un jeton casse ne puisse pas tuer sa pool), et le wallet prend 20 % du tiers du
 *    createur (33,33 % -> 26,67 % du frais).
 *    ⚠️ IL NE REPARE RIEN DU PASSE : le hook est dans la PoolKey, donc chaque pool garde le sien. */
export const HOOK_V5 = '0x799136c3F5f572f1597b5B7E067D3eE45Fe4A4C4';
/* ⛔ HOOK V6 — DEPLOYE (code LU sur la chaine le 2026-09-21 ; le commentaire disait encore
 *    « pas encore deploye » un jour apres la transaction — un commentaire perime ment aussi longtemps
 *    qu on le lit).
 *    Adresse obtenue par CREATE2 et verifiee par DEUX chemins independants : HookMiner dans forge, et
 *    un recalcul keccak en JavaScript a partir du meme sel et du meme initcode. Bits de permission
 *    0x24cc = beforeInitialize, afterAddLiquidity, beforeSwap, afterSwap, afterSwapReturnsDelta et
 *    beforeSwapReturnsDelta — le bit de plus que le V5, celui qui autorise un delta avant le swap.
 *    CE QUE LE V6 CHANGE : un ACHAT « entree exacte en ETH » paie son frais EN ETH, pris avant le
 *    swap, au lieu d etre pris apres coup sur le jeton de block.
 *    MESURE QUI L A DICTE : 14 jours du V1 deploye, 303/303 fenetres lues, 39 encaissements — 19 en
 *    ETH (0,001019868 ETH au wallet) et 20 en jetons (0,002000588 ETH d equivalent qui dort).
 *    ⛔ BORNE : un swap a SORTIE EXACTE en ETH paie toujours en jeton, et ce frais part en claims.
 *    ⚠️ SON ETAT EST TOUJOURS LU SUR LA CHAINE, jamais ecrit en dur : tant que la transaction n est
 *       pas signee, l app doit continuer de lancer sur le V5. */
export const HOOK_V6 = '0xD71af554b5b3dCb6bb17946cfA3C41860A50a4cC';
/* ⛔ HOOK V7 — DEPLOYE (code LU sur la chaine le 2026-09-21).
 *    Adresse verifiee par DEUX chemins independants (HookMiner dans forge + recalcul keccak en JS),
 *    et un eth_call de la transaction rend exactement cette adresse.
 *    CE QUE LE V7 CHANGE : 100 % du frais va au wallet. La part du createur est SUPPRIMEE.
 *    ⚠️ CE QUE CA COUTE : c etait le seul argument d un createur exterieur pour lancer ici.
 *       Mesure du 2026-09-21 (14 j, 303/303 fenetres) : 2 lancements, tous deux par nos wallets —
 *       aucun createur exterieur sur la fenetre. Gain mesure : +0,001019868 ETH sur 14 j, soit +50 %.
 *    ⛔ Bits 0x24cc, IDENTIQUES au V6 : le V7 n ajoute aucune capacite, il ne touche aucun verrou. */
export const HOOK_V7 = '0xb5680Fc44ea440fC223D1ca62F2b4F261fdA24Cc';
/* ⛔ HOOK V8 — DEPLOYE (code LU sur la chaine le 2026-09-21) et HOOK_FEE() lu a 5000 / 1e6 = 0,5 %.
 *    CE QU IL CHANGE, ET RIEN D AUTRE : le taux passe de 3 % a 0,5 % (HOOK_FEE 30000 -> 5000).
 *    ⛔⛔ POURQUOI IL DOIT EXISTER AVANT LE PREMIER MARCHE : le taux est une CONSTANTE et le hook
 *       est dans la PoolKey. Un marche ouvert sur le V7 paierait 3 % POUR TOUJOURS — aucune
 *       migration n existe, c est le piege ou sont enfermees les 5 pools du V1.
 *    ⚠️ MESURE : a 3 %, 14 jours ont rendu 0,003059603 ETH de frais ; les memes volumes a 0,5 %
 *       rendraient 0,000509934 ETH. Il faut SIX FOIS plus de volume pour egaler. C est un PARI.
 *    ⛔ Memes bits 0x24cc que le V7 : aucune capacite ajoutee. */
export const HOOK_V8 = '0x5926abdAbf5D0006Ee960A8270f3e124e5a764cc';
/** Un marche est-il sur NOTRE hook (V1, V2, V3, V4 ou V5) ? La seule fonction qui en decide.
 *  ⛔ LES ANCIENS RESTENT : une pool ouverte sur le V1 est toujours la notre et paie toujours a6cf.
 *     Les retirer d ici ferait disparaitre nos propres marches du fil Live et des frais affiches. */
export function estNotreHook(h) {
  const x = String(h || '').toLowerCase();
  return x === HOOK_PREVU.toLowerCase() || x === HOOK_V2.toLowerCase()
    || x === HOOK_V3.toLowerCase() || x === HOOK_V4.toLowerCase() || x === HOOK_V5.toLowerCase()
    || x === HOOK_V6.toLowerCase() || x === HOOK_V7.toLowerCase() || x === HOOK_V8.toLowerCase();
}
/** ⛔ Selecteur de « porteLeLabel(address) » — MESURE avec « cast sig », jamais ecrit de memoire. */
export const SEL_PORTE_LABEL = '0x330676aa';
export const ETATS_LABEL = ['OUI', 'NON', 'NON_LU'];
/**
 * Le block porte-t-il le label que le V4 exige ? Lecture seule, AVANT de demander une signature.
 * ⛔ TROIS ETATS, JAMAIS UN BOOLEEN. « pas lu » n est ni « oui » ni « non » : le confondre avec l un
 *    des deux ferait soit payer pour rien, soit refuser un createur legitime sur un RPC qui tousse.
 */
export async function blockPorteLeLabel({ rpc, jeton }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jeton || ''))) return 'NON_LU';
  try {
    const data = SEL_PORTE_LABEL + String(jeton).replace(/^0x/, '').toLowerCase().padStart(64, '0');
    /* ⛔ ON LIT LE VERROU DU HOOK QUI REFUSE. C est le V5 qui gate desormais les inscriptions ;
     *    interroger le V4 repondrait pour un contrat qui ne decide plus rien. Les deux portent le
     *    meme marqueur aujourd hui — ce sera faux le jour ou l un des deux changera. */
    const x = await rpc('eth_call', [{ to: HOOK_V5, data }, 'latest']);
    if (typeof x !== 'string' || !/^0x[0-9a-f]*$/i.test(x) || x.length < 4) return 'NON_LU';
    return BigInt(x) === 1n ? 'OUI' : 'NON';
  } catch { return 'NON_LU'; }
}
/** Le V4 est-il deploye ? Lu sur son code. */
export async function hookV4Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V4, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** Le V5 est-il deploye ? Lu sur son code, jamais suppose. */
export async function hookV8Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V8, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** Le V7 est-il deploye ? Lu sur son code. */
export async function hookV7Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V7, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** Le V6 est-il deploye ? Lu sur son code. */
export async function hookV6Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V6, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** Le V5 est-il deploye ? Lu sur son code. */
export async function hookV5Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V5, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** Le V3 est-il deploye ? Lu sur son code. */
export async function hookV3Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V3, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** La V2 est-elle deployee ? Lu sur son code. */
export async function hookV2Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V2, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/* tip 2300/2356: HOOK_PREVU = 0xaa6D…2044 a6cf. Legacy 0x34E3…6044 still 37eb — unused by new Launch. */
export const ETATS_HOOK = ['DEPLOYE', 'ABSENT', 'NON_LU'];

/** Destinataires et montants de la frappe initiale d un nouveau block — 100% creator. */
export function repartitionFrappe(supply, compte) {
  if (typeof supply !== 'bigint' || supply <= 0n) throw new Error('supply must be a positive bigint');
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(compte || ''))) throw new Error('creator account required');
  return { destinataires: [compte], montants: [supply], frais: 0n, createur: supply };
}

/** Le hook existe-t-il sur la chaine ? Lu sur son code, jamais suppose. */
export async function hookDeploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_PREVU, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * LE CHOIX DU HOOK D UN NOUVEAU MARCHE — UNE SEULE FONCTION, POUR LES DEUX CHEMINS.
 *
 * ⛔⛔ LE DEFAUT QUE CETTE FONCTION EXISTE POUR TUER (mesure du 2026-09-21). L app avait DEUX
 *     chemins d ouverture de marche, et ils ne choisissaient pas le meme hook :
 *       · Launch pas a pas (app.html:7089) lisait la chaine et prenait le plus recent deploye ;
 *       · Create « une seule signature » (app.html:8999) ecrivait `const hook = HOOK_V5;` EN DUR.
 *     Or la garde censee desactiver ce second chemin, `$('#cVieDirecte')`, interroge un element qui
 *     N EXISTE PAS dans la page : elle est donc toujours fausse, et ce chemin tourne TOUJOURS.
 *     Consequence mesuree : 0 marche sur les V6, V7 et V8 apres leur deploiement. On cherchait une
 *     explication du cote de la demande ; elle etait dans une constante.
 *
 * ⛔ LA LECON, ECRITE ICI PARCE QU ELLE S EST DEJA PRODUITE AILLEURS : quand un choix existe en deux
 *    exemplaires, le correctif applique a l un ne suit pas l autre. Le choix n a donc plus qu un
 *    seul exemplaire, et un test refuse qu un second reapparaisse.
 *
 * ⛔ « NON_LU » N EST PAS « DEPLOYE » : un noeud qui tousse fait retomber sur le hook precedent,
 *    jamais l inverse. Un hook absent ne doit jamais etre choisi par accident.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le hook sur lequel un NOUVEAU marche doit s ouvrir. Rend `undefined` si aucun ne convient.
 * @param {object} o
 * @param {Function} o.rpc          appel JSON-RPC
 * @param {boolean}  o.mainnet      sur Base mainnet, V4 et V5 sont deployes pour toujours (code LU)
 * @param {boolean}  o.avecDevise   la paire n est pas l ETH natif — le V1 ne sait pas les traiter
 * @param {string}   o.etatV1       etat deja lu du V1, pour ne pas le relire
 */
export async function hookCourant({ rpc, mainnet = false, avecDevise = false, etatV1 = 'NON_LU' }) {
  if (await hookV8Deploye({ rpc }) === 'DEPLOYE') return HOOK_V8;
  if (await hookV7Deploye({ rpc }) === 'DEPLOYE') return HOOK_V7;
  if (await hookV6Deploye({ rpc }) === 'DEPLOYE') return HOOK_V6;
  if ((mainnet ? 'DEPLOYE' : await hookV5Deploye({ rpc })) === 'DEPLOYE') return HOOK_V5;
  if ((mainnet ? 'DEPLOYE' : await hookV4Deploye({ rpc })) === 'DEPLOYE') return HOOK_V4;
  /* ⛔ Le V1 n admet que l ETH : lui donner une devise ouvrirait un marche qu il ne sait pas taxer. */
  if (avecDevise) return undefined;
  return etatV1 === 'DEPLOYE' ? HOOK_PREVU : undefined;
}
