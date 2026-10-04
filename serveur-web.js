// serveur-web.js — sert l app en production, avec les en-tetes que GitHub Pages ne laisse pas regler.
// ================================================================================================
// ⛔ LA RAISON D ETRE DE CE FICHIER EST UNE MESURE. Le 2026-09-10, `tokenized-block.github.io`
//    repondait `Cache-Control: max-age=600` sur chaque page, et cet en-tete n est pas configurable
//    la-bas. Dix minutes pendant lesquelles un visiteur revoit le deploiement PRECEDENT — Phil l a
//    constate en rechargeant et en retrouvant l ancienne version. Un correctif deploye qu on ne peut
//    pas montrer n est pas un correctif.
//
// ⇒ ICI LE HTML NE SE MET JAMAIS EN CACHE. `no-cache` ne veut pas dire « ne garde rien » : ca veut
//   dire « redemande-moi avant de reutiliser ». Le navigateur garde sa copie, envoie son ETag, et
//   recoit 304 si rien n a bouge. Cout : une requete. Gain : plus jamais d ancienne version.
//
// ⛔ LISTE BLANCHE EXPLICITE, PAS DE PARCOURS DE DOSSIER. Un serveur statique qui resout un chemin
//    demande sert `../../.env` le jour ou quelqu un le demande. Ici un chemin absent de la table
//    n existe pas, point — meme discipline que le serveur de developpement.
//
// ⛔⛔ CE QUE CE PROCESSUS TOUCHE — corrige le 2026-09-23, parce que la phrase d avant etait FAUSSE.
//    Elle disait « AUCUN SECRET, AUCUNE CLE, AUCUNE ECRITURE ». Or :
//    · ECRITURE : il ecrit deja, en trois endroits (le cache trending et les compteurs d entonnoir,
//      par remplacement atomique sur le volume). La phrase etait perimee depuis ces ajouts, et
//      personne ne l avait remise a jour — un commentaire qui ment est pire qu un commentaire absent,
//      parce qu on s en sert pour decider qu il n y a rien a verifier.
//    · CLE : depuis /api/onramp/session, ce processus LIT une cle secrete CDP dans son environnement
//      pour signer un jeton de deux minutes. C est le rail fiat->Base demande par Phil, et il ne peut
//      pas exister autrement : la doc CDP impose un `sessionToken` fabrique cote serveur.
//    ⛔ CE QUI RESTE VRAI, ET QUI EST GARDE PAR test-onramp-fail-closed / test-cdp-jwt :
//      la cle ne traverse QUE `cdp-jwt.js`, elle n est jamais rendue, jamais journalisee, et aucune
//      reponse HTTP ne la contient — meme en cas d erreur. Sans elle, la route REFUSE en nommant ce
//      qui manque ; elle ne fabrique jamais d URL de secours.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
/* ⛔⛔ AJOUTE LE 2026-09-22, APRES MESURE ET PAS PAR PRINCIPE. Le serveur n envoyait AUCUNE
 * compression : une requete HEAD avec Accept-Encoding gzip ne rendait pas de content-encoding, et
 * app.html partait en 672 523 octets BRUTS a chaque visite — la ou il en fait 213 210 en gzip.
 * 459 Ko de trop, pour chaque visiteur, sur la page d accueil d un produit qu on essaie justement
 * de faire decouvrir. Mesure faite avant le correctif, et refaite apres. */
import { gzipSync } from 'node:zlib';
import { resumerLancementsOL, OL_LISTE_BASE } from './openlaunch.js';
/* ⛔ LES ESPACEMENTS DE TICK VIENNENT DE LA FACTORY, plus d une liste ecrite a la main : elle en
 *   oubliait trois (80, 150, 500) et cachait la moitie du volume des blocks cotes en action. */
import { lireEspacements, phraseEspacements, ESPACEMENTS_RETOMBEE } from './espacements-cl.js';
/* ⛔ L ORIGINE DES ACTIONS TOKENISEES, D APRES L EMETTEUR — 40 adresses, pas nos 15. */
import { lireActionsEmetteur, phraseActionsEmetteur } from './actions-emetteur.js';
/* le rail fiat->Base : validation pure + transport, et la signature isolee dans son propre module */
import { etatCdp, validerDemande, urlOnramp, creerSession, lireOptionsAchat, CHEMIN_OPTIONS_ACHAT } from './onramp-session.js';
/* le post grave, demande a X depuis ICI — jamais par un script dans la page du visiteur */
import { lirePostPublie } from './post-grave.js';
const postsLus = new Map();
import { signerJwtCdp } from './cdp-jwt.js';

/* ⛔ PONT OPENLAUNCH (tip 0022). Leur API ne renvoie aucun en-tete CORS : la page ne peut pas la lire. Ce serveur la
 * lit pour elle — GET seul, 8 s max, UNE lecture par minute quel que soit le trafic, et il ne renvoie que le RESUME
 * valide par openlaunch.js (jamais la reponse brute). Echec = { ok:false } dit tel quel, pas une liste vide. */
let olCache = { a: 0, corps: null }, olEnCours = null;
function listeOpenLaunch() {
  if (olCache.corps && Date.now() - olCache.a < 60_000) return Promise.resolve(olCache.corps);
  /* des visiteurs simultanes partagent la MEME lecture en cours */
  if (!olEnCours) olEnCours = lireOpenLaunch().finally(() => { olEnCours = null; });
  return olEnCours;
}
async function lireOpenLaunch() {
  let corps;
  try {
    const r = await fetch(OL_LISTE_BASE, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    corps = JSON.stringify({ ok: true, lu: new Date().toISOString(), ...resumerLancementsOL(await r.json()) });
  } catch (e) {
    corps = JSON.stringify({ ok: false, pourquoi: 'OpenLaunch not read: ' + String(e && e.message || e).slice(0, 80) });
  }
  olCache = { a: Date.now(), corps };
  return corps;
}

/* ⛔ TRENDING (tip 0034). Mesure 2026-09-17 : ~5,4 M$ de volume 24 h sur les blocks B20 nes en 24 h, lances AILLEURS ;
 * on ne capte leurs frais que si le trade passe par notre Buy/Sell. Ce serveur tient la liste des blocks crees (logs
 * de la factory B20, lecture seule, ~12 h puis increments (tip 20260923-map-trending)), lit DexScreener par lots de 30 et renvoie le classement.
 * Une lecture complete au plus toutes les 5 min, partagee par tous les visiteurs. Echec = { ok:false }, dit tel quel. */
import { listerCreations, createurDe } from './index-blocks.js';
/* ⛔ 2026-10-02 (Raksha) : COMMENT UN BLOCK PARLE, choisi par son createur — meme module que la page (une seule source). */
import { verifierEcriture, recupererSignataire, proprietaireDuBlock, voixPublique, nettoyerVoix } from './voix-block.js';
import { frappesVers } from './mes-blocks.js';
/* ⛔ LE CALCUL DE GLISSEMENT EST PARTAGE AVEC LE CLIENT, pas recopie ici : deux implementations du
 *   meme calcul divergent, et c est le client qui ouvre ou ferme la puce. Une seule source. */
import { glissementBps, TAILLE_REFERENCE_USDC } from './porte-achat.js';
/* ⛔ LE SELECTEUR SE CALCULE, IL NE SE TAPE PAS. `keccak.js` est pur (zero dependance) et c est la
 *   seule source du depot : un selecteur ecrit a la main ne plante pas, il interroge une AUTRE
 *   fonction et rend un silence qu on lirait comme un fait. */
import { selecteur as selecteurSrv, topic as topicSrv } from './keccak.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
/* ⛔ LE DECODEUR D `Initialize` EST CELUI DU DEPOT, et il REFUSE une cle dont le poolId ne se
 *   recalcule pas. En reecrire une copie ici ferait un lecteur plus faible que le canonique — la
 *   faute que j ai deja faite deux fois aujourd hui. */
/* ⛔ ON N IMPORTE PAS `TOPIC_INITIALIZE` : ce fichier en declare DEJA un, ecrit en dur plus bas.
 *   ⭐ VERIFIE avant de s y fier, parce qu une constante recitee qui divergerait serait un bug muet :
 *     calcule par keccak  0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438
 *     ecrit en dur ici    0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438
 *   IDENTIQUES. On garde celui du fichier pour ne pas creer deux sources du meme fait. */
import { decoderInitialize } from './pools-du-jeton.js';
import { LOGS_INITIALIZE_MESURES } from './cles-v4-mesurees.js';
import { prochaineFenetre } from './fenetre-scan.js';
import { scannerNesDuRouteur, GRAINE_ROUTEUR, GRAINE_JUSQUA, PLANCHER_ROUTEUR, RETARD_MAX_INDEX, chargerIndexRouteur, chargerNosBlocksTb, sourcesTbLues } from './index-routeur.js';
import { veiller } from './veille-pot.js';
import { naissanceDuJeton, passeIncrementale, verifierSomme, soldesNegatifs } from './soldes-jeton.js';
import { partsHolders } from './parts-holders.js';
/* ⛔ LA VEILLE DES FRAIS VIT DANS SON MODULE, TESTE (66 assertions) : la reecrire ici en ferait une
 *    copie plus faible, sans ses quatre etats ni sa borne de fenetres ratees. */
import { scannerLancements } from './lancements-etrangers.js';
import { scanFrais, verifierArrivee, resumerFrais } from './veille-frais.js';
import { NOS_BLOCKS_GENESE, graineNosBlocksAdmise, verifierGraineNos } from './origine.js';
import { FEE_WALLET } from './frais-creation.js';
import { faceDuBlock } from './face.js';
import { logoSvg, paramsLogoDepuisApparence } from './logo.js';
/* ══ RASTERISEUR PNG, CHARGE A LA DEMANDE ══════════════════════════════════════════════════════════
 * ⛔ POURQUOI UN PNG : Base App lit l « image » du contractURI d un B20 ; Coinbase y met une URL https vers un PNG
 *    (mesure sur AAPLc, 2026-09-18). Un SVG en data: ne s y affiche pas.
 * ⛔ POURQUOI WASM : une version native compilee sous Windows planterait le serveur Linux. @resvg/resvg-wasm 2.6.2,
 *    zero dependance. La police (DejaVu Sans Bold, licence libre jointe dans polices/) est chargee avec lui : le WASM
 *    n a aucune police systeme, et sans elle la lettre du logo disparait (mesure : rendu sans lettre).
 * ⛔ CHARGEMENT PARESSEUX ET ISOLE : si le WASM ou la police manquent, SEULE la route .png repond 503 — le reste du
 *    serveur ne depend jamais d eux. */
let rasteriseur = null;
async function obtenirRasteriseur() {
  if (rasteriseur) return rasteriseur;
  const mod = await import('@resvg/resvg-wasm');
  const dir = dirname(fileURLToPath(import.meta.url));
  await mod.initWasm(readFileSync(join(dir, 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm')));
  const police = readFileSync(join(dir, 'polices', 'DejaVuSans-Bold.ttf'));
  rasteriseur = (svg, largeur = 256) => new mod.Resvg(svg, { fitTo: { mode: 'width', value: largeur },
    font: { fontBuffers: [police], defaultFontFamily: 'DejaVu Sans', loadSystemFonts: false } }).render().asPng();
  return rasteriseur;
}
import { resumerTrending } from './trending.js';
import { pairesProposees } from './paires.js';
import { planRail } from './rails-api.js';
/* 2026-10-04 : la naissance planifiee pour un agent, le MCP, et la sortie du minimum du createur (hook 7030) */
import { planNaissance, pairesDeNaissance } from './naissance-api.js';
import { traiterMcp } from './mcp-tblock.js';
import { etatCautionCreateur, sortieCautionPour, cleMarcheCreateur } from './caution-createur.js';
import { creerRegistrePanel } from './panel-sessions.js';
/* les sondes du marche, de l echange et du cerveau : les MEMES modules que l app (rien de reecrit pour la sonde) */
import { vieDuBlock } from './marche.js';
import { etatInitial as etatInitialCerveau, pas as pasCerveau } from './cerveau.js';
import { snapshotCerveau } from './export-cerveau.js';
import { tacheAutorisee } from './brain-tasks.js';
import { prixEthUsd } from './prix-eth.js';
import { plancher7030, DESCRIPTEUR_7030 } from './hook-7030-descripteur.js';
import { V4_ADRESSES } from './lancer-pool.js';
import { randomBytes } from 'node:crypto';
/* tip 20260923-map-trending: rotate public Base RPCs — mainnet.base.org alone 413/rate-limits eth_getLogs (Map soleils die). */
/* tip 20260923-map-trending: only mainnet.base.org still serves free eth_getLogs (≤1k blocs). Others 413/HTML/plan. */
/* ⛔⛔ DEUX ENDPOINTS OFFICIELS PAR DEFAUT, ET PAS PLUS. Mesure du 2026-09-29 :
 *     `mainnet.base.org` SEUL rendait « over rate limit » sur les lectures de pool, depuis cette
 *     machine ET depuis l IP de Railway — la porte d achat restait inerte, 14 verdicts inconnus
 *     sur 16. Sonde de dix endpoints publics : `mainnet.base.org` et
 *     `developer-access-mainnet.base.org` sont les DEUX SEULS a servir les trois choses dont ce
 *     serveur a besoin — `eth_call`, l ETAT ANCIEN, et `eth_getLogs`. La note ci-dessus (« only
 *     mainnet.base.org still serves free eth_getLogs ») etait donc vraie A UN ENDPOINT PRES.
 *   ⛔ POURQUOI LES AUTRES NE SONT PAS ICI : `base.drpc.org`, `1rpc.io/base` et
 *     `base-mainnet.public.blastapi.io` servent `eth_call` mais REFUSENT `eth_getLogs` (HTTP 400).
 *     Les mettre dans cette rotation globale ferait rater une fenetre de logs sur deux au scan du
 *     trending : un degat qu on echangerait contre un peu de quota sans s en apercevoir. Ils sont
 *     utilises a part, la ou seul `eth_call` compte — voir `RPC_FAITS_POOL`.
 *   ⛔ ET LES B20 : ma regle « seul un noeud Base lit un B20 » etait MAL FORMULEE. Verifie le
 *     2026-09-29 sur `totalSupply()` de TBLOCK et `balanceOf(a6cf)` : les quatre endpoints rendent
 *     la MEME valeur au wei, et `eth_getCode` d un B20 rend `0xef` partout. L echec venait
 *     d ANVIL (un EVM generique), pas des RPC tiers, qui font tourner le client Base. Mes deux
 *     temoins negatifs ont ECHOUE A ECHOUER, et c est ce qui a corrige la regle.
 *   ⛔ AUCUNE CLE : ces URL sont publiques, sans inscription. `BASE_RPC` reste prioritaire. */
const RPC_LIST = (process.env.BASE_RPC
  || 'https://mainnet.base.org,https://developer-access-mainnet.base.org')
  .split(',').map((s) => s.trim()).filter(Boolean);
/* ⛔ LA LISTE LARGE, RESERVEE AUX LECTURES QUI NE FONT QUE `eth_call` : quatre fois le quota pour
 *   les faits de pool, sans toucher aux chemins qui ont besoin de `eth_getLogs`. */
const RPC_FAITS_POOL = (process.env.BASE_RPC_LECTURE
  || 'https://mainnet.base.org,https://developer-access-mainnet.base.org,https://base.drpc.org,https://1rpc.io/base')
  .split(',').map((s) => s.trim()).filter(Boolean);
let tourFaits = 0, idFaits = 0;
/** `eth_call` sur la liste LARGE — pour les faits de pool, et rien d autre.
 * ⛔⛔ ELLE TOURNE A CHAQUE ESSAI, et c est le point. `rpcServeur` tourne aussi, mais sa liste ne
 *     contient que les endpoints capables de `eth_getLogs` : deux. Ici on en a quatre, donc un
 *     endpoint etrangle ne bloque plus la lecture — exactement ce qui manquait quand le
 *     prechauffage rendait « 0 lus, 16 inconnus ».
 * ⛔ ELLE REFUSE `0x` COMME REPONSE : un endpoint qui rend une chaine vide au lieu d une valeur
 *   ferait passer une non-reponse pour un zero, et la porte lirait un glissement de 0 bps sur une
 *   pool qu elle n a pas lue. */
async function callLarge(to, data) {
  let dernier = 'aucun essai';
  for (let k = 0; k < RPC_FAITS_POOL.length * 2; k += 1) {
    const url = RPC_FAITS_POOL[tourFaits++ % RPC_FAITS_POOL.length];
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(12000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++idFaits, method: 'eth_call', params: [{ to, data }, 'latest'] }) });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        if (j && j.result !== undefined && j.result !== '0x') return j.result;
        dernier = j && j.error ? String(j.error.message || '').slice(0, 40) : 'reponse vide';
      } else dernier = 'HTTP ' + r.status;
    } catch (e) { dernier = String((e && e.name) || e).slice(0, 24); }
    await new Promise((ok) => setTimeout(ok, 200 * (k + 1)));
  }
  throw new Error('refused by all ' + RPC_FAITS_POOL.length + ' endpoints (' + dernier + ')');
}
/** Les faits on-chain d une pool : son glissement a la taille de reference, et sa FAMILLE PROUVEE.
 *
 * ⛔⛔ TROIS ETATS, JAMAIS DEUX. Une pool illisible rend `glissementBps: null` et
 *     `famille: 'NON_MESURE'`. Le client refuse alors la puce : notre aveuglement ne doit pas
 *     ressembler a un bon marche. Rendre 0 bps par defaut aurait ouvert la porte sur une panne.
 * ⛔ LA FAMILLE SE PROUVE PAR ALLER-RETOUR : on lit `token0/token1/tickSpacing` SUR la pool, on
 *   demande `getPool(token0, token1, tickSpacing)` a la factory Aerodrome, et on exige qu elle
 *   rende CETTE pool. Le `dexId` de l agregateur n est pas une preuve — et l adresse nulle est
 *   exactement ce que la factory rend pour un triplet inconnu, donc l accepter serait accepter
 *   « cette pool n existe pas ».
 * ⛔ `fee` N EST PAS `tickSpacing` : c est `tickSpacing()` qui entre dans `getPool`, et les
 *   confondre designe une pool inexistante (mesure : la pool MUc a un fee de 10 000 et un
 *   tickSpacing de 200).
 */
const FACTORY_AERODROME_CL_SRV = '0xf8f2eb4940cfe7d13603dddd87f123820fc061ef';
const USDC_SRV = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const NON_MESURE_POOL = Object.freeze({ glissementBps: null, famille: 'NON_MESURE' });

/* ══ LES POOLS UNISWAP V4 N ONT PAS D ADRESSE ═════════════════════════════════════════════════════
 * ⛔⛔⛔ LA CAUSE RACINE DE QUATRE SYMPTOMES, MESUREE LE 2026-10-01. `faitsDeLaPool` commencait par
 *   `if (!/^0x[0-9a-fA-F]{40}$/.test(pool))` et rendait `famille: 'NON_MESURE'` avec
 *   « no pool address from the aggregator ». Or une pool V4 N A PAS D ADRESSE : c est un `poolId`
 *   de 32 octets dans le PoolManager singleton. DexScreener met donc ce poolId de 64 hex dans
 *   `pairAddress` — mesure sur TRUMPFIFA :
 *       dexId=uniswap  labels=["v4"]  pairAddress=0x6807fb21…b057   (66 caracteres)
 *   ⇒ LA DONNEE ETAIT DEJA LA. On la jetait parce qu elle ne ressemblait pas a une adresse.
 *
 * ⛔⛔ L AMPLEUR, sur les 250 lignes de `/api/trending` :
 *       `aerodrome` AVEC adresse :  13 lignes (5,2 %)   volume 24 h 101 870 174 $
 *       `uniswap`  SANS adresse  : 237 lignes (94,8 %)  volume 24 h   3 393 356 $
 *   94,8 % des lignes etaient `NON_MESURE` : pas de glissement, donc `porteDAchat` rendait
 *   `NON_MESURE`, donc AUCUNE puce et aucun routage — pour rien, la pool etant lisible.
 *   Quatre symptomes, un seul defaut : `poolAdr: null` sur OUSD, la pool d OHUSD « introuvable »,
 *   TRUMPFIFA invisible, et les blocks cotes en OUSD sans chemin d achat.
 *
 * ⛔ LE FAIL-CLOSED RESTE INTACT, ET C EST VOULU : `NON_MESURE` ⇒ pas de puce. On n ouvre PAS la
 *   porte, on MESURE ce qu on savait deja lire. Le reste du fichier n est pas touche.
 *
 * ⛔ LES DEUX ACCESSEURS SONT VERIFIES SUR LA CHAINE, PAS RECITES. Mesure avec temoin negatif :
 *       TRUMPFIFA/ETH  sqrtPriceX96 146451473072240870738511709852470   liquidite 4327858818808…
 *       USDC/OUSD      sqrtPriceX96 79228127470005035843928324941       liquidite 15572591403846543
 *       poolId BIDON   sqrtPriceX96 0                                   liquidite 0
 *   Un poolId inexistant rend ZERO, pas une erreur : c est ce qui rend le zero INTERPRETABLE.
 *   (`getPoolLiquidity(bytes32)` REVERTE — donc `getLiquidity` est bien le nom.)
 */
const STATE_VIEW_SRV = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';
/* ⛔ LE POOLMANAGER N EST PAS REDECLARE ICI : ce fichier a deja `PM_V4` plus bas, et j ai VERIFIE
 *   qu il vaut bien l adresse que StateView rend par `poolManager()` (0x498581ff…). Deux constantes
 *   pour le meme fait divergeraient le jour ou l une bouge — c est `le jumeau diverge`. */
const EST_POOL_ID_V4 = /^0x[0-9a-fA-F]{64}$/;
/* ⛔ Selecteurs CALCULES par keccak au demarrage, jamais tapes a la main.
 * ⛔⛔ ET ILS PORTENT DEJA LEUR `0x` — PIEGE REEL DU DEPOT, PAYE A L INSTANT : il existe DEUX
 *   fonctions `selecteur`, de MEME NOM, qui ne rendent PAS le meme format :
 *       `keccak.js` -> "0xc815641c"   (avec le prefixe)
 *       `pool.js`   -> "c815641c"     (sans)
 *   J ai importe celle de `keccak.js` ET rajoute `'0x'` : le calldata valait `0x0xc815641c…`, les
 *   quatre endpoints ont repondu « Invalid params », et la branche entiere rendait NON_MESURE.
 *   ⇒ Un meme nom pour deux contrats differents est exactement `la presence d un nom n est pas son
 *     usage`. Les constantes ci-dessous sont donc des calldata COMPLETS, prefixe inclus. */
const SEL_GET_SLOT0 = selecteurSrv('getSlot0(bytes32)');
const SEL_GET_LIQUIDITE = selecteurSrv('getLiquidity(bytes32)');
/* ⛔⛔ CE QUI A CASSE LA PRODUCTION LE 2026-09-29, ET LA LECON. Premiere version : cinq
 *     `eth_call` en `Promise.all` par pool. La page demande ~14 prix d un coup ⇒ **70 appels
 *     simultanes** sur un RPC public ⇒ « over rate limit » ⇒ `glissementBps: null` ⇒ la porte
 *     refuse ⇒ LES PUCES SONT TOMBEES DE 13 A 2 EN PRODUCTION.
 *   ✅ CE QUI A SAUVE LA SITUATION : les trois etats. La porte a refuse au lieu de s ouvrir sur
 *     mon aveuglement, et l endpoint portait `pourquoiFaits: "over rate limit"` — donc la cause
 *     etait LISIBLE au premier appel, sans deviner. Une garde qui echoue FERME et qui DIT
 *     pourquoi transforme une panne en diagnostic.
 *   ⛔ TROIS CORRECTIONS, ET AUCUNE NE CONSISTE A OUVRIR LA PORTE :
 *       1. les lectures sont SEQUENTIELLES, plus jamais en rafale ;
 *       2. `token0/token1/tickSpacing/famille` ne changent JAMAIS pour une pool donnee : on les
 *          garde pour de bon, ce qui ramene les appels repetes de cinq a deux ;
 *       3. un verrou a un seul fil : deux requetes concurrentes sur la meme pool ne la lisent
 *          qu une fois. */
/* ── ⛔⛔ UN VERDICT DATE SURVIT A UNE SECHERESSE DE RPC ──────────────────────────────────────────
 *     MESURE LE 2026-09-29 : le RPC public a etrangle cette machine toute la journee. Faits lus en
 *     rafale : refuses. Un a la fois, espaces de 1,5 s : refuses AUSSI. Le filtre restait donc
 *     INERTE en production — 16 verdicts `NON_MESURE` sur 17 — et BEc gardait sa puce avec 385 bps.
 *   ⛔ INSISTER N EST PAS LA REPONSE : la reponse est de PERSISTER ce qu on a reussi a lire, pour
 *     qu UNE SEULE bonne fenetre suffise. Une pool a 2,4 M$ ne passe pas de 0 a 418 bps en une
 *     heure ; un verdict d hier vaut infiniment mieux qu aucun verdict.
 *   ⛔⛔ ET IL PORTE SON AGE. Un verdict dont on ignore l age serait une photo prise pour du
 *     direct — la faute exacte qui avait grave une liste de puces « photo d un jour ». Le client
 *     recoit `ageFaitsMs` et peut en tirer ses conclusions. */
const FICHIER_FAITS_POOL = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'faits-pool.json') : null;
const faitsPersistes = new Map();  /* jeton -> { glissementBps, famille, pool, tickSpacing, t } */
(function chargerFaitsPersistes() {
  /* ⛔⛔ LE JOURNAL DIT SI LA PERSISTANCE EXISTE. Sans volume monte, `FICHIER_FAITS_POOL` vaut
   *     `null` et tout ce mecanisme est un NO-OP — exactement le genre de correctif inerte qu on
   *     croit avoir livre. Un silence ici l aurait rendu indetectable. */
  if (!FICHIER_FAITS_POOL) {
    console.log('faits de pool : AUCUNE PERSISTANCE (pas de volume monte) — la porte redeviendra '
      + 'inerte a chaque redemarrage et a chaque secheresse de RPC');
    return;
  }
  if (!existsSync(FICHIER_FAITS_POOL)) { console.log('faits de pool : volume present, fichier encore vide'); return; }
  try {
    const j = JSON.parse(readFileSync(FICHIER_FAITS_POOL, 'utf8'));
    for (const [k, v] of Object.entries(j || {})) {
      if (v && typeof v.glissementBps === 'number') faitsPersistes.set(String(k).toLowerCase(), v);
    }
    console.log('faits de pool relus du disque : ' + faitsPersistes.size);
  } catch (_) { /* fichier illisible : on repart a vide, jamais sur des valeurs a moitie lues */ }
})();
function ecrireFaitsPersistes() {
  if (!FICHIER_FAITS_POOL) return;
  try {
    const payload = JSON.stringify(Object.fromEntries(faitsPersistes));
    writeFileSync(FICHIER_FAITS_POOL + '.tmp', payload);
    renameSync(FICHIER_FAITS_POOL + '.tmp', FICHIER_FAITS_POOL);
  } catch (_) { /* disque plein ou volume absent : on garde la memoire vive, on ne casse pas la page */ }
}

const poolImmuables = new Map();   /* pool -> { t0, t1, ts, famille } — jamais expire */
let filePoolFaits = Promise.resolve();
function enFile(tache) {
  const suite = filePoolFaits.then(tache, tache);
  /* ⛔ la file ne doit pas se rompre sur un echec : on la rebranche sur une promesse resolue. */
  filePoolFaits = suite.then(() => undefined, () => undefined);
  return suite;
}
const motDePool = (h, i) => String(h || '').replace(/^0x/, '').slice(i * 64, (i + 1) * 64);
const adrDePool = (h) => '0x' + motDePool(h, 0).slice(24);

/**
 * LES FAITS D UNE POOL UNISWAP V4, LUS PAR SON `poolId` SUR StateView.
 *
 * ⛔ UN POOLID EST UN HASH : on ne peut PAS en retrouver `currency0`. On ne le devine donc pas —
 *   l ordre des devises est de l ARITHMETIQUE sur les deux adresses que l agregateur nomme
 *   (`baseToken`/`quoteToken`), puisque V4 exige `currency0 < currency1`.
 * ⛔⛔ ET LE GLISSEMENT NE SE CALCULE QUE DANS LES BONNES UNITES. `TAILLE_REFERENCE_USDC` est une
 *   taille en USDC ; l appliquer a une pool jeton/ETH melangerait les unites et rendrait un
 *   glissement qui a l air d un chiffre. Sans USDC d un cote, on rend `null` AVEC UNE RAISON
 *   NOMMEE — jamais un nombre invente, jamais un zero.
 * ⛔ LA FAMILLE, ELLE, EST PROUVEE : si `getSlot0(poolId)` rend un prix NON NUL, ce poolId existe
 *   et est initialise dans le PoolManager. Un poolId inexistant rend ZERO (temoin negatif mesure),
 *   et c est ce qui rend le zero interpretable.
 */
/* ⛔⛔ UN `poolId` EST UN HASH : LA CLE NE S EN DEDUIT PAS. Et sans la cle (fee, tickSpacing,
 *   hooks), aucun calldata de swap n est constructible — `planEchangeMultiSauts` exige des sauts
 *   RESOLUS. On va donc la chercher dans l evenement `Initialize` du PoolManager, filtre PAR le
 *   poolId : UN seul topic en plus, donc des fenetres tres legeres.
 * ⛔ `decoderInitialize` REFUSE une cle dont le poolId ne se RECALCULE pas — on ne garde que ce
 *   qu on peut reconstruire. C est ce qui empeche une cle plausible et fausse de passer.
 * ⛔ CACHE POUR TOUJOURS : une cle de pool ne change JAMAIS. Mais on ne cache que les SUCCES —
 *   graver un echec de lecture figerait une cecite pour toute la vie du process. */
const clesV4Lues = new Map();
/* ⛔ 2026-10-02 — PRE-REMPLI par des logs `Initialize` MESURES (cles-v4-mesurees.js), chacun repasse par
 *   `decoderInitialize` : une cle n entre que si son poolId se recalcule. OUSD/USDC est nee hors de la fenetre
 *   de 120 000 blocs remontee ci-dessous — sans ce pre-remplissage, sa route restait cotable et pas construisible. */
for (const l of LOGS_INITIALIZE_MESURES) {
  const p = decoderInitialize(l);
  if (p && !p.erreur && p.cle && p.poolId) clesV4Lues.set(p.poolId, p.cle);
}
async function cleV4DuPoolId(id) {
  const k = String(id).toLowerCase();
  if (clesV4Lues.has(k)) return clesV4Lues.get(k);
  let tete;
  try { tete = parseInt(await rpcServeur('eth_blockNumber', []), 16); } catch (_) { return null; }
  if (!Number.isSafeInteger(tete)) return null;
  const PAS = 2000;
  /* ⛔ ON REMONTE DANS LE TEMPS, et on BORNE : 120 000 blocs couvrent largement la vie des pools
   *   qui nous interessent. Au-dela ce n est plus une lecture, c est un balayage. */
  for (let de = tete - PAS; de > tete - 120000; de -= PAS) {
    let logs;
    try {
      logs = await rpcServeur('eth_getLogs', [{ address: PM_V4,
        topics: [TOPIC_INITIALIZE, k],
        fromBlock: '0x' + Math.max(0, de).toString(16),
        toBlock: '0x' + Math.min(tete, de + PAS - 1).toString(16) }]);
    } catch (_) { continue; /* ⛔ une fenetre refusee n est pas une fenetre vide : on continue */ }
    if (!Array.isArray(logs) || !logs.length) continue;
    const p = decoderInitialize(logs[0]);
    /* ⛔ `p.erreur` veut dire « je ne sais pas reconstruire cette cle » : on ne la garde PAS. */
    if (p && !p.erreur && p.cle) { clesV4Lues.set(k, p.cle); return p.cle; }
    return null;
  }
  return null;
}

async function faitsPoolV4(poolId, infos) {
  const id = String(poolId).toLowerCase();
  return enFile(async () => {
    const RESPIRATION_MS = 400;
    const un = async (data) => {
      const r = await callLarge(STATE_VIEW_SRV, data);
      await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
      return r;
    };
    let s0, lq;
    try {
      /* ⛔ PAS DE `'0x' +` ICI : le selecteur de `keccak.js` le porte deja (voir le commentaire de
       *   SEL_GET_SLOT0). L ajouter donnait `0x0x…` et « Invalid params » sur les quatre endpoints. */
      s0 = await un(SEL_GET_SLOT0 + id.slice(2));
      lq = await un(SEL_GET_LIQUIDITE + id.slice(2));
    } catch (e) {
      /* ⛔ UN REFUS DU RPC N EST PAS « CETTE POOL N EXISTE PAS ». Deux causes, deux verdicts. */
      return { ...NON_MESURE_POOL,
        pourquoiFaits: 'v4 pool reads failed: ' + String((e && e.message) || e).slice(0, 60) };
    }
    let sqrt = 0n, liquidite = 0n;
    try { sqrt = BigInt('0x' + String(s0).replace(/^0x/, '').slice(0, 64)); } catch (_) { sqrt = 0n; }
    try { liquidite = BigInt(lq); } catch (_) { liquidite = 0n; }
    if (sqrt === 0n) {
      /* ⛔ CECI EST UN FAIT, PAS UNE PANNE : le PoolManager ne connait pas ce poolId. */
      return { glissementBps: null, famille: 'autre', poolId: id,
        pourquoiFaits: 'this poolId is not initialized in the v4 PoolManager' };
    }
    /* ⭐ LA FAMILLE EST PROUVEE PAR LA CHAINE : le poolId repond avec un prix. */
    const base = String((infos && infos.base) || '').toLowerCase();
    const quote = String((infos && infos.quote) || '').toLowerCase();
    const aUsdc = base === USDC_SRV || quote === USDC_SRV;
    if (!aUsdc) {
      return { glissementBps: null, famille: 'uniswap-v4', poolId: id, liquiditeV4: String(liquidite),
        pourquoiFaits: 'v4 pool read, but neither side is USDC so the USDC-sized reference '
          + 'would mix units — slippage left unmeasured on purpose' };
    }
    const autre = base === USDC_SRV ? quote : base;
    if (!/^0x[0-9a-f]{40}$/.test(autre)) {
      return { glissementBps: null, famille: 'uniswap-v4', poolId: id, liquiditeV4: String(liquidite),
        pourquoiFaits: 'the other side of the pair was not readable from the aggregator' };
    }
    /* ⛔ `currency0` EST LA PLUS PETITE ADRESSE — c est la regle de V4, donc une COMPARAISON, pas
     *   une supposition. L inverser echangerait le sens et rendrait un glissement a l envers. */
    const entreeEst0 = USDC_SRV < autre;
    const gl = glissementBps({ sqrtPriceX96: sqrt, liquidite,
      entree: TAILLE_REFERENCE_USDC, entreeEst0 });
    if (gl.etat !== 'OK') {
      return { glissementBps: null, famille: 'uniswap-v4', poolId: id, liquiditeV4: String(liquidite),
        pourquoiFaits: gl.pourquoi };
    }
    /* ⛔⛔ LA CLE EST RENDUE QUAND ON A SU LA LIRE, parce que c est elle — et pas le `poolId` — qui
     *   permet de CONSTRUIRE un swap. Sans elle, l ecran saurait qu une route existe et ne saurait
     *   pas la fabriquer : un bouton qui promet ce qu il ne peut pas tenir.
     * ⛔ ET SON ABSENCE EST UN FAIT NOMME, pas un silence : `cleV4: null` + `pourquoiCle`. */
    let cleV4 = null;
    try { cleV4 = await cleV4DuPoolId(id); } catch (_) { cleV4 = null; }
    return { glissementBps: Number(gl.bps), famille: 'uniswap-v4', poolId: id,
      liquiditeV4: String(liquidite),
      ...(cleV4 ? { cleV4 } : { cleV4: null,
        pourquoiCle: 'the Initialize event for this poolId was not found in the window read — '
          + 'the route can be priced but not built' }) };
  });
}

async function faitsDeLaPool(pool, infos = null) {
  /* ⛔⛔ LE POOLID V4 PASSE AVANT LA GARDE D ADRESSE, et c est tout le correctif : 64 hex au lieu
   *   de 40, donc l ancienne garde le rejetait comme « pas d adresse » alors qu il porte TOUT ce
   *   qu il faut pour lire la pool. */
  if (EST_POOL_ID_V4.test(String(pool || ''))) return faitsPoolV4(pool, infos);
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(pool || ''))) {
    return { ...NON_MESURE_POOL, pourquoiFaits: 'no pool address and no v4 poolId from the aggregator' };
  }
  return enFile(async () => {
    const cle = String(pool).toLowerCase();
    /* ⛔⛔ L ESPACEMENT EST ENTRE LES APPELS, PAS SEULEMENT ENTRE LES DEVISES. Premiere version :
     *     1,5 s entre devises, mais les cinq `eth_call` d une meme pool partaient COLLES — donc
     *     encore des micro-rafales. Resultat mesure du premier cycle en production :
     *     « prechauffage des faits de pool : 0 lus, 16 inconnus, sur 16 devises ». Zero.
     *   ⛔ 400 ms entre chaque lecture : cinq appels prennent 2 s, seize pools une trentaine de
     *     secondes. Personne n attend ce chemin — il alimente un cache, il a tout son temps. Une
     *     lecture lente qui ABOUTIT vaut infiniment mieux qu une rafale qui echoue. */
    const RESPIRATION_MS = 400;
    /* ⛔ LISTE LARGE ICI, PAS `rpcServeur` : ces lectures ne font que `eth_call`, donc elles
     *   peuvent profiter des quatre endpoints au lieu des deux capables de `eth_getLogs`. */
    const un = async (sig4) => {
      const r = await callLarge(pool, sig4);
      await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
      return r;
    };
    let fixe = poolImmuables.get(cle);
    if (!fixe) {
      let t0, t1, ts;
      try {
        t0 = await un('0x0dfe1681') /* token0() */;
        t1 = await un('0xd21220a7') /* token1() */;
        ts = await un('0xd0c93a7c') /* tickSpacing() */;
      } catch (e) { return { ...NON_MESURE_POOL, pourquoiFaits: 'pool reads failed: ' + String((e && e.message) || e).slice(0, 60) }; }
      let famille = 'autre';
      try {
        /* ⛔ `fee` N EST PAS `tickSpacing` : c est `tickSpacing()` qui entre dans `getPool`, et les
         *   confondre designe une pool inexistante (mesure : la pool MUc a fee 10 000, ts 200). */
        const appel = '0x28af8d0b' /* getPool(address,address,int24) */
          + motDePool(t0, 0) + motDePool(t1, 0) + BigInt(ts).toString(16).padStart(64, '0');
        const rendu = await callLarge(FACTORY_AERODROME_CL_SRV, appel);
        await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
        /* ⛔ L ADRESSE NULLE EST LA REPONSE DE LA FACTORY POUR UN TRIPLET INCONNU : c est un FAIT
         *   (« cette pool n est pas la mienne »), donc `autre`, et non une panne. */
        famille = adrDePool(rendu).toLowerCase() === cle ? 'aerodrome' : 'autre';
      } catch (_) {
        /* ⛔⛔ UN REFUS DU RPC N EST PAS « PAS AERODROME ». Mettre `autre` ici marquerait une pool
         *     Aerodrome comme ne portant pas notre frais pendant une simple panne de lecture, et
         *     `porteNotreFrais` cesserait de compter un revenu REEL. Deux causes, deux verdicts. */
        famille = 'NON_MESURE';
      }
      fixe = { t0, t1, ts: Number(BigInt(ts)), famille };
      /* ⛔ ON NE GRAVE PAS UNE FAMILLE NON MESUREE DANS LE CACHE « JAMAIS EXPIRE » : elle y
       *   resterait pour toute la vie du process. Seul un verdict LU merite d etre immuable. */
      if (famille !== 'NON_MESURE') poolImmuables.set(cle, fixe);
    }
    /* seuls le prix et la liquidite bougent : deux appels, jamais plus */
    let s0, lq;
    try { s0 = await un('0x3850c7bd') /* slot0() */; lq = await un('0x1a686502') /* liquidity() */; }
    catch (e) { return { glissementBps: null, famille: fixe.famille, pourquoiFaits: 'live pool reads failed: ' + String((e && e.message) || e).slice(0, 60) }; }
    const gl = glissementBps({ sqrtPriceX96: BigInt('0x' + motDePool(s0, 0)), liquidite: BigInt(lq),
      entree: TAILLE_REFERENCE_USDC, entreeEst0: adrDePool(fixe.t0).toLowerCase() === USDC_SRV });
    if (gl.etat !== 'OK') return { glissementBps: null, famille: fixe.famille, pourquoiFaits: gl.pourquoi };
    return { glissementBps: Number(gl.bps), famille: fixe.famille, pool: cle, tickSpacing: fixe.ts };
  });
}

/* ══ L ALTERNATIVE AERODROME ══════════════════════════════════════════════════════════════════════
 * ⛔⛔ POURQUOI ELLE EXISTE, EN CHIFFRES. Nos 0,1 % vivent dans `sweepTokenWithFee`, une fonction du
 *     routeur Aerodrome CL. L Universal Router d Uniswap ne l a PAS (extraction PUSH4 : 11
 *     selecteurs, `execute` present, `0xe0e189a0` ABSENT). Or la pool qu on sert vient de
 *     l agregateur, qui designe la PLUS LIQUIDE — parfois Uniswap, et alors le frais est impossible.
 *     Le 2026-09-29, les 138 transactions de Phil sont toutes parties vers l Universal Router :
 *     aucune ne pouvait nous payer. Decision de Phil du 2026-09-30 : chercher l alternative.
 *   ⛔ ON NE LA CHERCHE QUE SI ELLE MANQUE : `famille === 'aerodrome'` ⇒ rien a faire. Mesure du
 *     2026-09-29 : 13 des 14 actions sont DEJA sur Aerodrome, seule MUc ne l est pas. Ce balayage
 *     ne tournera donc presque jamais — et c est ce qui le rend acceptable sur un noeud public.
 *   ⛔⛔ TROUVER LA POOL NE DECIDE RIEN. C est `choix-de-pool.js`, cote client, qui tranche — et il
 *     ne devie que si le SURCOUT pour le visiteur reste sous le frais qu on prend. Ici on MESURE,
 *     on ne choisit pas : rendre un glissement n est pas recommander une route.
 * ⛔⛔⛔ CETTE LISTE A ETE LE BUG, ET IL A COUTE DES JOURS. Elle valait
 *      `[1, 10, 50, 100, 200, 2000]` — SIX espacements ecrits a la main. La factory Aerodrome CL en
 *      declare NEUF : `tickSpacings()` rend `1, 50, 100, 200, 2000, 500, 10, 80, 150`. Manquaient
 *      **80, 150 et 500**. Mesure du 2026-09-30 sur les 13 blocks cotes en action ayant une pool CL :
 *        · trouvables avec les six : 4
 *        · INVISIBLES              : 9, dont TE/MUc a tickSpacing **80** et 107 505 $ de volume 24 h
 *      La moitie du volume de cette categorie etait introuvable, et l ecran en concluait « pas de
 *      pool » — un refus qui ressemblait a un fait de la chaine alors qu il etait un fait sur NOTRE
 *      liste. Une liste blanche sans garde de derive DERIVE : elle n avait aucun tort le jour ou
 *      elle a ete ecrite, la factory a simplement active de nouveaux espacements depuis.
 *    ⇒ La liste n est plus ecrite ici : `espacements-cl.js` la DEMANDE a la factory, et sa retombee
 *      porte les neuf. `test-espacements-cl.mjs` compare le code NU de ce fichier a la reponse
 *      reelle de la factory — il est parti ROUGE sur l espacement 80 avant cette correction.
 * ⚠️ BORNE : on ne sonde que les espacements rendus. Une pool a un espacement que la factory n a
 *    pas active serait invisible — mais elle ne pourrait pas exister non plus. */
const ESPACEMENTS_ALTERNATIVE = Object.freeze([...ESPACEMENTS_RETOMBEE]);
/* ⛔ LA LECTURE VIVANTE, FAITE UNE FOIS. On garde le resultat ET son etat : si la factory est muette
 *   on sonde la retombee, mais on n ecrit jamais qu on l a lue. */
let espacementsLus = null;
async function espacementsASonder() {
  if (espacementsLus === null) {
    espacementsLus = await lireEspacements(
      async (to, data) => { try { return await callLarge(to, data); } catch (_) { return null; } },
      FACTORY_AERODROME_CL_SRV);
    const phrase = phraseEspacements(espacementsLus);
    console.log('[espacements] ' + (phrase || 'factory : ' + espacementsLus.espacements.join(', ')));
  }
  /* ⛔⛔ ON PREND L UNION, PAS LA LECTURE SEULE. Une factory mal lue qui rendrait moins que la
   *     retombee nous ramenerait au bug d origine EN SILENCE. Sonder un espacement desactive ne
   *     coute qu une lecture sterile ; en manquer un coute la moitie du volume. */
  return [...new Set([...espacementsLus.espacements, ...ESPACEMENTS_ALTERNATIVE])].sort((a, b) => a - b);
}
const alternativeImmuable = new Map();   /* jeton -> { pool, ts } | { absente: true } — jamais expire */

/* ⛔⛔ LA LISTE DE L EMETTEUR, RELUE TOUTES LES 24 H. Elle bouge — quatre actions y sont apparues en
 *     une semaine — donc la figer une fois pour la vie du process la rendrait fausse en silence.
 *   ⛔ ET UN ECHEC NE SE GRAVE PAS : sur `RETOMBEE` on garde l horodatage COURT (5 min) pour
 *     reessayer bientot, au lieu de rester 24 h avec une marque partielle. Un zero qui ne peut
 *     plus remonter est un motif deja paye cher dans ce depot. */
let emCache = { r: null, a: 0 };
async function actionsEmetteurServies() {
  const frais = emCache.r && (Date.now() - emCache.a) < (emCache.r.etat === 'OK' ? 86_400_000 : 300_000);
  if (frais) return emCache.r;
  const r = await lireActionsEmetteur(async (url) => {
    const rep = await fetch(url, { headers: { 'x-ms-monitor': '1' } });
    if (!rep.ok) return null;
    return await rep.json();
  });
  emCache = { r, a: Date.now() };
  const phrase = phraseActionsEmetteur(r);
  console.log('[emetteur] ' + (phrase || r.adresses.length + ' actions tokenisees, lues chez l emetteur'));
  return r;
}

async function alternativeAerodrome(jeton, famille) {
  const cle = String(jeton || '').toLowerCase();
  if (!/^0x[0-9a-fA-F]{40}$/.test(cle)) return null;
  /* ⛔ DEJA SUR AERODROME : le frais tombe la ou on est, rien a arbitrer. */
  if (famille === 'aerodrome') return null;
  /* ⛔ FAMILLE NON MESUREE : on ne sait pas si l alternative manque. Chercher serait payer des
   *   lectures pour une question qu on ne sait pas encore poser. */
  if (famille !== 'autre') return { etat: 'NON_MESURE', pourquoi: 'the current pool family is ' + famille };
  return enFile(async () => {
    const RESPIRATION_MS = 400;
    let fixe = alternativeImmuable.get(cle);
    if (!fixe) {
      /* ⛔ LES ESPACEMENTS VIENNENT DE LA FACTORY, plus d une liste ecrite a la main. */
      const aSonder = await espacementsASonder();
      let trouvee = null, refus = 0;
      for (const ts of aSonder) {
        try {
          const appel = '0x28af8d0b' /* getPool(address,address,int24) */
            + cle.replace(/^0x/, '').padStart(64, '0') + USDC_SRV.replace(/^0x/, '').padStart(64, '0')
            + BigInt(ts).toString(16).padStart(64, '0');
          const rendu = await callLarge(FACTORY_AERODROME_CL_SRV, appel);
          await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
          const p = adrDePool(rendu).toLowerCase();
          /* ⛔ L ADRESSE NULLE EST UN FAIT (« pas de pool a cet espacement »), pas une panne. */
          if (!p || /^0x0{40}$/.test(p)) continue;
          /* ⛔⛔⛔ EXISTER N EST PAS ETRE ECHANGEABLE, ET J AI LE TEMOIN : sur USDC/PLTRc la pool a
           *      tickSpacing 1 EXISTE et porte `liquidity = 0`. Retenir la premiere adresse non
           *      nulle gravait donc une pool MORTE — pour toujours, puisque ce cache n expire
           *      jamais — et le glissement calcule dessus divisait par zero. ⛔ Un NaN traverse
           *      toutes les bornes : il aurait fait passer une pool vide pour une route acceptable.
           *   ⛔ ET UNE LIQUIDITE NON LUE N EST PAS UNE LIQUIDITE NULLE : on passe a l espacement
           *     suivant sans compter ca comme un refus de pool, mais on ne grave rien. */
          let liq = null;
          try {
            const l = await callLarge(p, '0x1a686502' /* liquidity() */);
            liq = (!l || l === '0x') ? null : BigInt(l);
            await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
          } catch (_) { liq = null; }
          if (liq === null) { refus += 1; continue; }
          if (liq === 0n) continue;
          trouvee = { pool: p, ts };
          break;
        } catch (_) { refus += 1; }
      }
      /* ⛔⛔ UN BALAYAGE OU TOUT A ETE REFUSE N EST PAS UNE ABSENCE. Graver `absente` apres neuf
       *     refus de RPC condamnerait ce jeton a ne jamais porter notre frais, pour toujours, a
       *     cause d une panne de cinq minutes. C est le motif du zero qui ne peut plus monter.
       *   ⛔ LE SEUIL SUIT LA LISTE REELLEMENT SONDEE, pas une constante : avec neuf espacements et
       *     un seuil reste a six, trois refus de trop auraient suffi a graver un faux `absente`. */
      if (!trouvee && refus >= aSonder.length) {
        return { etat: 'NON_MESURE', pourquoi: 'every tickSpacing probe was refused by the node' };
      }
      fixe = trouvee || { absente: true };
      alternativeImmuable.set(cle, fixe);
    }
    if (fixe.absente) return { etat: 'ABSENTE', pourquoi: 'no Aerodrome CL pool for this block and USDC' };
    /* le prix et la liquidite bougent : deux lectures, comme pour la pool servie */
    try {
      const t0 = await callLarge(fixe.pool, '0x0dfe1681');
      await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
      const s0 = await callLarge(fixe.pool, '0x3850c7bd');
      await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
      const lq = await callLarge(fixe.pool, '0x1a686502');
      const gl = glissementBps({ sqrtPriceX96: BigInt('0x' + motDePool(s0, 0)), liquidite: BigInt(lq),
        entree: TAILLE_REFERENCE_USDC, entreeEst0: adrDePool(t0).toLowerCase() === USDC_SRV });
      if (gl.etat !== 'OK') return { etat: 'NON_MESURE', pool: fixe.pool, tickSpacing: fixe.ts, pourquoi: gl.pourquoi };
      return { etat: 'OK', pool: fixe.pool, tickSpacing: fixe.ts, glissementBps: Number(gl.bps) };
    } catch (e) {
      return { etat: 'NON_MESURE', pool: fixe.pool, tickSpacing: fixe.ts,
        pourquoi: 'alternative pool reads failed: ' + String((e && e.message) || e).slice(0, 60) };
    }
  });
}

let rpcId = 0, rpcTour = 0;
async function rpcServeur(methode, params) {
  let dernier = null;
  const maxEssais = Math.max(3, RPC_LIST.length);
  for (let k = 0; k < maxEssais; k++) {
    const url = RPC_LIST[rpcTour % RPC_LIST.length];
    rpcTour++;
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: methode, params }) });
      const j = await r.json();
      if (!j.error) return j.result;
      const msg = String(j.error.message || 'rpc error');
      dernier = new Error(msg);
      /* tip 20260923-map-prebridge: NEVER retry range/413 — same window will always fail and hung Map 3d scan */
      if (/413|too large|range/i.test(msg)) throw dernier;
      if (!/rate|limit|timeout/i.test(msg)) throw dernier;
    } catch (e) {
      dernier = e;
      if (/413|too large|range/i.test(String(e && e.message || e))) throw e;
    }
    await new Promise((ok) => setTimeout(ok, 300 * (k + 1)));
  }
  throw dernier || new Error('node rate limit');
}
/* ══ LA VRAIE CLE DE POOL D UN BLOCK ══════════════════════════════════════════════════════════════
 * ⛔⛔ MESURE DU 2026-09-17, ET ELLE RENVERSE UNE CONCLUSION QUE J AVAIS PUBLIEE. On croyait que les
 *    pools des autres lanceurs REFUSAIENT notre routeur. Faux : on lisait la mauvaise cle. Pour
 *    bGYND, la pool vraie est fee 3000 / tickSpacing 60 / hooks 0xee0f… ; notre liste de candidats
 *    essayait bien 3000/60, mais TOUJOURS SANS HOOK — donc un autre poolId, donc « pas de marche ».
 *    Avec la cle exacte, le Quoter officiel rend un prix : 0,01 ETH -> 1,856e23 unites, gas 60 256.
 * ⛔ LA CLE EST IMMUABLE : une pool ne change jamais de fee, de tickSpacing ni de hook. Le cache n a
 *    donc pas de peremption — seul un ECHEC de lecture se reessaie.
 * ⛔ ET « PAS TROUVE » N EST PAS « PAS DE POOL » : on rend la fenetre balayee avec la reponse, pour
 *    qu un appelant ne transforme pas notre fenetre trop courte en verdict sur le block. */
const PM_V4 = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const TOPIC_INITIALIZE = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
/* ══ LES PARTS EN ATTENTE DANS NOS HOOKS (2026-09-19) ════════════════════════════════════════════════════════════════
 * ⛔ La part ETH du wallet de frais est versee PENDANT le swap ; les parts en JETON (block a l achat, action a la vente)
 *    s accumulent dans le hook (du[wallet][devise]) jusqu a handleHookFees — que n importe qui peut appeler, et qui paie
 *    TOUJOURS le wallet de frais. Ici : lecture seule de ce qui attend, pool par pool ouverte avec V2/V3 depuis leur
 *    deploiement. Rien n est signe ni envoye par le serveur. */
/* ⛔⛔ LES SIX, PAS DEUX. Cette liste n en contenait que V2 et V3 — et la mesure du 2026-09-21 dit
 *    que 39 des 39 encaissements des 72 dernieres heures viennent du V1, qui n y etait pas.
 *    Un hook absent de cette liste rend un zero qui se lit comme « rien n arrive ».
 * ⚠️ `depuis` est un PLANCHER de balayage, pas une date de deploiement : le bloc 50861088 est la
 *    naissance du block 0, donc anterieur a tous nos hooks. Mieux vaut balayer un peu trop que de
 *    rater des pools ouvertes avant une date qu on aurait devinee. */
const HOOKS_FRAIS = [
  { nom: 'V1', adr: '0xaa6d7bd9fc7d394bc717137936f2939834382044', depuis: 50861088 },
  { nom: 'V2', adr: '0x8e1eb57ad2a87a4f7bc89ce94efd5cd77aec2044', depuis: 51518785 },
  { nom: 'V3', adr: '0x7a7cebb2ccb84c9fbfa2730e6cb23bb192166044', depuis: 51518785 },
  { nom: 'V4', adr: '0x11fcd588c96b1781cc88b8b9f349b6067d9be4c4', depuis: 51518785 },
  { nom: 'V5', adr: '0x799136c3f5f572f1597b5b7e067d3ee45fe4a4c4', depuis: 51567449 },
  { nom: 'V6', adr: '0xd71af554b5b3dcb6bb17946cfa3c41860a50a4cc', depuis: 51586920 },
  { nom: 'V7', adr: '0xb5680fc44ea440fc223d1ca62f2b4f261fda24cc', depuis: 51586920 },
  { nom: 'V8', adr: '0x5926abdabf5d0006ee960a8270f3e124e5a764cc', depuis: 51586920 },
];
const WALLET_FRAIS = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
let fraisCache = null;
/* balayage INCREMENTAL : les devises deja vues restent ; on ne relit que les blocs nouveaux. Une fenetre ratee arrete
 * l avancee (on la relira), jamais un trou recouvert par un « deja lu ». */
const fraisScan = { jusqua: null, devises: new Map(), pools: [] };
async function fraisEnAttente() {
  if (fraisCache && Date.now() - fraisCache.t < 120000) return fraisCache.r;
  const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
  for (const h of HOOKS_FRAIS) if (!fraisScan.devises.has(h.adr)) fraisScan.devises.set(h.adr, new Set());
  const devises = fraisScan.devises;
  const depuis = fraisScan.jusqua === null ? Math.min(...HOOKS_FRAIS.map((h) => h.depuis)) : fraisScan.jusqua + 1;
  let fenetresRatees = 0, avance = true;
  for (let bas = depuis; bas <= tete; bas += 999) {
    const haut = Math.min(tete, bas + 998);
    try {
      const logs = await rpcServeur('eth_getLogs', [{ address: PM_V4, topics: [TOPIC_INITIALIZE], fromBlock: '0x' + bas.toString(16), toBlock: '0x' + haut.toString(16) }]);
      for (const l of logs || []) {
        const hook = '0x' + String(l.data).slice(2 + 128 + 24, 2 + 192);
        if (!devises.has(hook)) continue;
        devises.get(hook).add('0x' + l.topics[2].slice(26));
        devises.get(hook).add('0x' + l.topics[3].slice(26));
        /* la pool elle-meme (id = topic 1) : pour savoir QUI en est le createur enregistre (parts createur) */
        if (!fraisScan.pools.some((x) => x.id === l.topics[1])) fraisScan.pools.push({ hook, id: l.topics[1], c0: '0x' + l.topics[2].slice(26), c1: '0x' + l.topics[3].slice(26) });
      }
      if (avance) fraisScan.jusqua = haut;
    } catch { fenetresRatees++; avance = false; }
  }
  const pad = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const lignes = [];
  for (const h of HOOKS_FRAIS) {
    for (const d of devises.get(h.adr)) {
      if (/^0x0{40}$/.test(d)) continue; /* ETH : deja verse pendant le swap */
      try {
        const du = BigInt(await rpcServeur('eth_call', [{ to: h.adr, data: '0xe69df140' /* du(address,address) */ + pad(WALLET_FRAIS) + pad(d) }, 'latest']));
        if (du === 0n) continue;
        let sym = null, dec = null;
        try { const x = await rpcServeur('eth_call', [{ to: d, data: '0x95d89b41' }, 'latest']); const bx = String(x).slice(2); const n = parseInt(bx.slice(64, 128), 16); sym = Buffer.from(bx.slice(128, 128 + n * 2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').slice(0, 12); } catch { sym = null; }
        try { dec = Number(BigInt(await rpcServeur('eth_call', [{ to: d, data: '0x313ce567' }, 'latest']))); } catch { dec = null; }
        lignes.push({ hook: h.nom, hookAdr: h.adr, devise: d, symbole: sym, decimales: dec, du: du.toString() });
      } catch { fenetresRatees++; }
    }
  }
  const r = { ok: true, lu: new Date().toISOString(), tete, fenetresRatees, lignes };
  fraisCache = { t: Date.now(), r };
  return r;
}
/* ⛔ CACHE COURT ET NOMME : un balayage de 72 h coute ~390 fenetres. Sans cache, chaque
 *    rafraichissement d onglet relancerait tout et le noeud finirait par refuser — et des fenetres
 *    refusees rendraient le total « PLANCHER » sans que personne ne comprenne pourquoi. */
let recentsCache = new Map();
const etrangersCache = new Map();
async function lancementsEtrangers(heures) {
  const cle = String(heures);
  const c = etrangersCache.get(cle);
  if (c && Date.now() - c.t < 300000) return c.r;
  const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
  const deBloc = tete - Math.round(heures * 1800);
  const scan = await scannerLancements({ rpc: rpcServeur, deBloc, aBloc: tete, maxAffinage: 250 });
  const r = {
    ok: true, lu: new Date().toISOString(), heures, deBloc, aBloc: tete,
    complet: scan.ratees === 0, fenetres: scan.fenetres, fenetresRatees: scan.ratees, nonAffines: scan.nonAffines,
    parLaunchpad: scan.parLaunchpad,
    lancements: scan.lancements.slice(-200),
    borne: 'Factory events only. LaunchBlitz is recognised by its metadata host on the o1 factory; bankr by its Doppler integrator / Clanker interface tag.',
  };
  etrangersCache.set(cle, { t: Date.now(), r });
  return r;
}

async function fraisRecents(heures) {
  const cle = String(heures);
  const dansLeCache = recentsCache.get(cle);
  if (dansLeCache && Date.now() - dansLeCache.t < 300000) return dansLeCache.r;
  const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
  const scan = await scanFrais({ rpc: rpcServeur, deBloc: tete - Math.round(heures * 1800), aBloc: tete });
  /* ⛔ ON NE VERIFIE PAS 400 SOLDES A CHAQUE APPEL : seuls les 25 derniers, et on DIT combien
   *    n ont pas ete verifies. Un plafond silencieux se lirait comme « tout est verifie ». */
  const aVerifier = scan.evenements.slice(-25);
  const verifies = [];
  for (const e of aVerifier) {
    const v = await verifierArrivee({ rpc: rpcServeur, evenement: e, wallet: WALLET_FRAIS });
    verifies.push({ hook: e.hook, bloc: e.bloc, tx: e.tx, type: e.type, devise: e.devise,
      montant: e.montant.toString(), etat: v.etat, pourquoi: v.pourquoi || null });
  }
  const resume = resumerFrais(scan);
  const r2 = {
    ok: true, lu: new Date().toISOString(), heures, tete,
    complet: scan.complet, fenetres: scan.fenetres, fenetresRatees: scan.fenetresRatees,
    evenements: resume.evenements,
    nonVerifies: Math.max(0, scan.evenements.length - aVerifier.length),
    parDevise: resume.devises.map((d) => ({ devise: d.devise, n: d.n, total: d.total.toString() })),
    derniers: verifies,
    borne: scan.borne + '. Balance deltas confirm arrival; a beneficiary who paid the transaction '
      + 'itself cannot be confirmed this way and is reported as NON_CONCLUANT, not as a failure.',
  };
  recentsCache.set(cle, { t: Date.now(), r: r2 });
  return r2;
}

const clesPool = new Map();
/* ⛔⛔ 2026-10-03 — PRE-REMPLI (par JETON) depuis les logs Initialize MESURES. Mesure en prod : `/api/cle/<action>` rendait
 *   POOLID_ABSENT pour les 20 actions a pool v4 USDC (cles-v4-actions.js) — leurs Initialize datent de 2 a 12 jours, hors des
 *   40 fenetres de 999 blocs balayees ci-dessous. Sans cle, la fiche ne lisait ni n achetait ces 20 (planEchange, nourri de la
 *   cle exacte, rend APPROBATIONS 0,5 % USDC — BEc, ORCLc, QUBTc). Meme regle : seul un log dont le poolId se recalcule entre. */
for (const l of LOGS_INITIALIZE_MESURES) {
  const p = decoderInitialize(l);
  if (!p || p.erreur || !p.cle || !p.poolId) continue;
  const c = { poolId: p.poolId, currency0: p.cle.currency0, currency1: p.cle.currency1, fee: p.cle.fee, tickSpacing: p.cle.tickSpacing, hooks: p.cle.hooks, bloc: p.bloc };
  for (const j of p.jetons) {
    const t = String(j).toLowerCase();
    const r = clesPool.get(t) || { ok: true, cles: [], balaye: 0, mesure: true };
    if (!r.cles.some((x) => x.poolId === c.poolId)) r.cles.push(c);
    clesPool.set(t, r);
  }
}
async function resoudreClePool(token, fenetres = 40) {
  const t = String(token).toLowerCase();
  if (clesPool.has(t)) return clesPool.get(t);
  const t32 = '0x' + t.slice(2).padStart(64, '0');
  const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
  const trouvees = [];
  for (let i = 0; i < fenetres && !trouvees.length; i++) {
    const fin = tete - i * 999, deb = fin - 998;
    const enHex = (n) => '0x' + n.toString(16);
    for (const topics of [[TOPIC_INITIALIZE, null, null, t32], [TOPIC_INITIALIZE, null, t32]]) {
      const logs = await rpcServeur('eth_getLogs', [{ fromBlock: enHex(deb), toBlock: enHex(fin), address: PM_V4, topics }]);
      for (const l of logs) trouvees.push(l);
    }
  }
  if (!trouvees.length) {
    /* pas de cache : la pool peut etre plus ancienne que la fenetre, et demain la fenetre bougera */
    /* ⛔ LE CHIFFRE ANNONCAIT LE DOUBLE DE CE QUI EST BALAYE : la boucle avance de 999 blocs par
     *   fenetre (ligne 260), pas 2000. C est le message que lit un createur dont la pool n est pas
     *   trouvee — il en concluait que sa pool a plus de 22 h alors que c est possiblement 11 h, et
     *   donc qu il fallait chercher ailleurs. Un chiffre faux dans un diagnostic envoie enqueter
     *   au mauvais endroit. */
    return { ok: false, pourquoi: 'no Initialize found in the last ' + (fenetres * 999) + ' blocks', balaye: fenetres * 999 };
  }
  const cles = trouvees.map((l) => {
    const d = l.data.slice(2), mot = (i) => d.slice(i * 64, (i + 1) * 64);
    return {
      poolId: l.topics[1],
      currency0: '0x' + l.topics[2].slice(26),
      currency1: '0x' + l.topics[3].slice(26),
      fee: parseInt(mot(0), 16),
      tickSpacing: parseInt(mot(1), 16),
      hooks: '0x' + mot(2).slice(24),
      bloc: parseInt(l.blockNumber, 16),
    };
  });
  /* ⛔ meme correction que ci-dessus : 999 par fenetre, pas 2000. Le jumeau du chemin qui REUSSIT —
   *   c est toujours celui qu on oublie, parce qu on ne lit ses chiffres que quand tout va bien. */
  const r = { ok: true, cles, balaye: fenetres * 999 };
  clesPool.set(t, r);
  return r;
}

/* ══ LA FACE GRAVEE D UN BLOCK ════════════════════════════════════════════════════════════════════
 * ⛔⛔ CE QUE PHIL DEMANDE DE VERIFIER (2026-09-17) : « que les blocks correspondent a ce qu ils
 *    creent de base et a ce qui est affiche sur la map ». Mesure du jour : nos deux blocks de genese
 *    portent bien une face GRAVEE (facette lettre/verre et fleche/fil), trois blocks tiers n ont
 *    AUCUNE metadonnee (la face derivee de l adresse est alors la seule verite disponible), et neuf
 *    lectures ont ete REFUSEES par le noeud public depuis le navigateur — ni gravee, ni absente :
 *    non lue. C est pour ces neuf-la que la lecture passe cote serveur, qui reessaie et qui partage
 *    son cache avec tout le monde.
 * ⛔ CE QUI SE MET EN CACHE POUR TOUJOURS : « LU » et « AUCUNE ». Les deux sont immuables — mesure du
 *    2026-09-06 : updateContractURI est REFUSE sur les B20. Un ECHEC, lui, ne se cache jamais. */
const facesLues = new Map();
async function resoudreFace(token) {
  const t = String(token).toLowerCase();
  if (facesLues.has(t)) return facesLues.get(t);
  const r = await faceDuBlock({ rpc: rpcServeur, jeton: t });
  const rep = { ok: true, etat: r.etat, face: r.face || null, role: r.role || null,
    pourquoi: r.pourquoi || null };
  /* ⛔ TOUT CE QUI DECOULE DES METADONNEES EST IMMUABLE, donc cachable : LU, AUCUNE (aucun URI),
   * AUTRE_SOURCE (URI hebergee ailleurs — mesure du 2026-09-18 : un de nos blocks de genese est dans
   * ce cas) et INVALIDE (champs hors bornes). SEUL « NON_LUE » est un echec de LECTURE : jamais cache,
   * sinon une minute de noeud sature condamnerait la face d un block pour toute la vie du process. */
  if (r.etat !== 'NON_LUE') facesLues.set(t, rep);
  return rep;
}

/* ══ 2026-10-03 — L INDEX DES BLOCKS NES DU CreateRouter (/api/blocks-routeur) ═══════════════════════════════════════════
 * ⛔ Graine = les 7 createPaid de mainnet (adresse ET sel lus on-chain), qui couvre [PLANCHER_ROUTEUR, GRAINE_JUSQUA]. Le
 *    serveur lit ensuite VERS L AVANT (logs B20Created -> tx -> to == CreateRouter + createPaid -> sel -> neDuRouteur), par
 *    morceaux, et la plage n avance que sur une lecture sans trou. Chaque entree porte son sel : l app re-verifie la formule.
 * ⛔ « couvertureComplete » = contigu depuis le plancher ; « tete » voyage avec la reponse : l app juge le retard elle-meme
 *    (index-routeur.js, RETARD_MAX_INDEX). Une fenetre ratee est COMPTEE, jamais tue. Lecture seule, aucune signature. */
const PAS_ROUTEUR = 2000;
/* ⛔ R9b (Claude, prod : PEXRA/o1 clignotaient, 11-12 lectures sur 15) : une lecture ratee est RELUE sur place avec une attente
 *    croissante avant de conclure (index du routeur ET nos-blocks). Seule celle qui rate encore compte, et elle ne retire
 *    jamais la couverture deja acquise : la plage n avance simplement pas. */
const REPRISES_LECTURE_MS = [500, 1000, 2000];
const routeurEtat = { blocks: new Map(GRAINE_ROUTEUR.map((g) => [g.jeton, { ...g }])), depuis: PLANCHER_ROUTEUR, jusqua: GRAINE_JUSQUA,
  tete: null, teteLueA: null, ratees: 0, lu: null };
let routeurEnCours = null;
async function etendreBlocksRouteur() {
  const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
  if (!Number.isSafeInteger(tete)) return;
  routeurEtat.tete = tete;
  routeurEtat.teteLueA = Date.now(); /* R8 (C2 R6-3) : l app refuse une tete figee */
  if (routeurEtat.jusqua >= tete) return;
  const aBloc = Math.min(tete, routeurEtat.jusqua + PAS_ROUTEUR);
  let r = await scannerNesDuRouteur({ rpc: rpcServeur, deBloc: routeurEtat.jusqua + 1, aBloc, pas: 1000 });
  for (const b of r.blocks) routeurEtat.blocks.set(b.jeton, b);
  for (const ms of REPRISES_LECTURE_MS) {
    if (!r.fenetresRatees) break;
    await new Promise((ok) => setTimeout(ok, ms));
    r = await scannerNesDuRouteur({ rpc: rpcServeur, deBloc: routeurEtat.jusqua + 1, aBloc, pas: 1000 });
    for (const b of r.blocks) routeurEtat.blocks.set(b.jeton, b);
  }
  routeurEtat.ratees = r.fenetresRatees;
  if (!r.fenetresRatees) routeurEtat.jusqua = aBloc;
  routeurEtat.lu = new Date().toISOString();
}
function rattraperBlocksRouteur() {
  if (routeurEnCours) return;
  routeurEnCours = (async () => {
    try {
      for (let k = 0; k < 40; k += 1) {
        await etendreBlocksRouteur();
        if (routeurEtat.ratees || routeurEtat.tete === null || routeurEtat.tete - routeurEtat.jusqua <= 0) break;
        await new Promise((ok) => setTimeout(ok, 1500));
      }
    } catch (e) { /* on reessaiera au prochain tour */ }
    routeurEnCours = null;
  })();
}
setInterval(() => { if (routeurEtat.lu !== null) rattraperBlocksRouteur(); }, 60000).unref?.();
function blocksRouteurCorps() {
  rattraperBlocksRouteur();
  /* R8 (C2 R6-3) : couverture REELLE — contigue depuis le plancher, 0 trou, et jusqu a la tete (retard borne).
   * R9b : `jusqua` n avance que sur une lecture sans trou, donc une lecture ratee AU-DELA de `jusqua` n ouvre aucun trou dans
   *   [depuis, jusqua] : elle est dite dans `fenetresEnAttente`, et c est le retard borne qui finit par couper si elle persiste. */
  const complet = routeurEtat.depuis <= PLANCHER_ROUTEUR && routeurEtat.tete !== null
    && routeurEtat.tete - routeurEtat.jusqua <= RETARD_MAX_INDEX;
  return JSON.stringify({ ok: true, lu: routeurEtat.lu, blocks: [...routeurEtat.blocks.values()],
    depuis: routeurEtat.depuis, jusqua: routeurEtat.jusqua, tete: routeurEtat.tete, plancher: PLANCHER_ROUTEUR,
    couvertureComplete: complet,
    teteLueA: routeurEtat.teteLueA, fenetresRatees: complet ? 0 : routeurEtat.ratees, fenetresEnAttente: routeurEtat.ratees });
}

/* ⛔⛔ « NOS BLOCKS », CALCULE ICI ET PAS DANS LA PAGE (Phil, 2026-09-20 : « faut expandre depuis le
 *    debut »). Avant, la page scannait une fenetre FIXE de 20 000 blocs (~11 h) sans cache : un block
 *    cree par nous plus tot cessait d etre « a nous » sans aucune erreur a l ecran.
 * ⛔ PLANCHER VERIFIE SUR LA CHAINE, PAS RECITE : le Block 0 a ete mine au bloc 50861088
 *    (tx 0x925bbfbb3c6b90362aed9dbd09816f6c3548a30938913f65f8025c46d1541c92, code 0xef). Rien de nous
 *    ne peut etre anterieur, donc il est inutile de descendre plus bas.
 * ⛔ PLAGE CONTIGUE [depuis, jusqua] QUI N AVANCE QUE SUR UN SCAN PROPRE : une fenetre refusee par le
 *    noeud ne doit JAMAIS etre recouverte par un « deja lu ». Meme discipline que mesFrappes.
 * ⚠️ CACHE EN MEMOIRE : un redeploiement le vide et la couverture repart — R9b : depuis la GRAINE (origine.js), pas
 *    depuis zero. C est DIT dans la reponse (depuis / jusqua / couvertureComplete), jamais masque. */
const PREMIER_BLOCK_TB = 50861088;
const PAS_NOS_BLOCKS = 40000;
/* ⛔⛔ MESURE (2026-09-20, 706 985 blocs, balayage complet, 0 fenetre ratee) : les blocks sont frappes
 *    AU CREATEUR, pas au wallet de frais -- `repartitionFrappe` donne 100 % de la supply au compte qui
 *    cree. Chercher les frappes vers a6cf ne trouve donc qu UN block, la ou le compte createur en a SIX.
 *    La page affichait 2 « nos blocks » au lieu de 7, sans aucune erreur.
 * ⛔ AUCUNE ADRESSE PERSONNELLE ECRITE ICI : la liste se configure par TB_NOS_CREATEURS (adresses
 *    separees par des virgules). Le wallet de frais, lui, est deja public -- il est grave dans le hook.
 * ⛔ UNE ADRESSE MAL FORMEE EST REFUSEE ET DITE : une faute de frappe dans la variable d env ferait
 *    disparaitre des blocks en silence, ce qui est exactement le defaut qu on corrige. */
const CREATEURS_REFUSES = [];
const NOS_CREATEURS = (() => {
  const brut = String(process.env.TB_NOS_CREATEURS || '').split(',').map((x) => x.trim()).filter(Boolean);
  const bons = [];
  for (const a of brut) {
    if (/^0x[0-9a-fA-F]{40}$/.test(a)) bons.push(a);
    else CREATEURS_REFUSES.push(a.slice(0, 12));
  }
  const tous = [FEE_WALLET, ...bons];
  return [...new Map(tous.map((a) => [a.toLowerCase(), a])).values()];
})();
if (CREATEURS_REFUSES.length) console.log('[nos-blocks] ⛔ ' + CREATEURS_REFUSES.length + ' adresse(s) de TB_NOS_CREATEURS mal formee(s), ignoree(s) : ' + CREATEURS_REFUSES.join(', '));
console.log('[nos-blocks] ' + NOS_CREATEURS.length + ' compte(s) surveille(s) · plancher bloc ' + PREMIER_BLOCK_TB);
/* ⛔ R9b : la GRAINE (origine.js) couvre [PREMIER_BLOCK_TB, GRAINE_NOS_JUSQUA] ; seul [jusqua + 1, tete] reste a lire. Graine
 *   refusee (entree hors comptes surveilles, hors plage, compte non couvert) : balayage complet, comme avant. La couverture
 *   n est COMPLETE qu apres une lecture propre jusqu a la tete (`teteAtteinte`), jamais sur la seule graine. */
/* ⛔ F2 (C2 R9b) : admise ici sur sa FORME seulement ; elle n est utilisee qu apres re-verification SUR LA CHAINE au premier tour
 *   (verifierGraineNos : jusqua <= tete, un recu par entree). Une entree qui ne passe pas : graine refusee, balayage complet.
 *   Recu illisible : rien n est complet, on reessaie au tour suivant. */
const GRAINE_NOS = graineNosBlocksAdmise({ comptes: NOS_CREATEURS, plancher: PREMIER_BLOCK_TB });
console.log(GRAINE_NOS.ok ? '[nos-blocks] graine recue : ' + GRAINE_NOS.blocks.length + ' block(s), jusqu au bloc ' + GRAINE_NOS.jusqua + ' — re-verification sur la chaine au premier tour'
  : '[nos-blocks] ⛔ graine refusee (' + GRAINE_NOS.pourquoi + ') : balayage complet depuis la tete jusqu au bloc ' + PREMIER_BLOCK_TB);
const nosBlocksEtat = { blocks: new Set(NOS_BLOCKS_GENESE),
  depuis: null, jusqua: null, graine: GRAINE_NOS.ok ? 'A_VERIFIER' : 'REFUSEE', ratees: 0, lu: null, teteAtteinte: false,
  tete: null, teteLueA: null, graineEssais: 0 };
/* ⛔ G2 (C2) : un RPC sans archive qui ERRE sur les vieux recus (publicnode : « Archive requests require a personal token »)
 *   rendait NON_LU a chaque tour : jamais de balayage, jamais complet. Apres GRAINE_ESSAIS_MAX tours illisibles, la graine est
 *   abandonnee (jamais admise sans verification : fail-closed) et on balaie tout depuis la tete, comme une graine refusee. */
const GRAINE_ESSAIS_MAX = 5;
/* ⛔ F1 (C2, R9b) : « complete » RETOMBE si la couverture prend du retard sur la tete (meme borne que le routeur : RETARD_MAX_INDEX
 *   blocs). Une fenetre qui reste en attente fige `jusqua` : apres ~1 h, couvertureComplete repasse a faux. `tete` et `teteLueA`
 *   voyagent avec la reponse : le client juge aussi le retard et la fraicheur (index-routeur.js, chargerNosBlocksTb). */
const nosBlocksComplet = () => nosBlocksEtat.depuis !== null && nosBlocksEtat.depuis <= PREMIER_BLOCK_TB && nosBlocksEtat.teteAtteinte
  && nosBlocksEtat.tete !== null && nosBlocksEtat.tete - nosBlocksEtat.jusqua <= RETARD_MAX_INDEX;
let nbEnCours = null;
async function etendreNosBlocks() {
  const fin = parseInt(await rpcServeur('eth_blockNumber', []), 16);
  if (!Number.isSafeInteger(fin)) return;
  nosBlocksEtat.tete = fin; nosBlocksEtat.teteLueA = Date.now(); /* F1 : seule une tete LUE rafraichit teteLueA */
  if (nosBlocksEtat.graine === 'A_VERIFIER') {
    const v = await verifierGraineNos({ rpc: rpcServeur, tete: fin });
    if (v.etat === 'NON_LU' && ++nosBlocksEtat.graineEssais < GRAINE_ESSAIS_MAX) { nosBlocksEtat.lu = new Date().toISOString(); return; } /* rien de complet ; on reessaie au tour suivant */
    if (v.etat === 'NON_LU') {
      nosBlocksEtat.graine = 'REFUSEE';
      console.log('[nos-blocks] ⛔ graine non verifiable apres ' + GRAINE_ESSAIS_MAX + ' tours (' + v.pourquoi + ' — RPC sans archive ?) : balayage complet depuis la tete jusqu au bloc ' + PREMIER_BLOCK_TB);
    } else if (v.etat === 'OK') {
      nosBlocksEtat.graine = 'ADMISE';
      for (const b of GRAINE_NOS.blocks) nosBlocksEtat.blocks.add(b);
      nosBlocksEtat.depuis = PREMIER_BLOCK_TB; nosBlocksEtat.jusqua = GRAINE_NOS.jusqua;
      console.log('[nos-blocks] graine admise apres re-verification sur la chaine : ' + GRAINE_NOS.blocks.length + ' recu(s) OK, jusqua ' + GRAINE_NOS.jusqua + ' <= tete ' + fin);
    } else {
      nosBlocksEtat.graine = 'REFUSEE';
      console.log('[nos-blocks] ⛔ graine refusee sur la chaine (' + v.pourquoi + ') : balayage complet depuis la tete jusqu au bloc ' + PREMIER_BLOCK_TB);
    }
  }
  let deBloc, aBloc;
  const f = prochaineFenetre({ fin, depuis: nosBlocksEtat.depuis, jusqua: nosBlocksEtat.jusqua,
    plancher: PREMIER_BLOCK_TB, pas: PAS_NOS_BLOCKS });
  if (!f) return; /* tout est couvert : plus rien a lire */
  deBloc = f.deBloc; aBloc = f.aBloc;
  /* ⛔ TOUS LES COMPTES, ET LES RATES DE CHACUN COMPTENT. Un seul compte qui echoue doit empecher la
   *    plage d avancer — sinon un trou serait recouvert par un « deja lu ». */
  /* ⛔ R9b : une fenetre ratee est RELUE sur place (REPRISES_LECTURE_MS) ; seules celles qui ratent encore comptent. */
  let ratees = 0; const restent = [];
  for (const compte of NOS_CREATEURS) {
    const scan = await frappesVers({ rpc: rpcServeur, compte, deBloc, aBloc });
    for (const b of scan.blocks) nosBlocksEtat.blocks.add(String(b.jeton).toLowerCase());
    /* ⛔ F4 (C2 R9b) : une fenetre dont un jeton n a pas pu etre verifie (eth_getCode en echec) n est pas propre : relue, puis en attente */
    const aRelire = [...new Map([...(scan.fenetresRatees || []), ...(scan.fenetresNonVerifiees || [])].map((w) => [w.de + '-' + w.a, w])).values()];
    for (const w of aRelire) {
      let relue = false;
      for (const ms of REPRISES_LECTURE_MS) {
        await new Promise((ok) => setTimeout(ok, ms));
        const r = await frappesVers({ rpc: rpcServeur, compte, deBloc: w.de, aBloc: w.a });
        for (const b of r.blocks) nosBlocksEtat.blocks.add(String(b.jeton).toLowerCase());
        if (!(r.fenetresRatees || []).length && !(r.fenetresNonVerifiees || []).length) { relue = true; break; }
      }
      if (!relue) { ratees += 1; restent.push(w); }
    }
  }
  /* ⛔ LES BLOCKS TROUVES SONT GARDES MEME SI UNE FENETRE A RATE : ils sont vrais. C est la PLAGE qui
   *    n avance pas, pas l ensemble — et la couverture DEJA acquise [depuis, jusqua] n est jamais remise a zero. */
  nosBlocksEtat.ratees = ratees;
  if (!nosBlocksEtat.ratees) {
    if (nosBlocksEtat.jusqua === null) { nosBlocksEtat.depuis = deBloc; nosBlocksEtat.jusqua = aBloc; }
    else if (aBloc === fin) nosBlocksEtat.jusqua = aBloc;
    else nosBlocksEtat.depuis = deBloc;
    if (aBloc === fin) nosBlocksEtat.teteAtteinte = true;
  } else if (f.sens === 'AVANT') {
    /* ⛔ F3 (C2 R9b) : RATTRAPAGE INCREMENTAL. Les fenetres de frappesVers partitionnent [deBloc, aBloc] de la meme facon pour
     *   chaque compte : tout ce qui est SOUS la plus basse fenetre encore ratee est lu proprement. jusqua avance jusque-la (et
     *   pas plus loin : fail-closed) ; une graine vieille sur un RPC instable progresse fenetre par fenetre au lieu de tout
     *   relire a chaque tour. */
    const basRate = Math.min(...restent.map((w) => w.de));
    if (basRate - 1 > nosBlocksEtat.jusqua) nosBlocksEtat.jusqua = basRate - 1;
  } else if (f.sens === 'ARRIERE') {
    const hautRate = Math.max(...restent.map((w) => w.a)); /* remontee : seule la partie propre AU-DESSUS de la ratee est acquise */
    if (hautRate + 1 < nosBlocksEtat.depuis) nosBlocksEtat.depuis = hautRate + 1;
  }
  nosBlocksEtat.lu = new Date().toISOString();
}
/* ⛔ LE RATTRAPAGE SE CONDUIT SEUL, ET IL SAIT S ARRETER. Tant que la couverture n atteint pas le
 *    plancher, on enchaine un morceau de plus apres une pause -- sinon la remontee n avancerait qu au
 *    rythme des visites (18 morceaux = 18 visites). Quand c est complet, plus rien n est planifie. */
let rattrapageArme = false;
function rattraperNosBlocks() {
  if (rattrapageArme) return;
  rattrapageArme = true;
  const pas = async () => {
    try { await etendreNosBlocks(); } catch (e) { /* on reessaiera au prochain tour */ }
    if (nosBlocksComplet()) {
      rattrapageArme = false;
      console.log('[nos-blocks] couverture complete jusqu au bloc ' + PREMIER_BLOCK_TB
        + ' · ' + nosBlocksEtat.blocks.size + ' block(s) a nous');
      return;
    }
    setTimeout(pas, 4000).unref?.();
  };
  setTimeout(pas, 1500).unref?.();
}
/* ⛔ G1 (C2, revue F1-F5) : une fois complete, plus rien n etait planifie, et depuis F1 une tete lue il y a plus de 10 min
 *   (FRAICHEUR_MAX_TETE_MS) est refusee par le client. Serveur au repos, le premier visiteur recevait l etat d AVANT le tour
 *   qu il declenche : PEXRA/o1 INCONNUS ~20 s. Meme rafraichissement de fond que le routeur (60 s) : tete et jusqua restent
 *   fraiches sans visite (lecture legere : 1 eth_blockNumber + la fenetre [jusqua + 1, tete] par minute). */
setInterval(() => { if (nosBlocksEtat.lu !== null) rattraperNosBlocks(); }, 60000).unref?.();
function nosBlocksCorps() {
  rattraperNosBlocks();
  return JSON.stringify({
    ok: true, lu: nosBlocksEtat.lu,
    blocks: [...nosBlocksEtat.blocks],
    depuis: nosBlocksEtat.depuis, jusqua: nosBlocksEtat.jusqua,
    plancher: PREMIER_BLOCK_TB,
    tete: nosBlocksEtat.tete, teteLueA: nosBlocksEtat.teteLueA, graine: nosBlocksEtat.graine,
    couvertureComplete: nosBlocksComplet(),
    /* R9b : `fenetresRatees` = ce qui MANQUE a la couverture annoncee. Une fois complete, une lecture ratee au-dela de
     *   `jusqua` n y retire rien (la plage n avance simplement pas) : elle est dite dans `fenetresEnAttente`, pas en trou. */
    fenetresRatees: nosBlocksComplet() ? 0 : nosBlocksEtat.ratees,
    fenetresEnAttente: nosBlocksEtat.ratees,
    /* ⛔ LA BORNE VOYAGE AVEC LA REPONSE : un appelant qui lirait « blocks » sans « couvertureComplete »
     *    croirait tenir la liste entiere alors que la remontee est encore en cours. */
    comptesSurveilles: NOS_CREATEURS.length,
    borne: 'Blocks minted to any watched account between depuis and jusqua, plus the genesis pair. '
      + 'While couvertureComplete is false the walk back to block ' + PREMIER_BLOCK_TB + ' is still running.',
  });
}

/* ══ QUI DETIENT UN BLOCK, ET QUELLE PART DE RECOMPENSE LUI REVIENDRAIT ═══════════════════════════
 * ⛔ MESURE QUI JUSTIFIE TOUT CECI (2026-09-20, 5 marches, reconstruction verifiee au wei pres) :
 *    le PoolManager detient 99,89 % de la supply d un block, parce que le lancement y place 99,9 %.
 *    Un prorata BRUT enverrait donc la recompense dans une pool que personne ne peut vider.
 *    `partsHolders` exclut une liste NOMMEE, et rend ce qui est exclu pour qu on puisse le dire.
 * ⛔ LE POT EST FICTIF : cet ecran montre des PROPORTIONS, il ne distribue rien.
 * ⛔⛔ SON ECHELLE DOIT ETRE PLUS FINE QUE TOUT VRAI POT. Mesure du 2026-09-20 : a 1 000 000 d unites,
 *    deux porteurs que le pot reel (3e14 wei) paierait 149 999 992 et 14 999 999 wei tombaient a une
 *    part de ZERO et disparaissaient de l ecran — l apercu et le paiement ne repondaient plus la meme
 *    chose. A 1e18, l ecart mesure est de zero oubli.
 * ⚠️ CACHE EN MEMOIRE : un redeploiement le vide et la reconstruction repart. C est dit par `lu`. */
const POT_FICTIF = 10n ** 18n;
const holdersCache = new Map(); /* jeton -> { soldes, naissance, jusqua, ratees, lu, enCours } */
const HOLDERS_MAX = 200;

/* ⛔⛔ CE CACHE NE SURVIVAIT A AUCUN REDEPLOIEMENT, et c est ce que Phil a vu : « Reading every
 *     transfer of this block from its birth… (7) ». Le rejeu coute ~42 lectures et des dizaines de
 *     secondes PAR BLOCK ; il etait refait a froid apres chaque mise en ligne — huit fois rien que
 *     le 2026-09-25. Le magasin existait, il etait juste volatil.
 *   ⛔ MEME MOTIF QUE L ENTONNOIR ET LE TRENDING : volume /data, ecriture atomique (.tmp puis
 *     rename). On ne reinvente pas un mecanisme de persistance a cote de deux qui marchent.
 *   ⛔⛔ ET ON ECHOUE OUVERT, TOUJOURS. Sans volume (local, ou volume absent), tout se comporte
 *     exactement comme avant : memoire seule. Un incident passe de ce depot est un VOLUME PLEIN qui
 *     a corrompu une base — donc ici : rien ne jette, on borne le nombre d entrees, et un echec
 *     d ecriture ne doit jamais empecher une lecture de reussir.
 *   ⛔ ON NE GARDE QUE LES PASSES COMPLETES (`jusqua` pose et zero fenetre ratee). Persister une
 *     passe partielle la ferait revivre a chaque demarrage, et un etat incomplet ressuscite est
 *     pire qu un etat absent : il a l air d une mesure. */
/* ⛔⛔ LES CLES DE POOL, GARDEES POUR TOUJOURS — et c est legitime parce qu une PoolKey est
 *     IMMUABLE : le poolId est le hash de ses propres champs. Ce n est pas un cache de prix, c est
 *     un annuaire. Le prix, lui, est relu a chaque visite et n entre jamais ici.
 *   ⛔ POURQUOI CE FICHIER EXISTE. Mesure du 2026-09-26 : `/api/cle/` rendait « over rate limit »
 *     pour MUc — 806 446 $ de volume 24 h, pool v4 lisible par notre propre StateView. Sans cle, le
 *     client devine, et 432 combinaisons essayees a la main ne retrouvent pas le poolId. Resultat a
 *     l ecran : « Market unread … Use Retry », ou Retry retape la meme route etranglee.
 *     Le meme etranglement cassait AU MOINS trois autres ecrans le meme jour : « 5 window(s)
 *     refused » sur les detenteurs, « 17 window(s) refused » sur les blocks du visiteur, et la
 *     lecture de vie. UN seul point de defaillance, quatre ecrans muets.
 *   ⚠️ CE QUE CE FICHIER NE REPARE PAS : les trois autres ecrans, qui relisent des LOGS et non une
 *     cle. Le remede de fond leur appartient — un noeud a cle (`BASE_RPC` est deja une variable
 *     d environnement, donc c est une CONFIGURATION, pas du code). */
const FICHIER_CLES = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'cles-pool.json') : null;
const CLES_FICHIER_MAX_OCTETS = 2 * 1024 * 1024;
const clesCache = new Map();
let clesEcritureEnCours = false;

function ecrireCles() {
  if (!FICHIER_CLES || clesEcritureEnCours) return;
  clesEcritureEnCours = true;
  try {
    const payload = JSON.stringify([...clesCache]);
    /* ⛔ plutot rien qu un volume plein — meme borne dure que les detenteurs */
    if (payload.length > CLES_FICHIER_MAX_OCTETS) return;
    writeFileSync(FICHIER_CLES + '.tmp', payload);
    renameSync(FICHIER_CLES + '.tmp', FICHIER_CLES);
  } catch (err) { /* ⛔ une ecriture ratee ne casse pas une lecture : la memoire suffit */ }
  finally { clesEcritureEnCours = false; }
}

(function relireCles() {
  if (!FICHIER_CLES || !existsSync(FICHIER_CLES)) return;
  try {
    const brut = JSON.parse(readFileSync(FICHIER_CLES, 'utf8'));
    if (!Array.isArray(brut)) return;
    for (const [jeton, v] of brut) {
      /* ⛔ ON NE RECHARGE QUE DES SUCCES BIEN FORMES : un fichier abime ne doit pas injecter des
       *   cles vides qui feraient croire au client qu il a une reponse. */
      if (typeof jeton === 'string' && v && v.ok === true && Array.isArray(v.cles) && v.cles.length) {
        clesCache.set(jeton.toLowerCase(), { ok: true, cles: v.cles });
      }
    }
    console.log('[cles] ' + clesCache.size + ' cle(s) de pool relue(s) du volume');
  } catch (err) { console.warn('[cles] fichier illisible, on repart a vide : ' + err.message); }
})();
/* ⛔⛔ 2026-10-03 (mesure prod, build actions-v4-cles-lues) : le cache du volume passe AVANT clesPool, et il tenait pour 16 des 20
 *   actions une AUTRE pool (memestock a hook tiers, ou une seconde pool USDC moins profonde) — la pool USDC lue restait invisible
 *   de /api/cle et des rails. On FUSIONNE : chaque cle mesuree (clesPool, `mesure: true`) rejoint la liste du jeton si son poolId
 *   n y est pas ; rien n est retire, vieDuBlock choisit la meilleure parmi toutes. */
(function fusionnerClesMesurees() {
  let ajoutees = 0;
  for (const [t, r] of clesPool) {
    if (!r || r.mesure !== true) continue;
    const c = clesCache.get(t);
    if (!c) continue;
    for (const k of r.cles) if (!c.cles.some((x) => String(x.poolId).toLowerCase() === k.poolId)) { c.cles.push(k); ajoutees += 1; }
  }
  if (ajoutees) console.log('[cles] ' + ajoutees + ' cle(s) mesuree(s) ajoutee(s) aux entrees du volume');
})();

/* ══ LES VOIX DES BLOCKS (Raksha, 2026-10-02) — memoire + volume, meme discipline que les cles ══════ */
const FICHIER_VOIX = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'voix-blocks.json') : null;
const VOIX_FICHIER_MAX_OCTETS = 8 * 1024 * 1024;
const VOIX_CORPS_MAX = 16 * 1024;
const VOIX_POSTS_MINUTE = 60;
const VOIX_POSTS_IP_MINUTE = 6;
const VOIX_MAX_BLOCKS = 3000;
const voixParBlock = new Map();
const voixPosts = { minute: 0, n: 0, parIp: new Map() };
/* ══ NOS RAILS, EXPOSES (2026-10-03) — GET /api/rails/plan (rails-api.js) ══════════════════════════════════════════════
 * ⛔ UN PLAN COUTE DES DIZAINES DE LECTURES (marche, cotations, simulation de la transaction exacte) sur le MEME noeud que
 *   tout le site. Plafond global + par IP + deux en vol ; seul un plan PRET est rendu depuis le cache (15 s) — jamais une
 *   reponse APPROBATIONS : l agent qui vient de signer ses autorisations doit relire, pas recevoir l etat d avant.
 * ⛔ COMPTEURS REMIS A ZERO A CHAQUE DEPLOIEMENT, et nos propres sondes (`x-ms-monitor: 1`) comptees A PART. */
const RAILS_MINUTE = 20;
const RAILS_IP_MINUTE = 4;
const RAILS_EN_VOL_MAX = 2;
const RAILS_CACHE_MS = 15000;
const railsBudget = { minute: 0, n: 0, parIp: new Map() };
const railsCache = new Map();
const railsCompteurs = { plans: 0, prets: 0, approbations: 0, refus: 0, nonMesures: 0, trop: 0, sondes: 0 };
let railsEnVol = 0;
/* ⛔⛔ MESURE EN PROD (2026-10-03, build rails-api-parole-devise) : 3 sondes sur 3 en NON_MESURE — « over rate limit » —
 *   sur le lecteur du serveur (deux endpoints, partages avec tous les scans du site), alors que les memes plans sortaient
 *   PRET depuis une autre machine. Les eth_call d un plan passent donc par la liste LARGE (quatre endpoints), PARAMETRES
 *   ENTIERS : `from`, `value` et les surcharges d etat comptent dans une simulation — `callLarge` les jette, et prend `0x`
 *   pour un echec. Un refus de la chaine (revert) n est PAS reessaye : c est une reponse, pas une panne. */
let idRails = 0;
async function rpcRails(methode, params) {
  if (methode !== 'eth_call') return rpcServeur(methode, params);
  let dernier = new Error('no endpoint tried');
  for (let k = 0; k < RPC_FAITS_POOL.length * 2; k += 1) {
    const url = RPC_FAITS_POOL[tourFaits++ % RPC_FAITS_POOL.length];
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++idRails, method: methode, params }) });
      const j = await r.json().catch(() => null);
      /* ⛔ MESURE EN PROD (build rails-lecteur-large) : 2 sondes sur 3 « decimals or supply unread ». Un endpoint qui rend
       *   `0x` a un decimals() de B20 rend une NON-reponse : sur une LECTURE (sans `from`) on passe a l endpoint suivant.
       *   Une SIMULATION (avec `from`) peut legitimement rendre `0x` (execute du routeur) : c est une reponse. */
      const lecture = !(params && params[0] && params[0].from);
      if (j && !j.error && j.result !== undefined && !(lecture && j.result === '0x')) return j.result;
      if (j && !j.error && j.result === '0x') { dernier = new Error('empty answer to a read'); await new Promise((ok) => setTimeout(ok, 200 * (k + 1))); continue; }
      const msg = j && j.error ? String(j.error.message || 'rpc error') : 'HTTP ' + r.status;
      dernier = new Error(msg);
      if (j && j.error && !/rate|limit|timeout|exceed|too many|capacity|unavailable|busy/i.test(msg)) { dernier.definitif = true; throw dernier; }
    } catch (e) {
      if (e && e.definitif) throw e;
      dernier = e;
    }
    await new Promise((ok) => setTimeout(ok, 200 * (k + 1)));
  }
  throw dernier;
}
/** La cle exacte d un block : le cache de /api/cle d abord, sinon une recherche COURTE (10 fenetres, pas 40). */
async function clesRails(a) {
  const k = String(a || '').toLowerCase();
  const c = clesCache.get(k);
  if (c && Array.isArray(c.cles) && c.cles.length) return c.cles;
  try {
    const r = await resoudreClePool(k, 10);
    if (r && r.ok === true && Array.isArray(r.cles) && r.cles.length) {
      clesCache.set(k, { ok: true, cles: r.cles });
      ecrireCles();
      return r.cles;
    }
  } catch (_) { /* cle illisible : vieDuBlock essaie ses cles standard et dit s il n a pas lu */ }
  return [];
}

/* ── LE MARCHE D UN BLOCK LU PAR LE SERVEUR : GET /api/marche/0x… (2026-10-04) ───────────────────────────────────────────────
 * POURQUOI. Le cerveau d un block ne recevait que la lecture faite DEPUIS LE NAVIGATEUR, sur des noeuds publics. Mesure du jour, dans
 *   le panneau de commande ouvert sur IB022 : 10 reponses 429 (mainnet.base.org ×8, base.drpc.org ×2), `etatVie: null`, « Market on
 *   chain: not read yet », et la porte des taches qui refuse tout echange — pendant que la sonde du SERVEUR lisait ce meme marche
 *   (/sante.sondes.marche : PRET, 0.00163 ETH). Un echec de NOTRE lecture cote navigateur, affiche comme un etat du block.
 * CE QUE C EST. Le MEME lecteur (`vieDuBlock`, marche.js) sur les noeuds des rails. Le navigateur ne l appelle QUE si sa propre lecture
 *   n a pas abouti. ⛔ On ne garde en memoire que les FAITS MESURES (`LUE`, `NON_TROUVEE`), 30 s ; un `NON_LUE` n est jamais cache.
 * ⛔ BORNES : 3 lectures en vol au plus (au-dela : 429), une seule par block a la fois, 400 blocks en memoire. */
const marchesServeur = new Map(), marchesEnCours = new Map();
let marchesEnVol = 0;
async function lireMarcheServeur(token) {
  const c = marchesServeur.get(token);
  if (c && Date.now() - c.t < 30000) return { ...c.r, depuisCache: true };
  if (marchesEnCours.has(token)) return marchesEnCours.get(token);
  if (marchesEnVol >= 3) return { ok: false, occupe: true, etat: 'NON_LUE', pourquoi: 'the market reader is busy — try again in a moment' };
  marchesEnVol += 1;
  const p = (async () => {
    try {
      const v = await vieDuBlock({ rpc: rpcRails, stateView: V4_ADRESSES[8453].stateView, jeton: token, clesExactes: await clesRails(token) });
      const k = v && v.cle ? { currency0: String(v.cle.currency0), currency1: String(v.cle.currency1), fee: Number(v.cle.fee), tickSpacing: Number(v.cle.tickSpacing), hooks: String(v.cle.hooks) } : null;
      const r = { ok: true, etat: String((v && v.etat) || 'NON_LUE'), vie: v && typeof v.vie === 'number' && Number.isFinite(v.vie) ? v.vie : null,
        devise: v && v.devise ? String(v.devise) : null, via: v && v.via ? String(v.via) : null, pourquoi: v && v.pourquoi ? String(v.pourquoi).slice(0, 200) : null,
        cle: k, liquidite: v && v.liquidite !== null && v.liquidite !== undefined ? String(v.liquidite) : null,
        decimales: v && Number.isInteger(v.decimales) ? v.decimales : null, lu: new Date().toISOString(), source: 'server' };
      if (r.etat === 'LUE' || r.etat === 'NON_TROUVEE') {
        if (marchesServeur.size >= 400) marchesServeur.delete(marchesServeur.keys().next().value);
        marchesServeur.set(token, { t: Date.now(), r });
      }
      return r;
    } catch (e) {
      return { ok: false, etat: 'NON_LUE', pourquoi: String((e && e.message) || e).slice(0, 120) };
    } finally { marchesEnVol -= 1; marchesEnCours.delete(token); }
  })();
  marchesEnCours.set(token, p);
  return p;
}

/* ── QUI BOUGE CE BLOCK, EN DIRECT : GET /api/activite/0x… (2026-10-04) ──────────────────────────────────────────────────────
 * Phil, devant l onglet Market du panneau (il listait les echanges d AUTRES blocks) : « l onglet Market est propre au block actuel —
 *   on doit voir qui interagit avec CE block en direct ».
 * CE QUE C EST. Les `Transfer` emis PAR LE JETON LUI-MEME (filtre `address` = le jeton : un contrat tiers ne peut pas les forger),
 *   groupes par transaction, les plus recentes d abord. ⛔ Un evenement n est pas une transaction : le SIGNATAIRE de chaque ligne
 *   est lu sur la transaction (`eth_getTransactionByHash`.from), jamais deduit du `from` d un Transfer. Non lu = null, et dit.
 * ⛔ BORNES, RENDUES AVEC LA REPONSE : la fenetre balayee (300 blocs, elargie a 999 puis 2 997 si moins de 12 transactions),
 *   12 transactions au plus, 6 mouvements par transaction. Cache 20 s ; 3 lectures en vol au plus ; une seule par block a la fois. */
const TOPIC_TRANSFER_SRV = topicSrv('Transfer(address,address,uint256)');
const activitesServeur = new Map(), activitesEnCours = new Map();
let activitesEnVol = 0;
/* ⛔ MESURE (local, 2026-10-04) : sur `rpcServeur` (2 noeuds, partages avec tout le site) cette lecture rendait « over rate limit ».
 *   Elle tourne donc sur une liste PLUS LARGE et ne retente pas le meme noeud : un noeud qui refuse, on passe au suivant.
 *   La tete est reculee de 2 blocs pour qu un noeud legerement en retard sache servir la fenetre. */
const RPC_ACTIVITE = [...new Set([...RPC_LIST, 'https://base-rpc.publicnode.com', 'https://base.drpc.org'])];
let tourActivite = 0;
async function rpcActivite(methode, params) {
  let dernier = new Error('no endpoint tried');
  for (let k = 0; k < RPC_ACTIVITE.length; k += 1) {
    const url = RPC_ACTIVITE[tourActivite++ % RPC_ACTIVITE.length];
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: methode, params }) });
      const j = await r.json();
      if (j && !j.error && j.result !== undefined) return j.result;
      dernier = new Error(String((j && j.error && j.error.message) || 'rpc error').slice(0, 100));
    } catch (e) { dernier = e; }
  }
  throw dernier;
}
async function lireActiviteServeur(token) {
  const c = activitesServeur.get(token);
  if (c && Date.now() - c.t < 20000) return { ...c.r, depuisCache: true };
  if (activitesEnCours.has(token)) return activitesEnCours.get(token);
  if (activitesEnVol >= 3) return { ok: false, occupe: true, pourquoi: 'the activity reader is busy — try again in a moment' };
  activitesEnVol += 1;
  const p = (async () => {
    try {
      const tete = parseInt(await rpcActivite('eth_blockNumber', []), 16) - 2;
      const enHex = (x) => '0x' + x.toString(16);
      const parTx = new Map();
      let balaye = 0, fin = tete;
      for (const taille of [300, 699, 999, 999]) {
        const deb = fin - taille + 1;
        const logs = await rpcActivite('eth_getLogs', [{ fromBlock: enHex(deb), toBlock: enHex(fin), address: token, topics: [TOPIC_TRANSFER_SRV] }]);
        balaye += taille; fin = deb - 1;
        for (const l of (Array.isArray(logs) ? logs : [])) {
          if (!l || !Array.isArray(l.topics) || l.topics.length < 3 || String(l.address).toLowerCase() !== token) continue;
          const h = String(l.transactionHash);
          if (!parTx.has(h)) parTx.set(h, { tx: h, bloc: parseInt(l.blockNumber, 16), mouvements: [] });
          let montant = null;
          try { montant = BigInt(String(l.data).slice(0, 66)).toString(); } catch (_) { montant = null; }
          parTx.get(h).mouvements.push({ de: '0x' + String(l.topics[1]).slice(26).toLowerCase(), vers: '0x' + String(l.topics[2]).slice(26).toLowerCase(), montant, i: parseInt(l.logIndex, 16) });
        }
        if (parTx.size >= 12) break;
      }
      const txs = [...parTx.values()].sort((a, b) => b.bloc - a.bloc || b.mouvements[0].i - a.mouvements[0].i).slice(0, 12);
      /* ⛔ MESURE (1er jet, 12 lectures en parallele sur les noeuds publics) : 9 signataires sur 12 revenaient null — le noeud etranglait
       *   la rafale. Les transactions se lisent donc TROIS par trois, avec une seconde tentative ; un signataire non lu reste null. */
      const lireTx = async (t) => {
        t.mouvements = t.mouvements.sort((a, b) => a.i - b.i).slice(0, 6).map(({ de, vers, montant }) => ({ de, vers, montant }));
        t.signataire = null; t.cible = null;
        for (let essai = 0; essai < 2 && t.signataire === null; essai += 1) {
          try {
            const x = await rpcActivite('eth_getTransactionByHash', [t.tx]);
            t.signataire = x && /^0x[0-9a-fA-F]{40}$/.test(String(x.from)) ? String(x.from).toLowerCase() : null;
            t.cible = x && /^0x[0-9a-fA-F]{40}$/.test(String(x.to)) ? String(x.to).toLowerCase() : null;
          } catch (_) { /* seconde tentative, puis null */ }
        }
      };
      for (let i = 0; i < txs.length; i += 3) await Promise.all(txs.slice(i, i + 3).map(lireTx));
      /* les pools de ce jeton que NOUS connaissons : le PoolManager v4, et sa pool Aerodrome mesuree s il en a une. Le client dit
       *   « bought » / « sold » par rapport a elles ; un mouvement qui ne touche aucune d elles reste « moved ». */
      const aero = POOLS_ACTIONS_AERODROME.get(token);
      const r = { ok: true, block: token, tete, fenetreBlocs: balaye, pools: [PM_V4.toLowerCase(), ...(aero ? [String(aero.pool).toLowerCase()] : [])],
        transactions: txs, lu: new Date().toISOString() };
      if (activitesServeur.size >= 200) activitesServeur.delete(activitesServeur.keys().next().value);
      activitesServeur.set(token, { t: Date.now(), r });
      return r;
    } catch (e) {
      return { ok: false, pourquoi: 'activity not read: ' + String((e && e.message) || e).slice(0, 120) };
    } finally { activitesEnVol -= 1; activitesEnCours.delete(token); }
  })();
  activitesEnCours.set(token, p);
  return p;
}

/* ══ LA NAISSANCE PAR UN AGENT + LE MCP (2026-10-04) — naissance-api.js, mcp-tblock.js, caution-createur.js ════════════════════
 * ⛔ RIEN N EST SIGNE ICI : des appels NON SIGNES, simules avant d etre rendus. Le wallet de l agent signe.
 * ⛔ MEME BUDGET QUE LES RAILS (une naissance planifiee = ~20 lectures + une simulation, sur les noeuds de tout le site). */
const naissanceCompteurs = { plans: 0, prets: 0, refus: 0, nonMesures: 0, trop: 0, mcp: 0 };
/** Vrai = le budget est pris (a rendre par railsEnVol -= 1). Faux = occupe. */
function prendreBudgetPlan(ip) {
  const minute = Math.floor(Date.now() / 60000);
  if (railsBudget.minute !== minute) { railsBudget.minute = minute; railsBudget.n = 0; railsBudget.parIp.clear(); }
  const nIp = (railsBudget.parIp.get(ip) || 0) + 1;
  if (nIp > RAILS_IP_MINUTE || railsBudget.n >= RAILS_MINUTE || railsEnVol >= RAILS_EN_VOL_MAX) return false;
  railsBudget.parIp.set(ip, nIp);
  railsBudget.n += 1;
  railsEnVol += 1;
  return true;
}
/* eth_simulateV1 : mesure le 2026-10-04 — mainnet.base.org, publicnode et drpc l executent (surcharge de solde comprise) ; un
 *   endpoint qui ne le connait pas ou qui limite n est PAS une reponse : on passe au suivant. Un resultat (tableau) est la
 *   reponse, meme quand un appel y est en 0x0. Toute autre methode : le lecteur des rails. */
const RPC_SIMULATION = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.drpc.org'];
let tourSim = 0;
async function rpcNaissance(methode, params) {
  if (methode !== 'eth_simulateV1') return rpcRails(methode, params);
  let dernier = new Error('no endpoint tried');
  for (let k = 0; k < RPC_SIMULATION.length * 2; k += 1) {
    const url = RPC_SIMULATION[tourSim++ % RPC_SIMULATION.length];
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++idRails, method: methode, params }) });
      const j = await r.json().catch(() => null);
      if (j && Array.isArray(j.result)) return j.result;
      dernier = new Error(j && j.error ? String(j.error.message || 'rpc error') : 'HTTP ' + r.status);
      /* « insufficient funds » est une REPONSE de la chaine (le compte ne peut pas payer) : inutile de la redemander ailleurs */
      if (/insufficient funds/i.test(dernier.message)) throw dernier;
    } catch (e) { dernier = e; if (/insufficient funds/i.test(String(e && e.message))) throw e; }
    await new Promise((ok) => setTimeout(ok, 250 * (k + 1)));
  }
  throw dernier;
}
/* le prix en dollars que l ECRAN lirait : l ETH sur ses pools (prix-eth.js), une devise par notre propre /api/prix-usd (meme
 *   chiffre, meme cache). null = non lu : le plan s arrete en NON_MESURE, il n invente pas un minimum. */
let prixEthCache = { t: 0, usd: null };
async function prixUsdPourPlan(adr) {
  if (adr === null) {
    if (prixEthCache.usd !== null && Date.now() - prixEthCache.t < 60000) return prixEthCache.usd;
    try {
      const r = await prixEthUsd({ rpc: rpcRails, stateView: V4_ADRESSES[8453].stateView });
      if (r && r.etat === 'LU' && Number.isFinite(r.usd) && r.usd > 0) { prixEthCache = { t: Date.now(), usd: r.usd }; return r.usd; }
    } catch (_) { /* non lu */ }
    return null;
  }
  try {
    const d = await fetch('http://127.0.0.1:' + PORT + '/api/prix-usd?adr=' + encodeURIComponent(String(adr).toLowerCase()),
      { signal: AbortSignal.timeout(15000), headers: { 'x-ms-monitor': '1' } }).then((x) => x.json());
    return d && d.ok === true && Number(d.prixUsd) > 0 ? Number(d.prixUsd) : null;
  } catch (_) { return null; }
}
const selAleatoireServeur = () => 'block-' + randomBytes(8).toString('hex');
async function faireNaissance(demande, { sonde = false, soldeSuppose = null } = {}) {
  if (!sonde) naissanceCompteurs.plans += 1;
  const r = await planNaissance(demande, { rpc: rpcNaissance, prixUsd: prixUsdPourPlan, selAleatoire: selAleatoireServeur, chaine: 8453, soldeSuppose });
  if (!sonde) {
    if (r.etat === 'PRET') naissanceCompteurs.prets += 1;
    else if (r.etat === 'REFUSE') naissanceCompteurs.refus += 1;
    else naissanceCompteurs.nonMesures += 1;
  }
  return r;
}
async function faireRail(demande) {
  try { chargerIndexRouteur(JSON.parse(blocksRouteurCorps())); chargerNosBlocksTb(JSON.parse(nosBlocksCorps())); } catch (_) { /* sources non lues : fail-closed */ }
  const r = await planRail(demande, { rpc: rpcRails, clesDe: clesRails, chaine: 8453 });
  if (!sourcesTbLues() && r.etat === 'REFUSE') r.sourcesTb = 'not read on the server: router index or our-blocks list incomplete or stale — a block born elsewhere is refused until they are';
  return r;
}
/** Le minimum du createur d un block ne sur le hook 7030 : l etat lu, et l appel NON SIGNE de la prochaine etape de sortie. */
async function faireCaution({ block, pair, account }) {
  const hook = DESCRIPTEUR_7030.adresse;
  const devise = !pair || /^eth$/i.test(pair) ? '0x0000000000000000000000000000000000000000' : String(pair).toLowerCase();
  const cle = cleMarcheCreateur({ bloc: String(block).toLowerCase(), devise, hook });
  let maintenantSec = Math.floor(Date.now() / 1000);
  try { const b = await rpcRails('eth_getBlockByNumber', ['latest', false]); if (b && b.timestamp) maintenantSec = parseInt(b.timestamp, 16); } catch (_) { /* l horloge du serveur */ }
  const etat = await etatCautionCreateur({ rpc: rpcRails, hook, cle, maintenantSec });
  const sortie = account ? sortieCautionPour({ etat, compte: account, hook, cle }) : { appel: null, pourquoi: 'no account given: state only' };
  const j = (v) => (typeof v === 'bigint' ? v.toString() : v);
  return { ok: etat.etat === 'LUE', etat: etat.etat === 'NON_MESURE' ? 'NON_MESURE' : etat.etat === 'AUCUN' ? 'REFUSE' : 'PRET', pourquoi: etat.pourquoi || null,
    marche: { block: String(block).toLowerCase(), paire: devise, hook: hook.toLowerCase() },
    minimum: etat.etat === 'LUE' ? { createur: etat.createur, depose: j(etat.depose), minimum: j(etat.minimum), partActive: etat.partActive, phase: etat.phase,
      retraitDes: etat.retraitDes, secondesRestantes: etat.secondesRestantes, delaiSec: etat.delaiSec } : null,
    aSigner: sortie.appel ? [sortie.appel] : [], etape: sortie.etape || null, pourquoiPasDAppel: sortie.appel ? null : sortie.pourquoi,
    borne: 'state read at one block; the call is unsigned and NOT simulated here. A request stops the 0.03% creator share at once; the withdrawal opens 7 days later.' };
}
function pairesPourAgent() {
  return { ok: true, etat: 'PRET', frais: { naissanceEthWei: '1000000000000000', note: '0.001 ETH: 0.0007 at creation + 0.0003 at registration' },
    paires: pairesDeNaissance(8453).map((p) => { const pl = plancher7030(p.adr); return { adresse: p.adr, symbole: p.symbole, type: p.type, plancherMinimumCreateur: pl === null ? null : pl.toString() }; }),
    note: 'plancherMinimumCreateur = the contract floor of the creator minimum, in raw units of that currency; the amount asked at birth is the larger of that floor and about $1 at today’s price' };
}
/* ── LA SONDE DE SANTE DE LA NAISSANCE (2026-10-04) ──────────────────────────────────────────────────────────────────────
 * ⛔⛔ POURQUOI : le 2026-10-03 un drapeau a route toutes les naissances vers un hook dont l inscription exigeait un sel que l app
 *   n envoyait pas — TOUS les Create refuses pendant ~5 h, et /sante disait ok. Cette sonde planifie ET SIMULE une naissance
 *   entiere (createPaid + approbations + inscription + ouverture) contre le hook deploye, avec le code DEPLOYE, depuis un compte
 *   de sonde au solde SUPPOSE (aucun fonds reel, rien d envoye). Son verdict est dans /sante.naissance : PRET, ou la raison.
 * ⛔ BORNE : paire ETH seulement (un minimum en devise ne se suppose pas), simulation et non execution, toutes les 10 minutes. */
/* ── LA TELECOMMANDE (2026-10-04) : les sessions de panneau, en memoire (panel-sessions.js) ── */
const registrePanel = creerRegistrePanel({ tirerId: () => randomBytes(16).toString('hex') });
/* le panneau vit DANS l app (extension de l onglet Brain : memes donnees que le cerveau de l app) ; panel.html y conduit les anciens liens */
const URL_PANEL = 'https://tokenizedblock.space/app.html?panel=1';
function ouvrirPanel(block) {
  const r = registrePanel.ouvrir({ block });
  if (!r.ok) return r;
  return { ok: true, session: r.session, url: URL_PANEL + '#s=' + r.session + (block ? '&b=' + String(block).toLowerCase() : ''),
    note: 'the link is for the user: it opens the control panel, where their own wallet signs. The session lasts 2 hours without activity and is lost if the server restarts.' };
}
/* le panneau interroge toutes les 2 s : 30 requetes/min par panneau ouvert. 240/min par adresse laisse plusieurs panneaux et l agent. */
const panelBudget = { minute: 0, parIp: new Map() };
function budgetPanel(ip) {
  const minute = Math.floor(Date.now() / 60000);
  if (panelBudget.minute !== minute) { panelBudget.minute = minute; panelBudget.parIp.clear(); }
  const n = (panelBudget.parIp.get(ip) || 0) + 1;
  panelBudget.parIp.set(ip, n);
  return n <= 240;
}
const COMPTE_SONDE = '0x00000000000000000000000000000000c0ffee77';
let naissanceSonde = { etat: 'PAS_ENCORE', pourquoi: 'not run yet', lu: null };
async function sonderNaissance() {
  try {
    const r = await faireNaissance({ nom: 'Probe', symbole: 'PROBE', compte: COMPTE_SONDE, paire: 'ETH', sel: 'sonde-' + Date.now() }, { sonde: true, soldeSuppose: 10n ** 17n });
    naissanceSonde = { etat: r.etat, pourquoi: r.pourquoi || null, lu: new Date().toISOString(),
      fraisEthWei: r.cout ? r.cout.fraisEthWei : null, totalEthWei: r.cout ? r.cout.totalEthWei : null, hook: r.block ? r.block.hook : null, appels: (r.aSigner || []).length };
  } catch (e) { naissanceSonde = { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 160), lu: new Date().toISOString() }; }
}
/* ── LES TROIS AUTRES SONDES (Phil, 2026-10-04 : « fais pareil pour le brain, le market et le trade, avec ce que l app fait deja ») ──
 * Meme principe que la naissance : le code DEPLOYE, contre la chaine, toutes les 10 minutes, rien d envoye.
 *   marche  : vieDuBlock (le lecteur de l app) sur un block de reference dont le marche existe — doit rendre LUE ;
 *   echange : planRail ETH -> ce block depuis le compte de sonde — doit rendre PRET (le planificateur simule la transaction) ;
 *   cerveau : le reseau de l app (cerveau.js) nourri de CE marche, 24 battements — doit etre dans une phase vivante et sa porte
 *             (brain-tasks.js) doit accepter « trade ». Un cerveau qui refuserait tout echange sur un marche lu est une panne.
 * ⛔ BORNES : UN block de reference (IB022, cote en ETH sur notre hook) — une sonde verte ne dit rien des autres blocks ; des
 *   plans simules, pas des executions ; le cerveau de la sonde n a ni memoire ni nourriture (celui d un visiteur en a). */
const BLOCK_SONDE = '0xb200000000000000000000e4b0c5fbe9c8df579e';
let autresSondes = { marche: { etat: 'PAS_ENCORE' }, echange: { etat: 'PAS_ENCORE' }, cerveau: { etat: 'PAS_ENCORE' } };
async function sonderLeReste() {
  const lu = new Date().toISOString();
  let v = null;
  try {
    v = await vieDuBlock({ rpc: rpcRails, stateView: V4_ADRESSES[8453].stateView, jeton: BLOCK_SONDE, clesExactes: await clesRails(BLOCK_SONDE) });
    autresSondes.marche = { etat: v && v.etat === 'LUE' ? 'PRET' : (v && v.etat) || 'NON_MESURE', pourquoi: v && v.etat !== 'LUE' ? (v.pourquoi || null) : null, vie: v && typeof v.vie === 'number' ? v.vie : null, devise: (v && v.devise) || null, lu };
  } catch (e) { autresSondes.marche = { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120), lu }; }
  try {
    /* ⛔ MESURE (prod, 1er passage) : depuis le compte de sonde VIDE le planificateur repond « not enough ETH in your wallet » — une
     *   reponse juste, mais qui ne dit rien du chemin. La sonde simule donc depuis une adresse qui DETIENT de l ETH (le contrat WETH
     *   de Base, 0x4200…0006) : rien n est signe ni envoye, c est le `from` d une simulation. Resultat mesure : PRET. */
    const r = await faireRail({ de: 'ETH', vers: BLOCK_SONDE, montant: '100000000000000', compte: '0x4200000000000000000000000000000000000006' });
    autresSondes.echange = { etat: r.etat, pourquoi: r.pourquoi || null, route: r.route || null, appels: (r.aSigner || []).length, lu };
  } catch (e) { autresSondes.echange = { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120), lu }; }
  try {
    const faits = { vie: v && v.etat === 'LUE' && typeof v.vie === 'number' ? v.vie : null, vieAvant: null, etatVie: v ? (v.etat === 'REFUSEE' ? 'NON_LUE' : v.etat) : 'NON_LUE' };
    let e = etatInitialCerveau(BLOCK_SONDE), vu = null;
    for (let i = 0; i < 24; i += 1) { const r = pasCerveau(e, faits); e = r.etat; vu = r.vu; }
    const snap = snapshotCerveau({ address: BLOCK_SONDE, symbole: 'IB022', vu, etat: e, journal: [], nourriture: null, vie: faits.vie, etatVie: faits.etatVie, marche: { etatVie: faits.etatVie, vie: faits.vie } });
    const g = tacheAutorisee('trade_tblock', snap);
    autresSondes.cerveau = { etat: g.ok ? 'PRET' : 'REFUSE', pourquoi: g.ok ? null : (g.pourquoi || null), phase: vu ? vu.phase : null, battements: e.tick, lu };
  } catch (e) { autresSondes.cerveau = { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120), lu }; }
}
/* 2026-10-04 — LES SONDES SE COUPENT PAR `TB_SONDES=0`. Elles partent 45 s apres le demarrage et lisent la chaine par les noeuds du
 *   serveur ; un banc qui demarre une copie du serveur contre un noeud FICTIF dont il compte les lectures (test-graine-nos-blocks-r9b)
 *   les recevait aussi : elles n ont rien a y faire, il les coupe. En production la variable n existe pas : sondes actives.
 *   ⛔ CE QUE JE N AI PAS PROUVE : que ce banc etait rouge A CAUSE d elles. Il est reste rouge une fois les sondes coupees, sur un KO
 *   different a chaque passage (C1, P1, mutant n24) — cause NON trouvee ; dit dans le compte rendu, pas masque. */
if (process.env.TB_SONDES !== '0') setTimeout(() => { sonderNaissance().then(sonderLeReste); setInterval(() => { sonderNaissance().then(sonderLeReste); }, 10 * 60 * 1000).unref(); }, 45000).unref();
/* ── LE WIDGET MCP (mcp-widget-panneau.html) : le paquet officiel ext-apps 2.0.3 est EMBARQUE et inline (un bac a sable de chat
 *   bloque tout script distant). Son `export{…}` final devient `globalThis.ExtApps={…}` — la reecriture du guide officiel.
 *   ⛔ Empreinte VERIFIEE au demarrage : un paquet altere ou absent = pas de widget (les outils marchent sans lui). */
const WIDGET_BUNDLE_SHA256 = 'fb56376b7583ecafb4820bdebc150abee18feb6258ff84b83c2c944ebd9c3602';
let widgetHtml = null;
try {
  const brut = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'mcp-ext-apps-2.0.3.bundle.js'));
  if (createHash('sha256').update(brut).digest('hex') === WIDGET_BUNDLE_SHA256) {
    const bundle = brut.toString('utf8').replace(/export\{([^}]+)\};?\s*$/, (_, corps) => 'globalThis.ExtApps={'
      + corps.split(',').map((p) => { const [local, exporte] = p.split(' as ').map((s) => s.trim()); return (exporte || local) + ':' + local; }).join(',') + '};');
    const modele = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'mcp-widget-panneau.html'), 'utf8');
    if (modele.includes('/*__EXT_APPS_BUNDLE__*/') && bundle.includes('globalThis.ExtApps={')) widgetHtml = modele.replace('/*__EXT_APPS_BUNDLE__*/', () => bundle);
  } else console.warn('[mcp] ext-apps bundle hash mismatch — widget disabled');
} catch (e) { console.warn('[mcp] widget not built: ' + e.message); }
function ecrireVoix() {
  if (!FICHIER_VOIX) return;
  try {
    while (voixParBlock.size > VOIX_MAX_BLOCKS) voixParBlock.delete(voixParBlock.keys().next().value);
    const payload = JSON.stringify([...voixParBlock]);
    if (payload.length > VOIX_FICHIER_MAX_OCTETS) return;
    writeFileSync(FICHIER_VOIX + '.tmp', payload);
    renameSync(FICHIER_VOIX + '.tmp', FICHIER_VOIX);
  } catch (err) { /* ⛔ une ecriture ratee ne casse pas une lecture : la memoire suffit */ }
}
(function relireVoix() {
  if (!FICHIER_VOIX || !existsSync(FICHIER_VOIX)) return;
  try {
    const brut = JSON.parse(readFileSync(FICHIER_VOIX, 'utf8'));
    if (!Array.isArray(brut)) return;
    /* ⛔ RE-NETTOYE AU CHARGEMENT : un fichier abime ou ancien ne passe pas sans le filtre d aujourd hui */
    for (const [j, v] of brut) {
      const { voix } = nettoyerVoix(v && v.voix);
      if (typeof j === 'string' && /^0x[0-9a-f]{40}$/.test(j) && voix && Number.isFinite(Number(v.horodatage))) {
        voixParBlock.set(j, { voix, horodatage: Number(v.horodatage), auteur: String(v.auteur || '') });
      }
    }
    console.log('[voix] ' + voixParBlock.size + ' voix relue(s) du volume');
  } catch (err) { console.warn('[voix] fichier illisible, on repart a vide : ' + err.message); }
})();

const FICHIER_HOLDERS = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'holders-cache.json') : null;
/* ⛔ borne dure du fichier : au-dela on n ecrit pas plutot que de remplir le volume */
const HOLDERS_FICHIER_MAX_OCTETS = 4 * 1024 * 1024;
let holdersEcritureEnCours = false;

function ecrireHolders() {
  if (!FICHIER_HOLDERS || holdersEcritureEnCours) return;
  holdersEcritureEnCours = true;
  try {
    const entrees = [];
    for (const [jeton, e] of holdersCache) {
      if (e.jusqua === null || e.ratees !== 0) continue; /* jamais une passe partielle */
      entrees.push([jeton, { soldes: [...e.soldes].map(([a, v]) => [a, String(v)]),
        naissance: e.naissance, jusqua: e.jusqua, ratees: 0, lu: e.lu }]);
    }
    const payload = JSON.stringify(entrees);
    if (payload.length > HOLDERS_FICHIER_MAX_OCTETS) return; /* ⛔ plutot rien qu un volume plein */
    writeFileSync(FICHIER_HOLDERS + '.tmp', payload);
    renameSync(FICHIER_HOLDERS + '.tmp', FICHIER_HOLDERS);
  } catch (err) { /* ⛔ une ecriture ratee ne casse pas une lecture : on retombe sur la memoire */ }
  finally { holdersEcritureEnCours = false; }
}

(function relireHolders() {
  if (!FICHIER_HOLDERS || !existsSync(FICHIER_HOLDERS)) return;
  try {
    const brut = JSON.parse(readFileSync(FICHIER_HOLDERS, 'utf8'));
    if (!Array.isArray(brut)) return;
    for (const [jeton, e] of brut.slice(0, HOLDERS_MAX)) {
      /* ⛔ on revalide l adresse a la relecture : un fichier est une entree comme une autre */
      if (!/^0xb20[0-9a-f]{37}$/.test(String(jeton))) continue;
      if (!e || typeof e !== 'object' || e.jusqua === null || e.ratees !== 0) continue;
      const soldes = new Map();
      for (const [a, v] of Array.isArray(e.soldes) ? e.soldes : []) {
        try { soldes.set(String(a), BigInt(v)); } catch (_) { /* une entree illisible est ignoree */ }
      }
      holdersCache.set(String(jeton), { soldes, naissance: e.naissance, jusqua: e.jusqua,
        ratees: 0, lu: e.lu, enCours: false });
    }
  } catch (err) { /* fichier absent ou abime : on repart de la memoire, comme avant */ }
})();

async function reconstruireHolders(jeton) {
  let e = holdersCache.get(jeton);
  if (!e) {
    /* ⛔ Une reconstruction ne demarre que pour un B20 : le prefixe est le seul filtre sur : il vient
     *    de l adresse elle-meme, pas d une liste qu on tiendrait a jour. */
    if (!/^0xb20[0-9a-f]{37}$/.test(jeton)) return null;
    if (holdersCache.size >= HOLDERS_MAX) holdersCache.delete(holdersCache.keys().next().value);
    e = { soldes: new Map(), naissance: null, jusqua: null, ratees: 0, lu: null, enCours: false };
    holdersCache.set(jeton, e);
  }
  if (e.enCours) return e;
  e.enCours = true;
  try {
    const fin = parseInt(await rpcServeur('eth_blockNumber', []), 16);
    if (e.naissance === null) {
      e.naissance = await naissanceDuJeton({ rpc: rpcServeur, jeton, depuis: PREMIER_BLOCK_TB, jusqua: fin });
      /* ⛔ Naissance introuvable : on ne devine pas un point de depart, on laisse l etat vide. */
      if (e.naissance === null) { e.enCours = false; return e; }
    }
    /* ⛔ LA PASSE VIT DANS soldes-jeton.js POUR ETRE TESTABLE. Une copie ici serait testee par un
     *    test qui la recopie, ce qui ne prouverait rien. Voir passeIncrementale et son audit. */
    await passeIncrementale({ rpc: rpcServeur, jeton, etat: e, naissance: e.naissance, fin });
    e.lu = new Date().toISOString();
  } catch (err) { e.ratees = (e.ratees || 0) + 1; }
  e.enCours = false;
  /* ⛔ ON GARDE LA PASSE SUR LE VOLUME, mais SEULEMENT si elle est complete : une passe partielle
   *   ecrite sur disque ressusciterait a chaque demarrage un etat qu on refuse deja d afficher. */
  if (e.jusqua !== null && e.ratees === 0) ecrireHolders();
  return e;
}

async function holdersCorps(jeton) {
  /* ⛔ ON NE BLOQUE PAS LA REQUETE : la reconstruction d un block coute ~42 lectures et peut durer
   *    des dizaines de secondes. On lance (ou on laisse tourner) et on rend l etat CONNU tout de
   *    suite. Mesure du 2026-09-20 : la version bloquante pendait au-dela de 45 s. */
  const dejaLa = holdersCache.get(jeton);
  if (!dejaLa) {
    if (!/^0xb20[0-9a-f]{37}$/.test(jeton)) return JSON.stringify({ ok: false, pourquoi: 'not a B20 address' });
    void reconstruireHolders(jeton).catch(() => {});
    return JSON.stringify({ ok: true, etat: 'NON_LU', jeton, lu: null,
      pourquoi: 'reading every transfer of this block from its birth — ask again in a moment' });
  }
  void reconstruireHolders(jeton).catch(() => {}); /* rafraichit en tache de fond */
  const e = dejaLa;
  /* ⛔⛔ AUDIT DU 2026-09-20, SECONDE TROUVAILLE : cette fonction ne lisait jamais `enCours`. Pendant
   *    un rejeu, la Map est deja mutee fenetre par fenetre alors que `ratees` et `jusqua` datent de
   *    la passe PRECEDENTE. Un visiteur pouvait donc lire un etat ou un detenteur a 30 % de la supply
   *    etait ABSENT, avec ratees=0 -- et le recevoir en PAYABLE.
   *    Le drapeau existait (il garde l ECRIVAIN) ; il ne gardait pas le LECTEUR. */
  if (e.enCours && e.jusqua === null) {
    /* ⛔⛔ UNE BOUCLE MUETTE N EST PAS UN ETAT, C EST UNE PANNE QU ON NE VOIT PAS. Mesure du
     *     2026-09-25 en production : sur un block a 4 185 transferts, `lu` etait DATE — donc une
     *     passe s etait bien terminee — mais `jusqua` restait null. Signe que la passe RATE des
     *     fenetres, se fait jeter en entier, et recommence. Indefiniment. De l exterieur, la route
     *     repetait « a replay is running » sans jamais dire qu elle n avancait pas d un bloc.
     *     C est ce que Phil voyait : « Reading every transfer of this block from its birth… (7) ».
     *   ⛔ ON EXPOSE `ratees` : un nombre transforme « ca tourne » en « ca tourne ET ca rate ».
     *     C est la difference entre attendre et diagnostiquer.
     *   ⚠️ CE QU ON NE FAIT PAS ICI, ET POURQUOI : avancer le curseur sur les fenetres reussies.
     *     Ce serait le vrai correctif — une passe qui s arrete a la PREMIERE fenetre ratee laisse
     *     un prefixe CONTIGU, donc un point de reprise sur, et le rejeu finirait par aboutir.
     *     Mais `passeIncrementale` est ATOMIQUE par decision, prise apres un audit ou des mutations
     *     gardees sans curseur avance avaient fait RECOMPTER des Transfer : un detenteur credite
     *     25 000 au lieu de 15 000, avec les trois gardes au vert. Retourner cet invariant demande
     *     sa propre garde et sa propre mesure — consigne dans REPRISE plutot que bricole ici. */
    const ratees = Number(e.ratees || 0);
    return JSON.stringify({ ok: true, etat: 'NON_LU', jeton, lu: e.lu, ratees,
      pourquoi: ratees > 0
        ? 'a replay is running but ' + ratees + ' window(s) were refused by the node, so it starts '
          + 'over each time — balances stay unpublishable until one full pass succeeds'
        : 'a replay is running — balances are not publishable until it finishes' });
  }
  if (e.naissance === null) {
    return JSON.stringify({ ok: true, etat: 'NON_LU', jeton, lu: e.lu,
      pourquoi: 'no mint found for this token yet — reading, or it was never minted' });
  }
  /* ⛔ TROIS RAISONS DE REFUSER D AFFICHER DES PARTS, chacune nommee. */
  let total = null;
  try {
    const t = await rpcServeur('eth_call', [{ to: jeton, data: '0x18160ddd' }, 'latest']);
    if (typeof t === 'string' && t !== '0x') total = BigInt(t);
  } catch (err) { total = null; }
  const somme = verifierSomme({ soldes: e.soldes, totalSupply: total });
  const negatifs = soldesNegatifs(e.soldes);
  /* ⛔⛔ « PAS FINI DE LIRE » A SA PROPRE BRANCHE, ET ELLE PASSE EN PREMIER. Sans elle, un balayage
   *    encore en cours (jusqua === null) tombait dans la derniere branche et sortait le message
   *    « reconstructed sum differs from totalSupply by 0 » : un ecart de ZERO presente comme une
   *    difference. Observe en production le 2026-09-20.
   *    Un etat qui se resout tout seul ne doit pas ressembler a un etat qui demande une enquete. */
  if (e.jusqua === null && e.ratees === 0) {
    return JSON.stringify({ ok: true, etat: 'NON_LU', jeton, lu: e.lu, naissance: e.naissance,
      pourquoi: 'still replaying this block transfers from block ' + e.naissance });
  }
  const complet = e.ratees === 0 && e.jusqua !== null && somme.etat === 'JUSTE' && negatifs.length === 0;
  if (!complet) {
    return JSON.stringify({ ok: true, etat: 'INCOMPLET', jeton, lu: e.lu,
      naissance: e.naissance, jusqua: e.jusqua,
      pourquoi: e.ratees ? e.ratees + ' window(s) refused by the node'
        : negatifs.length ? negatifs.length + ' impossible negative balance(s)'
          : somme.etat === 'NON_LU' ? 'totalSupply could not be read'
            : e.jusqua === null ? 'the replay has not finished yet'
              : 'reconstructed sum differs from totalSupply by ' + somme.ecart,
      borne: 'Balances are not trustworthy yet, so no share is shown. This is about our reading, '
        + 'not about the block.' });
  }
  const parts = partsHolders({ soldes: [...e.soldes.entries()], pot: POT_FICTIF });
  return JSON.stringify({
    ok: true, etat: parts.etat, jeton, lu: e.lu, naissance: e.naissance, jusqua: e.jusqua,
    /* ⛔ parts en dix-milliemes CALCULEES A PARTIR DU POT : `montant / 100n` ne tombait juste que
     *    parce que POT_FICTIF valait exactement 1e6. Un changement d echelle aurait fausse l affichage
     *    sans rien casser de visible. */
    detenteurs: parts.parts.map((x) => ({ adr: x.adr, part: Number((x.montant * 10000n) / POT_FICTIF) })),
    /* ⛔ COMBIEN SONT TROP PETITS POUR CETTE ECHELLE : zero attendu, mais un zero MESURE vaut mieux
     *    qu un silence. `poussiere` n est PAS publie ici : il se compare au gas d une reclamation, ce
     *    qui n a aucun sens contre un pot fictif. */
    tropPetits: parts.aZero || 0,
    horsBase: { adresses: parts.exclus.length, pourquoi: parts.exclus.map((x) => x.pourquoi) },
    partHorsBase: total && total > 0n ? Number((parts.baseExclue * 10000n) / total) : null,
    /* ⛔ BORNE CORRIGEE : « no reward contract exists yet » est devenu FAUX le 2026-09-20, le pot est
     *    deploye et la premiere periode est alimentee. Une borne perimee ment a l ecran. */
    borne: 'Shares are pro rata of the supply held OUTSIDE the market pool and our own contracts. '
      + 'At launch the pool holds 99.9% of a block by design. This screen shows proportions only: '
      + 'which block a round pays is decided when that round is anchored, not here.',
  });
}

const blocksConnus = new Set();
/* ⛔⛔ QUI A CREE QUOI — L INDEX QUI MANQUAIT, ET SON ABSENCE RENDAIT LES BLOCKS DES GENS INVISIBLES.
 *     Phil, 2026-09-27 : « je vais sur My blocks et je vois pas le block que j ai cree sur l autre
 *     machine, et le bug doit etre partout ». Il l est.
 *   ⛔ LA CAUSE, MESUREE : le navigateur cherchait les creations avec `listerCreations({ blocs:
 *     43200 })`. A ~2 s par bloc sur Base, 43 200 blocs font EXACTEMENT 24 heures. Un block cree il
 *     y a plus d un jour disparaissait donc de « mes blocks » — sur TOUTES les machines, pas
 *     seulement la seconde. Ce n est pas un defaut de synchronisation, c est une FENETRE.
 *   ⛔ ET ON NE POUVAIT PAS SIMPLEMENT L ELARGIR : le noeud plafonne les fenetres de logs, donc
 *     trente jours depuis un navigateur feraient des centaines de requetes. Le serveur, lui, scanne
 *     DEJA les creations en continu — il lui manquait seulement de retenir QUI a cree.
 *   ⛔⛔ ET L EVENEMENT DE CREATION NE PORTE PAS LE CREATEUR : `index-blocks.js` le dit en toutes
 *       lettres, « seule la transaction dit QUI A PAYE ». On reutilise donc `createurDe`, l aide
 *       canonique deja ecrite et deja eprouvee, plutot qu une version plus faible ecrite ici.
 *   ⚠️ BORNE HONNETE, ET ELLE EST DITE PAR L ENDPOINT : cet index ne connait que les creations vues
 *     depuis le premier scan du serveur. Il grandit avec le temps, il ne remonte pas le passe tout
 *     seul. « pas encore indexe » n est pas « pas a toi ». */
const createurParBlock = new Map();
/* ⛔ OU EN EST LE RATTRAPAGE DU PASSE. `null` = pas encore commence ; sinon, le plus BAS bloc deja
 *   remonte. Persiste, sinon chaque deploiement recommencerait le rattrapage depuis le present et
 *   ne finirait jamais. */
let rattrapageDepuis = null;
/* ⛔ COMBIEN DE REFUS DE SUITE SUR LA MEME FENETRE, et les plages qu on a fini par SAUTER. Un trou
 *   nomme vaut mieux qu un index qui ne finit jamais — et infiniment mieux qu un trou invisible. */
let refusDeSuite = 0;
const trousRattrapage = [];
let blocsLusJusqua = null, trCache = { a: 0, corps: null }, trEnCours = null;
/* tip 20260923-map-trending: persist trending on volume so redeploy does not wipe Map soleils */
const FICHIER_TRENDING = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'trending-cache.json') : null;
/* ⛔⛔⛔ CETTE VERSION EXISTE POUR LA FORME DU PAYLOAD, ET J AI OUBLIE DE L INCREMENTER — MESURE.
 *      Le 2026-09-30 j ai ajoute `emetteur` par ligne et `emetteurEtat` a la charge utile, deploye,
 *      puis constate en production : `emetteurEtat: ABSENT`, 0 ligne marquee, 226 lignes servies.
 *      Le corps venait du cache PERSISTE sur le volume (`FICHIER_TRENDING`), ecrit par le code
 *      d AVANT et recharge au demarrage. Le code neuf tournait ; c est l ANCIEN CORPS qui etait
 *      servi. Rien ne l aurait dit : la reponse est bien formee, juste d une forme perimee.
 *    ⇒ MEME FAMILLE QUE L ESTAMPILLE DE BUILD REUTILISEE, qui aveugle la sonde : un artefact
 *      persiste dont la FORME change et dont la VERSION ne change pas se fait passer pour frais.
 *      Tout ajout ou retrait de champ dans le payload de trending DOIT incrementer cette chaine. */
const TRENDING_CACHE_VER = 'quote-v5'; /* bump to drop bad /data caches after RPC fenetre change */
function chargerTrendingDisque() {
  try {
    if (!FICHIER_TRENDING || !existsSync(FICHIER_TRENDING)) return;
    const x = JSON.parse(readFileSync(FICHIER_TRENDING, 'utf8'));
    if (!x || x.ver !== TRENDING_CACHE_VER || typeof x.corps !== 'string' || x.corps.length < 20) {
      console.log('[trending] disk cache ignored (ver/empty)');
      return;
    }
    let parsed = null;
    try { parsed = JSON.parse(x.corps); } catch { parsed = null; }
    /* never revive a failed empty scan — that is what hid Map soleils after tip map-trending */
    if (parsed && parsed.ok === false) return;
    if (parsed && !(parsed.lignes || []).length && (parsed.fenetresRatees || 0) > 0 && !(parsed.blocksSuivis > 0)) {
      console.log('[trending] disk cache ignored (empty+ratees)');
      return;
    }
    /* ⛔⛔⛔ LA FORME EST VERIFIEE, PAS SEULEMENT LA VERSION — ET C EST UNE MESURE, PAS UNE PRECAUTION.
     *      Le 2026-09-30 j ai ajoute `emetteur`/`emetteurEtat`, deploye, et lu en production :
     *      `emetteurEtat: ABSENT`, 0 ligne marquee, 226 lignes servies. Le code neuf tournait ; le
     *      CORPS venait du cache persiste, ecrit par le code d avant. La reponse etait bien formee,
     *      simplement d une forme PERIMEE — rien ne pouvait le crier.
     *    ⛔ J avais oublie d incrementer `TRENDING_CACHE_VER`. Mais compter sur ma memoire pour
     *      bouger une chaine a chaque changement de champ, c est une liste blanche sans garde de
     *      derive : elle tiendra jusqu a la fois ou j oublierai. La garde SOLIDE est de refuser un
     *      corps a qui manque un champ que le code d aujourd hui produit.
     *    ⚠️ CE QU ELLE NE COUVRE PAS : un champ RENOMME cote ligne, ou un champ dont le SENS change
     *      a nom constant. La version reste donc utile ; elle n est plus seule. */
    /* ⛔⛔ LA GARDE PORTE SUR LA CHARGE **ET** SUR LA LIGNE. Verifier seulement `emetteurEtat` en
     *     tete laisserait passer un corps dont les LIGNES ont perdu un champ — et c est par ligne
     *     que l ecran decide (`quoteAdr` choisit entre une route a deux sauts et une a trois). Une
     *     garde qui ne regarde que l enveloppe est vraie et couvre la mauvaise moitie.
     *   ⛔ TOUT AJOUT DE CHAMP DOIT ETRE AJOUTE ICI, et la version bumpee. Les deux, pas l une. */
    const champsAttendus = ['emetteurEtat'];
    const champsLigne = ['emetteur', 'quoteAdr'];
    if (parsed && (parsed.lignes || []).length > 0) {
      const manque = champsAttendus.find((c) => !Object.prototype.hasOwnProperty.call(parsed, c))
        || champsLigne.find((c) => !Object.prototype.hasOwnProperty.call(parsed.lignes[0] || {}, c));
      if (manque) {
        console.log('[trending] disk cache ignored (shape: no ' + manque + ' — written by older code)');
        return;
      }
    }
    trCache = { a: Number(x.a) || 0, corps: x.corps }; /* a=0 → force refresh path still kicks background */
    for (const a of (x.adrs || [])) if (/^0x[0-9a-fA-F]{40}$/.test(a)) blocksConnus.add(a.toLowerCase());
    /* ⛔ ON RELIT L INDEX DES CREATEURS, ET ON VALIDE LES DEUX COTES : une entree mal formee gravee
     *   par une ancienne version ferait repondre l endpoint avec des adresses qui n en sont pas. */
    for (const [j, c] of (x.createurs || [])) {
      if (/^0x[0-9a-fA-F]{40}$/.test(j || '') && /^0x[0-9a-fA-F]{40}$/.test(c || '')) {
        createurParBlock.set(String(j).toLowerCase(), String(c).toLowerCase());
      }
    }
    if (typeof x.blocsLusJusqua === "number") blocsLusJusqua = x.blocsLusJusqua;
    if (typeof x.rattrapageDepuis === "number") rattrapageDepuis = x.rattrapageDepuis;
    console.log('[trending] disk cache loaded · blocksConnus=' + blocksConnus.size + ' · lignes=' + ((parsed && parsed.lignes) || []).length);
  } catch (e) { console.log('[trending] disk cache unread:', e.message); }
}
function sauverTrendingDisque() {
  if (!FICHIER_TRENDING || !trCache.corps) return;
  try {
    let parsed = null;
    try { parsed = JSON.parse(trCache.corps); } catch { parsed = null; }
    if (parsed && !(parsed.lignes || []).length && (parsed.fenetresRatees || 0) > 0 && !(parsed.blocksSuivis > 0)) {
      console.log('[trending] skip disk save (empty+ratees)');
      return;
    }
    const payload = JSON.stringify({
      ver: TRENDING_CACHE_VER, a: trCache.a, corps: trCache.corps, blocsLusJusqua,
      adrs: [...blocksConnus].slice(-2000),
      /* ⛔⛔ L INDEX DES CREATEURS EST PERSISTE, SINON IL REPART DE ZERO A CHAQUE DEPLOIEMENT — et
       *     comme il ne se remplit qu avec les creations VUES depuis le dernier scan, un index
       *     volatil ne rattraperait JAMAIS le passe. Les gens reperdraient leurs blocks a chaque
       *     mise en ligne : exactement le defaut qu on repare.
       *   ⛔ 5000 ENTREES AU PLUS, et c est dit : le fichier reste borne. Un plafond tacite qui
       *     ferait disparaitre des entrees sans le signaler serait le meme defaut sous un autre nom. */
      createurs: [...createurParBlock.entries()].slice(-5000),
      /* ⛔ L AVANCEMENT DU RATTRAPAGE EST PERSISTE AVEC L INDEX : sans lui, chaque deploiement
       *   recommencerait a remonter depuis le present et ne finirait JAMAIS le passe. */
      rattrapageDepuis,
    });
    writeFileSync(FICHIER_TRENDING + '.tmp', payload);
    renameSync(FICHIER_TRENDING + '.tmp', FICHIER_TRENDING);
  } catch (e) { console.log('[trending] disk cache write failed:', e.message); }
}
chargerTrendingDisque();
function trendingPlaceholder() {
  return JSON.stringify({
    ok: true, lu: new Date().toISOString(), blocksSuivis: blocksConnus.size,
    fenetresRatees: 0, lotsMarche: { ok: 0, ko: 0, statuts: {} },
    lignes: [], blocksAvecPaire: 0, volume24hUsd: 0,
    enCours: true,
    pourquoi: 'Trending refresh in progress — Map soleils will fill when the scan finishes.',
  });
}
function trending() {
  if (trCache.corps && Date.now() - trCache.a < 300_000) return Promise.resolve(trCache.corps);
  if (!trEnCours) trEnCours = lireTrending().finally(() => { trEnCours = null; });
  /* tip 20260923-map-trending: NEVER hang HTTP on cold scan — return disk/memory cache or placeholder */
  if (trCache.corps) return Promise.resolve(trCache.corps);
  return Promise.resolve(trendingPlaceholder());
}
async function lireTrending() {
  let corps;
  try {
    const fin = parseInt(await rpcServeur('eth_blockNumber', []), 16);
    /* cold: 12h first (not 3d) so public RPC can finish; then incremental */
    const blocs = blocsLusJusqua === null ? 3 * 43200 : Math.max(1, fin - blocsLusJusqua); /* tip map-alive: 3d cold OK now fenetre≤999 */
    console.log('[trending] scan start · blocs=' + blocs + ' · connus=' + blocksConnus.size);
    const cr = await listerCreations({ rpc: rpcServeur, blocs, fin });
    for (const c of cr.creations || []) if (/^0x[0-9a-fA-F]{40}$/.test(c.jeton || '')) blocksConnus.add(c.jeton.toLowerCase());
    /* ⛔⛔ ON RETIENT LE CREATEUR DE CHAQUE NOUVELLE CREATION. C est ce qui permet a n importe qui de
     *     retrouver SES blocks, d une machine ou d une autre, sans fenetre de 24 h.
     *   ⛔ SEULEMENT LES NOUVELLES : re-resoudre tout l index a chaque scan ferait des milliers
     *     d appels pour un resultat qui ne change jamais. Un createur ne change pas.
     *   ⛔ ET UN ECHEC DE RESOLUTION N EST PAS UN CREATEUR NUL : `createurDe` rend `null` avec une
     *     raison quand la transaction n a pas pu etre lue. On ne l enregistre PAS — sinon on
     *     graverait « personne » pour un block dont on n a simplement pas pu lire la tx, et la
     *     prochaine passe ne reessaierait jamais. */
    try {
      const aResoudre = (cr.creations || []).filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c.jeton || '')
        && !createurParBlock.has(c.jeton.toLowerCase()));
      for (let i = 0; i < aResoudre.length; i += 8) {
        const lot = aResoudre.slice(i, i + 8);
        const res = await Promise.all(lot.map((c) => createurDe({ rpc: rpcServeur, tx: c.tx })));
        for (let j = 0; j < lot.length; j++) {
          const cre = res[j] && res[j].createur;
          if (cre) createurParBlock.set(lot[j].jeton.toLowerCase(), String(cre).toLowerCase());
        }
      }
      if (aResoudre.length) {
        console.log('[createurs] ' + createurParBlock.size + ' block(s) rattache(s) a un createur ('
          + aResoudre.length + ' resolu(s) ce scan)');
      }
    } catch (e) { console.log('[createurs] resolution partielle : ' + e.message); }
    /* ⛔⛔ ET LE PASSE, SANS QUOI LE CORRECTIF NE REPARE RIEN. L index ci-dessus ne se remplit que
     *     vers L AVANT : il resout les createurs des creations qu il VOIT PASSER. Mesure juste
     *     apres la mise en ligne : `blocksIndexes: 1` pour `blocksSuivis: 1967`. Les blocks deja
     *     crees — c est-a-dire TOUS ceux des gens aujourd hui — n auraient jamais ete rattaches.
     *     Un correctif qui ne couvre que l avenir laisse le probleme entier a ceux qui l ont signale.
     *   ⇒ On remonte donc le temps par fenetres, UNE PAR PASSE, et on persiste l avancement. Le
     *     serveur rattrape en tache de fond au lieu de marteler le noeud public d un coup.
     *   ⛔ UNE SEULE FENETRE PAR PASSE, ET C EST DELIBERE : le noeud public plafonne, et un
     *     rattrapage qui le fait tomber couterait la lecture de marche de tout le monde. Lent et
     *     vivant vaut mieux que rapide et refuse.
     *   ⛔ ET LE PLANCHER EST LE PREMIER BLOCK DE TBLOCK : au-dela il n y a rien a lire. Descendre
     *     plus bas serait scanner le vide indefiniment. */
    try {
      if (rattrapageDepuis === null) rattrapageDepuis = fin;
      if (rattrapageDepuis > PREMIER_BLOCK_TB) {
        const haut = rattrapageDepuis;
        /* ⛔⛔ 10 000 ET NON 43 200, ET C EST UNE MESURE QUI L A IMPOSE. `listerCreations` pagine en
         *     interne par 2000 blocs : une fenetre de 43 200 fait donc 22 pages, et le log de
         *     production disait « +0 · ⛔ 2 fenetre(s) refusee(s), on ne descend pas ». Plus la
         *     fenetre est large, plus la probabilite qu AU MOINS UNE page soit refusee monte — et
         *     ma garde conservatrice bloquait alors la descente ENTIERE. Le rattrapage etait fige.
         *   ⇒ Cinq pages au lieu de vingt-deux : bien moins d occasions de tomber sur un refus. */
        const bas = Math.max(PREMIER_BLOCK_TB, haut - 10000);
        const vieux = await listerCreations({ rpc: rpcServeur, blocs: haut - bas, fin: haut });
        const aFaire = (vieux.creations || []).filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c.jeton || '')
          && !createurParBlock.has(c.jeton.toLowerCase()));
        for (let i = 0; i < aFaire.length; i += 8) {
          const lot = aFaire.slice(i, i + 8);
          const res = await Promise.all(lot.map((c) => createurDe({ rpc: rpcServeur, tx: c.tx })));
          for (let j = 0; j < lot.length; j++) {
            const cre = res[j] && res[j].createur;
            if (cre) createurParBlock.set(lot[j].jeton.toLowerCase(), String(cre).toLowerCase());
          }
        }
        /* ⛔⛔ AVANT : « on n avance QUE si la fenetre a ete lue ». L INTENTION ETAIT JUSTE — ne
         *     jamais sauter de creations en silence — MAIS SA CONSEQUENCE ETAIT UN BLOCAGE
         *     PERMANENT. Mesure en production : « +0 · 2 fenetre(s) refusee(s), on ne descend
         *     pas », curseur immobile sur deux deploiements. Un rattrapage qui n avance jamais ne
         *     rattrape rien : la prudence absolue devenait la panne.
         *   ⇒ LA BONNE REPONSE N EST PAS DE SAUTER EN SILENCE, C EST DE SAUTER EN L ECRIVANT.
         *     On reessaie la MEME fenetre deux fois ; a la troisieme on descend quand meme, et on
         *     GARDE la plage manquee dans `trousRattrapage`, que l endpoint publie. Un trou connu
         *     et nomme vaut infiniment mieux qu un index qui ne finit jamais — et infiniment mieux
         *     qu un trou invisible. */
        if (!(vieux.fenetresRatees || []).length) {
          rattrapageDepuis = bas; refusDeSuite = 0;
        } else if (++refusDeSuite >= 3) {
          trousRattrapage.push({ de: bas, a: haut, pages: (vieux.fenetresRatees || []).length });
          if (trousRattrapage.length > 200) trousRattrapage.shift();
          rattrapageDepuis = bas; refusDeSuite = 0;
          console.log('[createurs] ⛔ TROU assume ' + bas + '..' + haut + ' apres 3 refus — on descend, et on le DIT');
        }
        console.log('[createurs] rattrapage ' + bas + '..' + haut + ' · +' + aFaire.length
          + ' · index=' + createurParBlock.size + '/' + blocksConnus.size
          + (rattrapageDepuis <= PREMIER_BLOCK_TB ? ' · COMPLET' : '')
          + ((vieux.fenetresRatees || []).length ? ' · ⛔ ' + vieux.fenetresRatees.length + ' fenetre(s) refusee(s), on ne descend pas' : ''));
      }
    } catch (e) { console.log('[createurs] rattrapage interrompu : ' + e.message); }
    console.log('[trending] scan done · creations=' + (cr.creations || []).length + ' · ratees=' + (cr.fenetresRatees || []).length + ' · connus=' + blocksConnus.size);
    /* advance if any creations read OR zero ratees; partial progress beats permanent hang */
    if (!(cr.fenetresRatees || []).length || (cr.creations || []).length) blocsLusJusqua = fin;
    /* ── ⛔⛔ LES ACTIFS QU ON PROPOSE SOI-MEME EN PAIRE DOIVENT ETRE VUS ─────────────────────
     *     MESURE DU 2026-09-27, DexScreener interroge adresse par adresse sur les dix actions du
     *     registre `ACTIONS_COINBASE` : 10/10 ont une paire liquide, et 0/10 apparaissaient ici.
     *         MSTRc 4 914 070 $ de volume 24 h · METAc 3 312 309 $ · SNDKc 3 008 424 $
     *         GOOGLc 2 920 423 $ · AAPLc 2 792 105 $ · MSFTc 1 970 633 $ · NVDAc 1 765 509 $
     *     ≈ 20 M$ PAR JOUR, toutes sur Aerodrome — invisibles dans notre propre ecran.
     *   ⇒ CAUSE : `blocksConnus` ne contient que les creations B20 que NOTRE indexeur a scannees.
     *     Ces dix sont anterieures a la fenetre, donc elles n y entrent jamais. Le filtre
     *     `connus.has(adr)` de `resumerTrending` les jetait ensuite en silence — et c est un bon
     *     filtre : sans lui, n importe quel jeton renvoye par DexScreener entrerait dans la liste.
     *   ⇒ ON NE TOUCHE PAS AU FILTRE. On ajoute au jeu de reference les adresses que L APP ELLE-MEME
     *     propose en paire : elles sont ecrites dans notre registre, pas devinees sur la chaine.
     * ⛔ `Set` PUIS ETALEMENT : une adresse deja connue ne doit pas etre interrogee deux fois chez
     *   DexScreener — les lots sont de 30 et chaque doublon coute une place a un vrai block. */
    for (const p of pairesProposees(8453)) {
      if (p && p.adr && /^0xb2[0-9a-fA-F]{38}$/i.test(String(p.adr))) blocksConnus.add(String(p.adr).toLowerCase());
    }
    const adrs = [...blocksConnus], paires = [];
    /* ⛔⛔ BUG EN PROD (2026-09-19, capture de Phil) : « 0 blocks with a live market · $0 traded » et « Nothing is
     *    moving right now » — alors que 1 095 blocks etaient suivis. DexScreener n avait rien rendu, et `if (r.ok)`
     *    AVALAIT chaque refus sans le compter : un echec de lecture publie comme un marche calme. Chaque lot est
     *    maintenant compte (statut HTTP garde), un refus 429 est reessaye, et si AUCUN lot n a abouti on GARDE
     *    la derniere bonne liste au lieu de l ecraser par un vide. */
    const statuts = {};
    let lotsOk = 0, lotsKo = 0;
    for (let i = 0; i < adrs.length; i += 30) {
      let fait = false;
      for (let essai = 0; essai < 3 && !fait; essai++) {
        try {
          const r = await fetch('https://api.dexscreener.com/tokens/v1/base/' + adrs.slice(i, i + 30).join(','),
            { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } });
          statuts[r.status] = (statuts[r.status] || 0) + 1;
          if (r.ok) { const j = await r.json(); if (Array.isArray(j)) paires.push(...j); fait = true; }
          else if (r.status !== 429) break;
          else await new Promise((ok) => setTimeout(ok, 2000 * (essai + 1)));
        } catch (e) { statuts.erreur = (statuts.erreur || 0) + 1; }
      }
      if (fait) lotsOk++; else lotsKo++;
      await new Promise((ok) => setTimeout(ok, 250));
    }
    if (!lotsOk && lotsKo) {
      throw new Error('DexScreener refused all ' + lotsKo + ' reads (' + JSON.stringify(statuts) + ')');
    }
    /* ⛔⛔ LA LISTE DE L EMETTEUR, LUE ICI POUR QUE CHAQUE LIGNE PORTE SON ORIGINE. Decision de Phil
     *     du 2026-09-30 : « Biggest blocks » garde les actions tokenisees, avec l origine DITE.
     *   ⛔ Notre registre en porte 15, l emetteur en declare 40 : marquer seulement les 15
     *     laisserait GMEc, DJTc, NFLXc, AMDc, RDDTc, HTZc, PFEc… non marquees, et une ligne non
     *     marquee se lit « block lance ici ». La retombee le SIGNALE au lieu de le taire. */
    const em = await actionsEmetteurServies();
    corps = JSON.stringify({ ok: true, lu: new Date().toISOString(), blocksSuivis: adrs.length,
      fenetresRatees: (cr.fenetresRatees || []).length, lotsMarche: { ok: lotsOk, ko: lotsKo, statuts },
      emetteurEtat: em.etat, emetteurCompte: em.adresses.length,
      ...resumerTrending(paires, adrs, { max: 400, actionsEmetteur: em.adresses }) }); /* tip 0038 : tous les blocks vivants pour la map (Trade en montre 40) */
  } catch (e) {
    corps = trCache.corps || JSON.stringify({ ok: false, pourquoi: 'Trending not read: ' + String(e && e.message || e).slice(0, 80) });
  }
  trCache = { a: Date.now(), corps };
  sauverTrendingDisque();
  return corps;
}
/* tip 20260923-map-trending: kick background scan; HTTP never waits on cold lireTrending */
setTimeout(() => { void lireTrending(); }, 1500); /* always rescans on boot; HTTP stays fail-open via trending() */

const ici = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8', /* 2026-10-03 : llms.txt */
};

/* ⛔ CE QUI EST SERVI, NOMME UN PAR UN. Ajouter un fichier a l app demande de l ajouter ici — c est
 * volontairement un peu penible : la meme discipline a deja evite qu un module importe mais non
 * declare parte en production en 404 silencieux. */
/* l ordre de l entonnoir : visite -> pastille de la map -> clic Create -> cree -> vivant -> partage -> lien recu -> achat */
/* ⛔ `cree_echec` et `vie_echec` ajoutes le 2026-09-20 : sans eux, un parcours qui casse chez un
 *    visiteur se lit exactement comme un visiteur qui abandonne. On ne peut pas corriger ce qu on ne
 *    compte pas. */
/* ⛔⛔ CORRIGE LE 2026-09-23, APRES MESURE (`mesure-etapes-perdues.mjs`). Cette liste comptait 16
 *     noms. L app en appelait 48. Les 34 absents etaient JETES EN SILENCE par `/api/etape` : le
 *     serveur teste `includes(e)` et, si le nom manque, il ne compte rien et ne dit rien.
 *     ⇒ Tout l entonnoir d ACHAT (`achat_prepare`, `achat_ok`), toute la connexion de wallet
 *       (`wallet_connect_ok/refus`, `wallet_no_provider`), tout le Bridge et le clic « Fund wallet »
 *       affichaient 0. Et un 0 aveugle se lit exactement comme un 0 sincere : « personne n a fait
 *       ca ». C est la question que Phil pose depuis des jours — ou perd-on les gens — repondue
 *       par un instrument qui ne regardait pas.
 * ⛔ GARDE : `test-etapes-comptees.mjs` echoue si l app appelle un nom absent d ici. Sans elle,
 *   la liste redivergera au prochain bouton ajoute — c est exactement comme ca qu on en est arrive
 *   a 34. Une liste blanche sans garde n est pas une liste blanche, c est un souvenir. */
const ETAPES_ENTONNOIR = [
  'visite', 'map_cta', 'create_clic',
  'groupe_propose', 'groupe_ok', 'groupe_refus', 'groupe_echec',
  'cree', 'cree_echec', 'vivant', 'vie_echec',
  'premier_propose', 'premier_prepare', 'partage', 'lien_recu', 'achat',
  /* connexion du wallet — l entree de tout le reste, jamais comptee jusqu ici */
  'wallet_connect_ok', 'wallet_connect_refus', 'wallet_no_provider',
  /* ⛔⛔ LA CAPACITE DE GROUPEMENT, MESUREE A LA CONNEXION — ajoutee le 2026-09-28 parce que
   *     `groupe_propose` valait ZERO sur 354 visites. Ce zero n etait PAS « aucun wallet ne sait
   *     grouper » : l evenement n est emis que dans Instant Birth, derriere un preflight de solde et
   *     une simulation. Un compteur place derriere la porte la plus etroite rend un zero qui
   *     ressemble a un fait de marche.
   *   ⛔ TROIS ETATS ET PAS DEUX : `_non` est une REPONSE du wallet, `_illisible` est NOTRE
   *     aveuglement (delai, provider muet, appel qui jette). Les additionner ferait passer nos
   *     pannes pour un verdict, et on reparerait la mauvaise chose.
   *   ⇒ Ces trois compteurs decident si echanger un block contre une action exige un CONTRAT ou si
   *     un lot atomique suffit. Sans denominateur, cette question n a pas de reponse honnete. */
  'capacite_lot_oui', 'capacite_lot_non', 'capacite_lot_illisible',
  'chain_switch_ok', 'chain_switch_refus', 'pairer_clic',
  /* creation */
  'create_sign_propos', 'create_sign_refus', 'create_fund_bridge', 'create_go_bridge',
  'ib_preflight_ok', 'ib_preflight_fail', 'ib_balance_short',
  /* ⛔⛔ POURQUOI une creation echoue — mesure du 2026-09-23 : `cree` = 6, `cree_echec` = 8, et
   *     aucun moyen de savoir si ces 8 sont des refus polis dans le wallet ou des transactions qui
   *     revertent en brulant du gas. Les deux appellent des reponses OPPOSEES. Categories fermees
   *     produites par `causes-echec.js` ; `test-causes-echec.mjs` echoue si l une manque ici. */
  'cree_ko_refus', 'cree_ko_revert', 'cree_ko_envoi', 'cree_ko_reseau',
  'cree_ko_compte', 'cree_ko_attente',
  /* ⛔⛔ `cree_ko_partiel` — ajoute le 2026-10-01 avec la cause `partiel`. C est le lot dont UNE
   *   PARTIE seulement a ete appliquee : la personne detient un actif intermediaire qu elle n a pas
   *   demande. S il monte, ce n est pas un bug de notre code mais un wallet qui a casse son propre
   *   lot — et c est le seul compteur qui le dirait. Le noyer dans `cree_ko_revert` ferait chercher
   *   un revert qui n a pas eu lieu. */
  'cree_ko_partiel', 'cree_ko_autre',
  /* ⛔⛔ CE QUE NOUS REFUSONS AVANT MEME D ESSAYER — mesure du 2026-09-25 : `create_clic` = 45,
   *     `cree` = 6, `cree_echec` = 8. TRENTE-UN clics sans aucune trace. Or trois des sorties
   *     precoces de `creerBlock()` sont des refus que NOUS produisons : formulaire incomplet,
   *     create gratuit retire sur Base, un block encore a lancer. Un refus qu on s inflige sans le
   *     compter ressemble a « personne n a essaye » alors qu il veut dire « on a dit non ».
   *   ⛔ `cree_refus_*` et `cree_ko_*` ne disent PAS la meme chose : refuser avant d essayer et
   *     echouer en essayant ne se reparent pas de la meme facon. Le prefixe les separe. */
  'cree_refus_forme', 'cree_refus_gratuit', 'cree_refus_a_lancer', 'cree_refus_encours',
  /* ⛔⛔ ET LA SONDE M A CORRIGE : j avais dit TROIS refus muets, elle en a trouve DIX-HUIT dans la
   *     version d avant. Ces quatre noms-la regroupent les treize autres par REPARATION, pas par
   *     message — quatre familles, quatre reponses differentes :
   *     · `solde`       pas assez d ETH -> la reponse est l onramp / le Bridge, pas du code ;
   *     · `lecture`     prix ou chaine illisible -> la reponse est la resilience RPC ;
   *     · `frais`       les 0,001 ETH n ont pas abouti ou ne se prouvent pas -> le plus cher : le
   *                     geste a eu lieu, le resultat non ;
   *     · `preparation` notre requete n a pas pu etre construite -> defaut CHEZ NOUS, jamais chez
   *                     le visiteur. C est la distinction qui evite de chercher au mauvais endroit. */
  'cree_refus_solde', 'cree_refus_lecture', 'cree_refus_frais', 'cree_refus_preparation', 'cree_refus_ordre_sel', 'cree_refus_presim', 'cree_refus_presim_non_mesure',
  /* achat — l etape qui rapporte */
  /* ⛔ `achat_clic` = l INTENTION (clic sur Buy dans Market) · `achat_prepare` = on a passe les
   *   gardes et on prepare vraiment. Les deux partageaient le nom `achat_prepare` jusqu au
   *   2026-09-25, ce qui additionnait les deux bouts de l entonnoir et empechait d en calculer le
   *   taux. ⚠️ Les totaux d `achat_prepare` d avant ce build melangent les deux sens. */
  'achat_clic',
  /* ⛔⛔⛔ `achat_echec` AJOUTE LE 2026-09-30, ET IL COMBLE UN TROU QUI CACHAIT DE L ARGENT. Un
   *      achat que le visiteur SIGNE et qui ECHOUE ensuite sur la chaine n etait compte NULLE PART :
   *      `achat_sign_propos` partait, puis plus rien — exactement comme s il avait ferme l onglet.
   *      Un client perdu et un frais non pris, indiscernables d un abandon.
   *    ⛔ ET CE N EST PAS UNE REDEFINITION : `achat` et `achat_ok` gardent leur sens, sinon
   *      l historique d avant deviendrait incomparable avec celui d apres. On AJOUTE une ligne. */
  'achat_echec',
  /* ⛔ SANS CETTE LIGNE, L ETAPE EST JETEE EN SILENCE. `/api/etape` rend 204 qu il accepte ou
   *   qu il refuse : un nom hors liste blanche disparait sans un mot, et on croirait que
   *   personne n emprunte le chemin alors qu on ne le compte pas. C est ce qui m est deja
   *   arrive en postant du JSON a un endpoint qui lit `?e=` — le 204 ne prouve rien.
   *   `tokeniser_jeton_lu` = un jeton existant a ete LU et Create a ete pre-rempli. Ca ne dit
   *   RIEN d une creation : la signature reste un geste separe, compte par `cree`. */
  'tokeniser_jeton_lu',
  'achat_prepare', 'achat_sign_propos', 'achat_sign_refus', 'achat_ok', 'marche_rescan_ok',
  /* ⛔ UN NOM DISTINCT, PAS UN NOM RECYCLE. `marche_rescan_ok` est la relecture d UN block depuis sa
   *   fiche ; `stades_relire` est le rattrapage EN LOT depuis le panneau des paliers. Les fondre
   *   aurait reproduit le defaut que je venais de nommer le 2026-09-26 : `wallet_no_provider` porte
   *   un seul nom pour neuf chemins, et on ne peut donc pas dire lequel a ete tape 25 fois. */
  'stades_relire',
  /* ⛔⛔ LES DEUX PORTES DE SORTIE POUR UN NAVIGATEUR SANS WALLET. Mesure du 2026-09-26 : sur les
   *     trois jours pleins ou le compteur existe, 55 sessions, 29 `wallet_no_provider` et
   *     `wallet_connect_ok` = ZERO. Deux noms distincts, pas un : on veut savoir laquelle sert.
   *   ⚠️ UN CLIC N EST PAS UNE CONNEXION. Ces deux-la diront qu on a tape le lien ; seul
   *     `wallet_connect_ok` qui remonte dira que la porte menait quelque part. */
  'wallet_ouvrir_cbw', 'wallet_ouvrir_mm',
  /* ⛔⛔ LA PORTE QUI NE DEMANDE RIEN D INSTALLE. `wallet_base_clic` compte la tentative,
   *     `wallet_base_ko` l echec NOMME (SDK qui ne charge pas, passkey refuse par l appareil).
   *   ⛔ LE SUCCES N A PAS DE NOM A LUI, ET C EST VOULU : il passe par `connecter()`, donc il
   *     s ecrit dans `wallet_connect_ok`. Lui donner un nom separe aurait fait deux compteurs de
   *     succes concurrents, et on aurait fini par publier le plus flatteur des deux.
   *   ⇒ LE RAPPORT QUI DECIDE : `wallet_base_clic` -> `wallet_connect_ok`. Si le premier monte et
   *     que le second reste a zero, le passkey ne sert pas et il faut chercher ailleurs. */
  /* ⛔⛔ `wallet_base_attente` EST LE PLUS IMPORTANT DES TROIS, et il n existe que parce que le banc
   *     l a montre : la fenetre de connexion bloquee par le navigateur laissait le bouton mort
   *     25 secondes. C est l echec le plus probable ET le plus muet — sans ce compteur, il se
   *     lirait comme « personne n a essaye ». */
  'wallet_base_clic', 'wallet_base_ko', 'wallet_base_attente',
  /* ⛔⛔ `wallet_base_pret` MESURE LE CORRECTIF DU MUR N°1, ET SANS LUI IL SERAIT AVEUGLE. Le SDK
   *     (822 ko) se chargeait AU CLIC, donc le geste utilisateur expirait et le navigateur bloquait
   *     la fenetre de connexion : `wallet_base_clic` = 1 avait donne `wallet_base_attente` = 1, un
   *     sur un. Il est desormais prechauffe des que le panneau « sans wallet » s affiche.
   *   ⛔ CE COMPTEUR DIT SI LE PRECHAUFFAGE ABOUTIT *AVANT* LE CLIC. Le rapport a lire est
   *     `wallet_base_pret` / `wallet_no_provider` : s il reste bas, le SDK n arrive pas a temps et
   *     le correctif n a rien change — livrer sans lui aurait ete livrer a l aveugle. */
  'wallet_base_pret',
  /* ⛔⛔ `wallet_session_reprise` MESURE LE SECOND CORRECTIF DU RETOUR FIAT. Le rail exige une
   *     adresse, donc les 8 `onramp_retour_block` etaient connectes AVANT de partir payer — mais la
   *     page recharge au retour et rien ne restaurait la session : ils revoyaient « Connect wallet »
   *     avec un wallet deja autorise sous la main. `eth_accounts` (sans popup) le rend maintenant.
   *   ⛔ SANS CE COMPTEUR LE CORRECTIF SERAIT AVEUGLE : le rapport a lire est
   *     `wallet_session_reprise` / `visite` chez les visiteurs equipes. */
  'wallet_session_reprise',
  /* ⛔⛔ LES REFUS DU CHEMIN QUI RAPPORTE — mesure du 2026-09-25, balayage des 317 fonctions de
   *     l app : `preparerEchange` etait premiere du classement des refus non comptes, et TOUS
   *     tombaient AVANT `achat_prepare`. Donc `achat_prepare` = 0 ne disait pas si personne n avait
   *     essaye ou si on avait dit non a tout le monde. Les frais viennent des trades : c est le
   *     chemin le plus cher a laisser aveugle.
   *   ⛔ PREFIXE `echange_` ET NON `achat_` : la fonction sert l achat ET la vente, avec les memes
   *     causes. Les nommer « achat » ferait mentir la moitie des lignes.
   *   ⛔ NEUF NOMS, ENSEMBLE CLOS, UNE REPARATION CHACUN — et surtout des paires qui se ressemblent
   *     a l ecran et s opposent dans la cause :
   *     · marche_illisible / pas_de_pool  lecture ratee  vs  rien a lire
   *     · prix            / pool          lecture ratee  vs  la pool a repondu « non »
   *     · frais_pool                      NOTRE refus delibere au-dela de 5 % — savoir ce qu il coute
   *     · hors_app                        le hook d une autre app refuse notre routeur. Mesure du
   *       2026-09-17 : 0 des 56 blocks du Trending achetables ici. Si celui-la domine, le defaut est
   *       dans ce QU ON AFFICHE, pas dans ce chemin.
   *     · wallet · montant · plan (fourre-tout, a ouvrir seulement s il monte) */
  'echange_refus_marche_illisible', 'echange_refus_pas_de_pool', 'echange_refus_frais_pool',
  'echange_refus_wallet', 'echange_refus_montant', 'echange_refus_hors_app',
  'echange_refus_prix', 'echange_refus_pool', 'echange_refus_plan',
  /* ⛔⛔ LE RAIL MULTI-SAUTS A SES PROPRES COMPTEURS, SEPARES DE CEUX DU CHEMIN HISTORIQUE. Les
   *     fondre melangerait deux rails qui ont deux taux, deux assembleurs et deux publics : un
   *     achat en ETH sur la pool du block, et un achat en OUSD route sur trois sauts. On ne saurait
   *     plus lequel echoue.
   *   ⛔ `echange_refus_route_multi` est le SEUL qui dise quelque chose qu aucun autre ne dit : la
   *     route existait, et une de ses jambes n a pas pu etre resolue en PoolKey. S il domine, le
   *     defaut est dans la RESOLUTION des cles, pas dans la liquidite.
   *   ⛔ ET `echange_multi_pret` EST LE SEUL COMPTEUR POSITIF DU LOT : sans lui, on ne saurait que
   *     ce qui rate. Un entonnoir qui ne compte que ses echecs ne dit pas s il sert a quelqu un. */
  'echange_refus_route_multi', 'echange_multi_refus_prix', 'echange_multi_refus_pool',
  'echange_multi_refus_plan', 'echange_multi_refus_frais', 'echange_multi_pret',
  'echange_bloc_vers_bloc', /* 2026-10-03 : vente block -> block (bloc-vers-bloc.js) */
  /* ⛔⛔ `echange_multi_sign_propos` EST LE DENOMINATEUR QUI MANQUAIT. Sans lui on saurait combien
   *   de franchissements ABOUTISSENT, jamais combien ont ete PROPOSES a la signature — donc jamais
   *   le taux d abandon devant le wallet. Un entonnoir sans son denominateur ne mesure rien : il
   *   compte des succes dans le vide. */
  'echange_multi_sign_propos',
  /* ⛔⛔⛔ LA PERTE N°1 DEVIENT MESURABLE. `wallet_base_pret` melangeait DEUX populations : les
   *   visiteurs sans aucun wallet, pour qui la porte passkey est LA reponse, et ceux qui ont un
   *   wallet mais ne sont pas connectes, pour qui c est la MAUVAISE. Mesure du 2026-10-01 :
   *   98 `wallet_base_pret` pour 43 `wallet_no_provider` — le panneau s affiche deux fois plus
   *   souvent qu il n y a de visiteurs sans wallet.
   *   ⇒ Sans separation, « 98 fois prete, 1 clic » se lit comme un echec de l affordance alors
   *     qu on ignore combien de ces 98 etaient dans le groupe ou elle a un sens. Un numerateur
   *     sans son denominateur ne juge rien.
   *   ⛔ `wallet_base_pret` et `wallet_base_clic` RESTENT : ce sont les series historiques, et les
   *     casser rendrait incomparable tout ce qui precede. On AJOUTE. */
  'wallet_porte_sans', 'wallet_porte_deco',
  'wallet_base_clic_sans', 'wallet_base_clic_deco',
  /* ⛔⛔ LES DEUX GARDES QUI SE TIENNENT ENTRE UN TRADE ET NOTRE REVENU. Elles refusent d offrir Sign
   *     quand les 0,5 % vers FEE_WALLET manquent — le bon choix, mais un echange qui n a pas eu lieu
   *     ne se voyait NULLE PART. Ces deux compteurs disent combien ce garde-fou nous coute, et s il
   *     se declenche a tort.
   *   ⛔ DEUX NOMS POUR UNE MEME PHRASE A L ECRAN : `resume` = le recapitulatif du plan ne porte pas
   *     les 0,5 % ou le mauvais destinataire ; `calldata` = le resume le disait mais les OCTETS ne
   *     nomment pas FEE_WALLET. Un resume n est pas une preuve, seul le calldata part sur la chaine. */
  'echange_refus_frais_resume', 'echange_refus_frais_calldata',
  /* bridge et frais */
  'bridge_create', 'bridge_confirm_stub', 'bridge_fund_wallet',
  'bridge_fee_sign', 'bridge_fee_ok', 'bridge_fee_refuse', 'bridge_fee_fail',
  /* sortie d un block par sa propre pool — les refus AVANT signature, pour savoir ou ca bloque */
  'bridge_swap_sans_block', 'bridge_swap_montant', 'bridge_swap_ko', 'bridge_swap_approbations',
  /* « Tokenize a post » lance depuis la fiche d un block — mesure si ce bouton amene des creations */
  'tokenx_depuis_profil',
  /* le composeur de l onglet Post : mesure si preparer un message amene vraiment des gens a publier */
  'tokenx_composer',
  'bridge_fee_err', 'bridge_fee_plan_ko', 'bridge_fee_need_wallet', 'bridge_fee_wrong_chain',
  /* rail fiat -> Base */
  'onramp_session_ok', 'onramp_session_repli',
  /* ⛔ `onramp_retour_block` AJOUTE LE 2026-09-27, ET C EST LA SUITE DE TESTS QUI L A EXIGE, pas
   *   moi : une etape appelee par l app et absente de cette liste est JETEE EN SILENCE par
   *   /api/etape et affiche 0 pour toujours — un zero qui ne peut pas monter, donc indiscernable
   *   d un zero de succes. C est l etape qui mesure la SECONDE jambe du rail fiat : combien de
   *   personnes reviennent effectivement sur le block d ou elles etaient parties. */
  'onramp_retour_block',
  /* ⛔⛔ OU MEURT LA MISE EN VIE. `cree`=6 / `vivant`=2 en production, et `vie_echec` ABSENT des
   *     totaux : les quatre blocks perdus sortaient par 19 portes qui ne comptaient rien. On compte
   *     desormais l ETAPE ATTEINTE — mourir a l etape 2 (les approbations) n appelle pas la meme
   *     reparation que mourir a l etape 1 (la lecture du marche). Cardinalite fermee : 4 valeurs. */
  'vie_ko_etape1', 'vie_ko_etape2', 'vie_ko_etape3', 'vie_ko_etape4',
  /* brain */
  'brain_bot_propose', 'brain_bot_journal', 'brain_bot_pay_recog',
  /* ⛔⛔ D OU VIENNENT LES VISITES — le trou le plus gros de l app, mesure le 2026-09-29 : 384
   *     visites en 11 jours et AUCUNE trace de leur origine. Ni `Referer` ici, ni
   *     `document.referrer` dans la page, ni `utm_`, rien dans les logs. Consequence : le taux
   *     clic/visite est tombe de 16,73 % a 0,87 % et il a ete IMPOSSIBLE de dire si c etait une
   *     regression du bouton ou la fin de nos propres tests. Optimiser un entonnoir sans savoir qui
   *     on y met, c est tirer a l aveugle.
   *   ⛔ CATEGORIES FERMEES, PRODUITES PAR `source-visite.js`, jamais un hote ni une URL : un
   *     referrer porte des chemins et des parametres, donc potentiellement un identifiant. On ne
   *     garde que ce qui sert la decision. `test-source-visite.mjs` echoue si les deux listes
   *     divergent — un nom absent d ici serait jete EN SILENCE et vaudrait 0 pour toujours.
   *   ⚠️ `src_direct` veut dire « aucun referrer LU », PAS « la personne a tape l adresse » :
   *     copie-coller, app mobile, messagerie, `rel=noreferrer` et navigation privee le vident tous. */
  'src_direct', 'src_x', 'src_farcaster', 'src_telegram', 'src_discord', 'src_reddit',
  'src_recherche', 'src_github', 'src_base', 'src_interne', 'src_autre',
  /* ⛔⛔ LES GESTES D ENVOI — Phil, 2026-09-30 : « le send frag, c est ce qui se fait le plus sur
   *     notre app ». Le « send frag » est le GM, un VRAI transfert d un fragment de block. Or au
   *     moment ou il l a dit, RIEN ne le comptait : aucun nom d envoi dans cette liste, aucune des
   *     36 etapes actives. « Ce qui se fait le plus » etait donc une croyance, pas une mesure —
   *     comme « zero achat » l etait avant qu on instrumente le chemin d achat, ou il s est avere
   *     qu il y avait eu 2 achats reels.
   *   ⛔ LES TROIS GESTES PARTAGENT LE MEME PANNEAU, d ou trois `*_clic` distincts : sans eux on
   *     saurait qu il y a des envois, pas lequel domine — donc rien d actionnable. Les ISSUES sont
   *     partagees (`envoi_*`) parce que le code d envoi, lui, est le meme.
   *   ⛔ Produits par `geste-envoi.js` ; `test-geste-envoi.mjs` echoue si les deux listes divergent. */
  'gm_clic', 'gm_refus_wallet', 'gm_refus_solde',
  'message_clic', 'message_refus_wallet', 'message_refus_solde',
  'envoi_clic', 'envoi_refus_wallet', 'envoi_refus_solde',
  'envoi_sign_propos', 'envoi_ok', 'envoi_sign_refus',
];
/* ⛔ PERSISTANT (Phil, 2026-09-19 : « oui cree le volume ») : mesure — les compteurs repartaient de zero a CHAQUE deploiement
 *    (10 deploiements ce jour-la : aucun chiffre ne survivait). Volume Railway monte sur /data : lu au demarrage, ecrit
 *    au plus toutes les 30 s (fichier temporaire puis renommage : un arret brutal ne laisse jamais un JSON coupe).
 *    Sans volume (local, ou volume absent), on retombe sur la memoire, et /api/entonnoir le DIT (persistant:false). */
const FICHIER_ENTONNOIR = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'entonnoir.json') : null;
const entonnoir = (() => {
  try {
    if (FICHIER_ENTONNOIR && existsSync(FICHIER_ENTONNOIR)) {
      const x = JSON.parse(readFileSync(FICHIER_ENTONNOIR, 'utf8'));
      /* ⛔ LES SEAUX INTERNES PEUVENT MANQUER dans un fichier ecrit avant le 2026-09-30 : on les
       *   AJOUTE sans toucher au reste. Refuser le fichier ferait repartir `depuis` a zero et on
       *   perdrait onze jours de mesure pour deux cles absentes. */
      if (x && x.total && x.parJour) {
        x.interne = x.interne || {};
        x.interneParJour = x.interneParJour || {};
        return x;
      }
    }
  } catch (e) { console.log('[entonnoir] fichier illisible, on repart de zero :', e.message); }
  return { depuis: new Date().toISOString(), total: {}, parJour: {}, interne: {}, interneParJour: {} };
})();
/* premiere ecriture des le demarrage : sinon, sans etape comptee, aucun fichier n existe et « depuis » repart a chaque deploiement */
let entonnoirSale = !!FICHIER_ENTONNOIR && !existsSync(FICHIER_ENTONNOIR);
setInterval(() => {
  if (!entonnoirSale || !FICHIER_ENTONNOIR) return;
  try { writeFileSync(FICHIER_ENTONNOIR + '.tmp', JSON.stringify(entonnoir)); renameSync(FICHIER_ENTONNOIR + '.tmp', FICHIER_ENTONNOIR); entonnoirSale = false; }
  catch (e) { console.log('[entonnoir] ecriture ratee :', e.message); }
}, 30000).unref();

const SERVIS = [
  /* ⛔⛔ LE MANIFESTE FARCASTER ETAIT ABSENT DE CETTE LISTE (releve par Zero 1 depuis un terminal,
   *     2026-09-21). Le fichier EXISTAIT sur le disque depuis le 8 septembre ; il n a simplement
   *     jamais ete servi. Resultat : l app declarait `fc:miniapp` et `fc:frame` dans son HTML — donc
   *     elle se presentait a Farcaster comme une Mini App — et rendait 404 quand Farcaster venait
   *     verifier. Un fichier qui existe et qu on ne sert pas n existe pas.
   * ⛔ ET SON CONTENU POINTAIT AILLEURS : toutes ses URL visaient tokenized-block.github.io,
   *    l ancien host, qui redirige. Meme servi, il aurait envoye les visiteurs dans le vide.
   * ⛔ C EST UN DEFAUT DE DECOUVRABILITE, et c est exactement le probleme qu on mesure par ailleurs :
   *    0 de nos 8 blocks connus de l index public. Un canal ferme de plus. */
  '.well-known/farcaster.json',
  'app.html', 'index.html', 'block-0.html', 'lien-x.html', 'deploy-v2.html', 'deploy-v2.json', 'deploy-v3.html', 'deploy-v3.json', 'deploy-v4.html', 'deploy-v4.json', 'deploy-v5.html', 'deploy-v5.json', 'deploy-v6.html', 'deploy-v6.json', 'deploy-v7.html', 'deploy-v7.json', 'deploy-v8.html', 'deploy-v8.json', 'deploy-pot.html', 'deploy-pot.json', 'pot.html', 'boucle-pot.js', 'keeper-pot.js', 'regle-snapshot.js', 'soldes-jeton.js', 'parts-holders.js', 'merkle-pot.js', 'reclamer.html', 'reclamation.js', 'veille-pot.js', 'veille-frais.js', 'comparer-frais.js', 'frais.html',
  'motifs-noto.js', 'photo.js', 'retirer-fond.js', 'apparence.js', 'classement.js', 'consentement.js', 'criblage.js', 'encodeur.js',
  'index-blocks.js', 'keccak.js', 'lancement.js', 'lecteur.js', 'lien-x.js', 'marche.js',
  'montants.js', 'motssimples.js', 'photo.js', 'pointsdevie.js', 'pool.js', 'vitalite.js',
  'visage.js', 'logo.js', 'faits.js', 'envoi.js', 'cerveau.js', 'metiers.js', 'frais-creation.js', 'prix-eth.js', 'messages.js', 'paires.js', 'face.js', 'lancer-pool.js', 'nourriture.js', 'apercu.js', 'mes-blocks.js', 'tokenized-bank.js', 'bridge.js', 'x402-pay.js', 'fil-live.js', 'achats.js', 'tokenomics.js', 'lancer-pool-v2.js', 'memoire-chaine.js', 'resume-tx.js', 'origine.js', 'echange.js', 'journal-cerveau.js', 'cerveau-echange.js', 'tweet-grave.js', 'liquidite.js', 'regles-cerveau.js', 'fragments-cerveau.js', 'parole-cerveaux.js', 'export-cerveau.js', 'brain-tasks.js', 'stades.js', 'pools-du-jeton.js', 'messagerie-blocks.js', 'relais-cerveaux.js', 'pnl-swaps.js', 'openlaunch.js', 'openlaunch-launch.js', 'map3d.js', 'trending.js', 'locker.js', 'tirage.js', 'cube3d.js', 'groupe-wallet.js', 'causes-echec.js', 'verif-paiement.js', 'source-visite.js', 'choix-de-pool.js', 'pool-sans-hook.js', 'index-routeur.js', 'jetons-nes-launchpads.js', 'multiplicateur-action.js', 'geste-envoi.js', 'frais-du-geste.js',
  /* ⛔ AJOUTE LE 2026-09-26 — et c est `test-imports-servis` qui l a EXIGE, pas moi : un module
   *   importe par `app.html` et absent de cette liste rend la page MORTE en production, sans que
   *   rien d autre ne le dise. La garde a crie avant le deploiement. */
  'heures-marche.js',
  /* ⛔ 2026-10-02 : debit et refus permanents des noeuds RPC publics, importe par `app.html`. */
  'regulateur-rpc.js',
  /* ⛔ 2026-10-02 : les lignes groupees du Feed se deplient, leurs notes se lisent depuis leurs tx. */
  'notes-du-fil.js',
  /* ⛔ `pool-cl.js` LIT LES POOLS AERODROME CL (et tout fork Uniswap v3) — la ou `pool.js` ne sait
   *   que le v4. Ses deux dependances (`keccak.js`, `pool.js`) sont deja servies plus haut ; la
   *   garde ci-dessous ne relit QUE les imports DIRECTS de `app.html`, donc elle ne dirait rien
   *   d un manque transitif. C est ici qu il faut le declarer, et nulle part ailleurs. */
  'pool-cl.js',
  /* ⛔ `voix-block.js` : la voix choisie par le createur (importe par parole-cerveaux.js, donc par la page). */
  'voix-block.js',
  /* ⛔ `routage.js` CLASSE POURQUOI UN MARCHE N EST PAS ECHANGEABLE ICI. Il n a AUCUNE dependance,
   *   donc rien d autre a declarer — mais l oublier ici rendrait la page MORTE, et c est bien la
   *   garde ci-dessous qui l a crie avant ce deploiement, pas ma relecture. */
  'routage.js',
  /* ⛔⛔ `actions-emetteur.js` PORTE LE LIBELLE « issued by Coinbase » DE LA PAGE, et il est importe
   *     PAR LE SERVEUR AUSSI (qui lit la liste des 40 et marque chaque ligne de trending). Le
   *     libelle est ecrit UNE fois et importe des deux cotes : deux copies d une phrase visible
   *     divergent, et c est alors l ecran qui mentira, pas le serveur.
   *   ⛔ L OUBLIER ICI REND LA PAGE MORTE — un import 404 arrete tout le module. */
  'actions-emetteur.js',
  /* ⛔⛔⛔ `espacements-cl.js` EST DEVENU UN MODULE DU NAVIGATEUR LE 2026-09-30 : `echange-eth.js`
   *      l importe pour balayer les NEUF espacements de la factory en cherchant la pool du block.
   *      Il n etait que cote serveur jusque-la, et l oublier ici aurait rendu la page MORTE en
   *      production — un import 404 arrete tout le module, silencieusement.
   *    ⇒ C est `test-imports-servis.mjs` qui l a crie, pas ma relecture. La garde a paye. */
  'espacements-cl.js',
  /* ⛔ `tokeniser-un-jeton.js` porte le refus de sosie et le frais FAIL-CLOSED du chemin
   *   « make a block from an existing token ». L oublier ici ne casserait pas ce champ :
   *   ca tuerait TOUTE la page, puisqu un import 404 arrete le module entier. */
  'tokeniser-un-jeton.js',
  /* ⛔ `profondeur-logs.js` decide vers quel noeud part une lecture d historique profond.
   *   L oublier ici tuerait TOUTE la page : un import 404 arrete le module entier. */
  'profondeur-logs.js',
  /* ⛔ `texte-onchain.js` decode les noms et symboles ecrits par n importe qui. L oublier ici
   *   tuerait TOUTE la page — et c est `test-imports-servis.mjs` qui l a crie, pas ma relecture :
   *   troisieme fois que cette garde paie. */
  'texte-onchain.js',
  /* ⛔ `blocks-a-lancer.js` decide si un block deja cree bloque encore la creation suivante.
   *   L oublier ici tuerait TOUTE la page — un import 404 arrete le module entier. */
  'blocks-a-lancer.js',
  /* ⛔ `symbole-trompeur.js` marque les tickers qui se lisent comme une devise. L oublier ici
   *   tuerait TOUTE la page — un import 404 arrete le module entier. */
  'symbole-trompeur.js',
  /* ⛔ `place-sur-la-map.js` decide qui entre sur la map quand elle est pleine — et donc aussi
   *   qui a un cerveau, puisque le selecteur du Brain se construit sur les memes habitants.
   *   L oublier ici tuerait TOUTE la page : un import 404 arrete le module entier. */
  'place-sur-la-map.js',
  /* ⛔ `cobalt.js` porte la frontiere MESUREE du hardfork (bloc 52 000 927) et le REFUS d afficher
   *   un equivalent en actions quand `multiplier()` et `uiMultiplier()` se contredisent. Ajoute a
   *   la liste AVANT d etre importe, deliberement : un module servi et pas encore utilise ne coute
   *   rien, alors qu un module importe et pas servi rend un 404 qui arrete le module ENTIER —
   *   c est-a-dire toute la page. L ordre « servir d abord, cabler ensuite » est le seul sur. */
  'cobalt.js',
  /* ⛔ `route-multi-factory.js` refuse une route a cheval sur deux factories — le cas ou CHAQUE
   *   jambe existe et ou l appel reverte quand meme (OUSD : 10 M$ au pair sur Uniswap V4, 0 pool
   *   Aerodrome CL). Servi AVANT d etre importe, comme `cobalt.js` : un module servi et pas encore
   *   utilise ne coute rien, un module importe et pas servi rend un 404 qui arrete toute la page. */
  'route-multi-factory.js',
  /* ⛔ `route-v4-multi-sauts.js` assemble une route V4 de 2 a 4 sauts, frais dans la devise
   *   d ENTREE. Servi AVANT d etre importe, comme les deux precedents : un module servi et pas
   *   encore utilise ne coute rien, un module importe et pas servi rend un 404 qui arrete le
   *   module ENTIER — donc toute la page. */
  'route-v4-multi-sauts.js',
  /* ⛔ `pont-de-liquidite.js` trouve le chemin entre deux jetons sur le graphe des pools MESUREES,
   *   le DECOUPE par factory (un segment = une transaction) et dit le frais TOTAL — 0,1 % PAR
   *   transaction, donc 0,2 % sur une route a deux segments. Servi avant d etre importe. */
  'pont-de-liquidite.js',
  /* ⛔⛔ `frais-degressif.js` est IMPORTE PAR `echange.js`, qui est servi : l oublier ici rendrait un
   *   404 qui arrete le module ENTIER, donc toute la page. C est `test-imports-servis.mjs` qui m a
   *   attrape — la garde a fait son travail avant le deploiement.
   *   Il porte le bareme : 0,2 % jusqu a 100 $ (p75 mesure), 0,1 % au-dela, et le PLANCHER qui
   *   empeche qu un cent de plus coute moitie moins. */
  'frais-degressif.js',
  /* ⛔ 2026-10-02 : importes par `echange.js` / `openlaunch-launch.js` / l app (part referrer o1, marche ouvert). */
  'referent-o1.js', 'lancements-etrangers.js', 'marche-ouvert.js',
  /* ⛔⛔ `devises-dentree.js` REPOND « avec quoi peut-on payer ce block ? ». Il ajoute au graphe des
   *   pools l ARETE DU BLOCK LUI-MEME — celle qui manquait, et sans laquelle `cheminEntre(OUSD,
   *   block)` rendait REFUSE non pas parce qu aucune route n existe, mais parce que personne n avait
   *   mesure l arete d arrivee. Le pont etait complet ET inatteignable depuis l ecran d echange.
   *   Il distingue SANS_ROUTE (on a REGARDE) de NON_MESUREE (on n a PAS regarde) : seule la
   *   premiere est un verdict, et confondre les deux transformerait notre incompletude en
   *   accusation. 60 assertions, ROUGE prouve par 9 mutations sur 10 — la 10e etait un temoin de
   *   non-sabotage, elle DEVAIT survivre. */
  'devises-dentree.js',
  /* ⛔⛔ `sauts-depuis-chemin.js` est le dernier pas entre « une route existe » et « on la batit » :
   *   il transforme un chemin `[{de, vers, famille}]` en sauts `[{cle, zeroForOne}]` en resolvant
   *   chaque jambe par un resolveur INJECTE. Il refuse toute la route si UN saut manque, et il dit
   *   LEQUEL — une route partielle produirait un calldata qui s arrete au milieu. 45 assertions,
   *   9/9 mutations attrapees. */
  'sauts-depuis-chemin.js',
  /* 2026-10-03 (Phil) : les sauts d un echange block -> block (importe par app.html : absent d ici = 404 = app morte) */
  'bloc-vers-bloc.js',
  'hook-7030-descripteur.js', 'deploy-7030.html', 'deploy-7030.json',
  /* 2026-10-04 : le panneau de commande (telecommande MCP) — ses modules sont ceux de l app, deja servis */
  'panel.html',
  /* 2026-10-04 : le minimum du createur, lu et rendu depuis la page du block (importe par app.html : absent d ici = 404 = app morte) */
  'caution-createur.js',
  /* 2026-10-04 : la grammaire des commandes ecrites au cerveau + les pre-commandes (importe par app.html) */
  'commandes-panel.js',
  /* 2026-10-03 : la pool Aerodrome mesuree des actions tokenisees (importee par app.html) */
  'pools-actions-aerodrome.js',
  /* 2026-10-03 : les Initialize mesures (OUSD/USDC v4) — aretes de fait de « Pay with » (importe par app.html) */
  'cles-v4-mesurees.js',
  /* 2026-10-03 : les 20 pools v4 USDC des actions tokenisees, logs bruts (importe par cles-v4-mesurees.js) */
  'cles-v4-actions.js',
  /* 2026-10-03 (Phil) : ce que les assistants IA lisent du site — faits verifiables seulement, fondateur nomme et lie */
  'llms.txt',
  /* ⛔⛔ `franchissement-depuis-chemin.js` decide la FORME d un passage a deux mondes : exactement
   *   uniswap-v4 PUIS un seul saut aerodrome. Pas « au moins deux », pas « dans n importe quel
   *   ordre » — une forme differente produirait un lot dont les approbations sont dans le mauvais
   *   ordre, et ca reverte APRES la signature, donc aux frais de l acheteur. C est le chemin des
   *   actions tokenisees, celles qui portent 96,4 % du volume. Servi avant d etre importe.
   *   43 assertions, 9/9 mutations attrapees. */
  'franchissement-depuis-chemin.js',
  /* ⛔⛔ `plan-franchissement.js` ORCHESTRE le passage complet : resoudre la pool Aerodrome (les
   *   NEUF espacements declares, jamais une valeur supposee), batir la jambe 1 en V4 avec le bareme
   *   degressif, deriver le minimum de la jambe 2 du prix spot, et assembler le lot. Il LIT, mais il
   *   ne decide rien seul : la forme, la jambe 1 et le lot viennent des modules dedies. `rpc` lui
   *   est injecte, donc il est testable hors reseau — ce qui manquait au chemin ou l audit adverse
   *   a trouve deux defauts « gravite argent ». 25 assertions, et l EXECUTION est prouvee par
   *   `banc-franchissement-ousd-action-fork.mjs` (3 appels status 0x1, a6cf paye sur les DEUX
   *   jambes au wei). */
  'plan-franchissement.js',
  /* ⛔⛔ `plan-aerodrome-segment.js` : un segment Aerodrome de bout en bout, en UNE transaction.
   *   Mesure du 2026-10-01 : depuis USDC, 236/245 marches etaient offerts mais seulement 23,1 % du
   *   VOLUME — les neuf manquants (AAPLc, METAc, GOOGLc...) portaient 76,9 %. 40 assertions,
   *   10/10 mutations attrapees. */
  'plan-aerodrome-segment.js',
  /* ⛔⛔ `porte-achat.js` DECIDE QUI A UNE PUCE D ACHAT, et il est importe PAR LE SERVEUR AUSSI
   *     (`faitsDeLaPool` reutilise son `glissementBps` plutot que d en recopier un second). Deux
   *     implementations du meme calcul divergeraient, et c est le client qui ouvre la porte.
   *   ⛔ L oublier ici rendrait la page MORTE : la garde de liste blanche l a deja crie deux fois
   *     avant un deploiement, et c est elle qui compte, pas ma relecture. */
  'porte-achat.js',
  /* ⛔ `echelle-marche.js` : le total des marches suivis ET la phrase qui dit a qui il est. L oublier
   *   ici rendrait la page MORTE — c est la garde ci-dessous qui l a crie la derniere fois. */
  'echelle-marche.js',
  /* ⛔ Les trois modules du chemin USDC -> block. Les oublier ici rendrait la page MORTE : c est la
   *   garde de liste blanche qui l a deja crie deux fois avant un deploiement. */
  /* ⛔ calldata-aerodrome.js a rejoint cette liste le 2026-09-28 : il etait deliberement NON servi
   *   tant qu il n etait pas branche, et c est la garde de graphe (test-imports-servis) qui a crie
   *   des que plan-usdc-block.js et echange-v3.js ont commence a l importer. Sans elle, la page
   *   serait MORTE en prod sur un import 404.
   * ⛔⛔ ET CE COMMENTAIRE A ETE REPARE POUR LA TROISIEME FOIS AUJOURD HUI : je l ai injecte par une
   *     chaine shell, bash a interprete les accents graves comme une substitution de commande
   *     (« calldata-aerodrome.js: command not found ») et a mange le debut de la phrase. Trois fois
   *     le meme motif, dans la meme session, en connaissant la regle. Les accents graves sont
   *     desormais retires de ce commentaire : le pire des deux serait qu ils reviennent. */
  /* ⛔ Les six modules du chemin d achat. La garde de liste blanche a crie TROIS fois avant un
   *   deploiement depuis qu ils existent — chaque fois qu un nouveau maillon est arrive. C est
   *   exactement son travail : un import 404 ne degrade pas la page, il tue le module ENTIER. */
  'echange-v3.js', 'plan-usdc-block.js', 'calldata-v3.js', 'calldata-aerodrome.js',
  'echange-eth.js', 'plan-eth-block.js',
  'abi.json', 'known-bad.json', 'A-SIGNER-mainnet.json', 'brain-agent.json',
  'icon.png', 'splash.png', 'embed.png',
];

/* ⛔ L APP NEUVE EST LA RACINE. L ancien ecran reste atteignable a son nom, mais ce n est plus lui
 * qu on montre en premier — c est la decision produit du 2026-09-10. */
const RACINE = 'app.html';

/* ETag calcule au demarrage : les fichiers ne changent pas pendant la vie du processus, et un
 * recalcul par requete ferait lire le disque pour rien. */
const cache = new Map();
for (const nom of SERVIS) {
  const chemin = join(ici, nom);
  if (!existsSync(chemin)) {
    /* ⛔ ON LE DIT AU DEMARRAGE, PAS EN 404 SILENCIEUX A MINUIT. Un fichier declare et absent est un
     * defaut de deploiement, et il doit se voir dans les journaux tout de suite. */
    console.warn('[servi] DECLARE MAIS ABSENT : ' + nom);
    continue;
  }
  const corps = readFileSync(chemin);
  const image = nom.endsWith('.png');
  /* ⛔ ON PRE-COMPRESSE UNE FOIS, AU DEMARRAGE. Les fichiers ne changent pas pendant la vie du
   *    processus — c est deja l hypothese du cache juste au-dessus — donc gzipper a chaque requete
   *    brulerait du CPU pour un resultat identique.
   * ⛔ PAS LES IMAGES : un PNG est deja compresse. Le regzipper coute du temps et rend parfois un
   *    fichier PLUS GROS, donc la condition est explicite au lieu d etre devinee.
   * ⛔ ET ON GARDE LE GZIP SEULEMENT S IL EST PLUS PETIT. Sur un fichier minuscule, l en-tete gzip
   *    depasse le gain : servir une version plus lourde en croyant optimiser serait le defaut
   *    inverse, et il passerait inapercu. */
  const gz = image ? null : gzipSync(corps, { level: 9 });
  cache.set('/' + nom, {
    corps,
    gz: gz && gz.length < corps.length ? gz : null,
    type: TYPES[nom.slice(nom.lastIndexOf('.'))] || 'application/octet-stream',
    etag: '"' + createHash('sha256').update(corps).digest('hex').slice(0, 24) + '"',
    image,
  });
}

/** Le build du fichier SERVI, lu dans son `data-build` — jamais une constante tapee a cote. */
function buildServi() {
  const e = cache.get('/' + RACINE);
  if (!e) return null;
  /* tip 20260922-eth-fixe: allow named tips e.g. 20260922-eth-fixe (not only digits). */
  /* ⛔⛔ 2026-10-04 (mesure prod, build panneau-pop-up-cerveau) : /sante rendait `build: null`. La lecture s arretait aux 200 000
   *   premiers caracteres, et le tampon etait passe au-dela (le panneau a ajoute des styles et du HTML AVANT lui). Un deploiement
   *   reussi devenait invisible : la boucle d attente ne voyait jamais son build et relancait l envoi. On lit TOUT le fichier, une
   *   fois par version servie (memo sur l entree du cache). */
  if (e.buildLu === undefined || e.buildLuSur !== e.corps) {
    const m = /data-build="([0-9A-Za-z_-]{6,40})"/.exec(e.corps.toString('utf8'));
    e.buildLu = m ? m[1] : null; e.buildLuSur = e.corps;
  }
  return e.buildLu;
}

/* ⛔⛔ INCIDENT 2026-09-17 : un deploiement fait hors git servait app.html SANS map3d.js / openlaunch.js /
 * openlaunch-launch.js (absents de SERVIS) -> 404 -> le module de l app ne se chargeait plus, map vide,
 * mais la page repondait 200 et /sante disait ok. Desormais on relit les imports de app.html au demarrage :
 * tout module importe et non servi est journalise ET fait repondre /sante ok:false avec la liste. */
const modulesManquants = [];
try {
  const html = readFileSync(join(ici, RACINE), 'utf8');
  for (const m of html.matchAll(/from\s+'\.\/([A-Za-z0-9_-]+\.m?js)'/g)) {
    if (!cache.has('/' + m[1]) && !modulesManquants.includes(m[1])) modulesManquants.push(m[1]);
  }
} catch (e) {
  modulesManquants.push('app.html illisible : ' + e.message);
}
if (modulesManquants.length) console.error('[servi] ⛔ MODULES IMPORTES MAIS NON SERVIS (app cassee) : ' + modulesManquants.join(', '));

/* ⛔⛔ XMTP VENDORISE, VERIFIE AU DEMARRAGE, FICHIER PAR FICHIER. Les fichiers viennent du CDN via
 * `vendor-xmtp.mjs` (lance avant ce serveur) ; ICI on recalcule chaque sha256 et on refuse de servir
 * tout fichier dont l empreinte differe du manifeste. Un seul fichier suspect n eteint pas l app :
 * seule la messagerie privee s arrete, et le journal le dit.
 * ⛔ UNIQUEMENT LES CHEMINS DU MANIFESTE, sous /npm/, sans `..` : pas de parcours de dossier. */
let xmtpServis = 0, xmtpRefuses = 0;
try {
  const manifeste = JSON.parse(readFileSync(join(ici, 'xmtp-manifeste.json'), 'utf8'));
  for (const [servi, attendu] of Object.entries(manifeste.fichiers || {})) {
    if (!servi.startsWith('/npm/') || servi.includes('..')) { xmtpRefuses++; continue; }
    const chemin = join(ici, 'vendor', ...servi.split('/').filter(Boolean));
    if (!existsSync(chemin)) { xmtpRefuses++; continue; }
    const corps = readFileSync(chemin);
    const empreinte = createHash('sha256').update(corps).digest('hex');
    if (empreinte !== attendu.sha256) {
      console.warn('[xmtp] EMPREINTE DIFFERENTE, non servi : ' + servi);
      xmtpRefuses++;
      continue;
    }
    cache.set(servi, {
      corps,
      type: servi.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8',
      etag: '"' + empreinte.slice(0, 24) + '"',
      image: false,
      /* ⛔⛔ VENDOR EPINGLE PAR VERSION : ces fichiers sont servis depuis `/npm/<paquet>@<version>/`
       *     et leur empreinte vient d etre verifiee juste au-dessus, fail-closed. Un cache ne peut
       *     donc pas servir autre chose que ce qu on a controle, et un changement de version change
       *     l URL. Sans ce drapeau, le SDK Base Account (822 ko) se retelechargeait a CHAQUE visite
       *     sans wallet depuis que je l ai prechauffe — une dette que j ai creee moi-meme.
       *   ⛔⛔ ET MON PREMIER MOTIF NE MATCHAIT RIEN, PARCE QUE LE PAQUET EST SCOPE. Le chemin reel
       *     est `/npm/@base-org/account@2.5.13/dist/…` : le premier segment est `@base-org`, SANS
       *     version, et la version est sur le SECOND. Un motif `[^/]+@[^/]+/` juste apres `/npm/`
       *     echouait donc, `vendorEpingle` valait faux, et tout ce correctif etait un no-op muet.
       *     Le scope est maintenant optionnel, et la version doit commencer par un CHIFFRE — sinon
       *     `@base-org/account` sans version passerait pour epingle.
       *   ⛔ VERIFIE SUR SEPT CHEMINS, DONT QUATRE NEGATIFS (`/npm/…` sans version, `/app.html`,
       *     `/routage.js`) : sans temoin negatif, un motif trop large mettrait NOS modules en cache
       *     d un an, et on reservirait du code mort pendant des mois. */
      vendorEpingle: /^\/npm\/(?:@[^/]+\/)?[^/]+@\d[^/]*\//.test(servi),
    });
    xmtpServis++;
  }
} catch (e) {
  console.warn('[xmtp] manifeste illisible — messagerie privee indisponible : ' + e.message);
}
console.log('[xmtp] ' + xmtpServis + ' fichier(s) servis, ' + xmtpRefuses + ' refuse(s)');

/* ══ APERCU D UN LIEN DE BLOCK (2026-09-19) ═══════════════════════════════════════════════════════════════════════
 * Les createurs arrivent par les liens partages (X, Farcaster). /?block=0x… rend la meme page, mais le bloc
 * <!--og:debut-->…<!--og:fin--> dit le SYMBOLE du block et montre SA face gravee (/face/0x….png) — sinon l image
 * generique : jamais une face inventee. Lecture seule, bornee a 2,5 s (un robot d apercu n attend pas), cachee. */
const apercusBlocs = new Map();
const prixUsdCache = new Map();
const htmlAttr = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function apercuBlock(adr) {
  const a = adr.toLowerCase();
  if (apercusBlocs.has(a)) return apercusBlocs.get(a);
  const borne = (p) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(null), 2500))]);
  const [f, symHex] = await Promise.all([
    borne(resoudreFace(a).catch(() => null)),
    borne(rpcServeur('eth_call', [{ to: a, data: '0x95d89b41' }, 'latest']).catch(() => null)),
  ]);
  let sym = '';
  try { const b = String(symHex || '').slice(2); const n = parseInt(b.slice(64, 128), 16); sym = Buffer.from(b.slice(128, 128 + n * 2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 12); } catch (_) { sym = ''; }
  const U = 'https://tokenizedblock.space';
  const aFace = !!(f && f.etat === 'LU' && f.face);
  const img = aFace ? U + '/face/' + a + '.png' : U + '/embed.png';
  const nom = sym ? '$' + sym : 'This block';
  const titre = nom + ' is alive on TokenizedBlock';
  const desc = 'See it on the living map. Make your own: ≈ $1, once — born with its face and brain, market open.';
  const url = U + '/?block=' + a;
  const mini = JSON.stringify({ version: '1', imageUrl: img, button: { title: ('Open ' + nom).slice(0, 32),
    action: { type: 'launch_miniapp', url, name: 'TokenizedBlock', splashImageUrl: U + '/splash.png', splashBackgroundColor: '#000000' } } });
  const tags = [
    '<link rel="canonical" href="' + htmlAttr(url) + '">',
    '<meta name="description" content="' + htmlAttr(desc) + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="TokenizedBlock">',
    '<meta property="og:title" content="' + htmlAttr(titre) + '">',
    '<meta property="og:description" content="' + htmlAttr(desc) + '">',
    '<meta property="og:url" content="' + htmlAttr(url) + '">',
    '<meta property="og:image" content="' + htmlAttr(img) + '">',
    '<meta name="twitter:card" content="' + (aFace ? 'summary' : 'summary_large_image') + '">',
    '<meta name="twitter:title" content="' + htmlAttr(titre) + '">',
    '<meta name="twitter:description" content="' + htmlAttr(desc) + '">',
    '<meta name="twitter:image" content="' + htmlAttr(img) + '">',
    '<meta name="fc:miniapp" content="' + htmlAttr(mini) + '">',
    '<meta name="fc:frame" content="' + htmlAttr(mini) + '">',
  ].join('\n');
  /* on ne cache que ce qui a ete LU : un symbole manque (RPC lent) doit pouvoir etre relu au prochain robot */
  if (sym && f) { apercusBlocs.set(a, tags); if (apercusBlocs.size > 2000) apercusBlocs.delete(apercusBlocs.keys().next().value); }
  return tags;
}

/** ⛔ `gz` dit si on envoie la version compressee. `vary: accept-encoding` est OBLIGATOIRE des
 *  qu une reponse depend de cet en-tete : sans lui, un cache intermediaire pourrait servir un corps
 *  gzip a un client qui ne l a pas demande, et celui-la ne verrait que du binaire. */
const entete = (e, gz = false) => ({
  'content-type': e.type,
  ...(gz ? { 'content-encoding': 'gzip' } : {}),
  vary: 'accept-encoding',
  etag: e.etag,
  /* ⛔ LES IMAGES PEUVENT DORMIR, LE CODE NON. Une icone qui change est un evenement rare ; un
   * module JavaScript qui change est le quotidien de ce projet, et le servir depuis un cache
   * remettrait exactement le probleme qu on vient de fuir.
   * ⛔⛔ SAUF LE VENDOR EPINGLE PAR VERSION, ET C EST UNE DETTE QUE J AI CREEE MOI-MEME LE
   *     2026-09-29. En avançant le chargement du SDK Base Account (822 ko) pour que la fenetre de
   *     connexion s ouvre dans le geste de l utilisateur, j ai transforme un telechargement paye
   *     par UNE personne en un telechargement paye par CHAQUE visiteur sans wallet — et
   *     `no-store` le refaisait a chaque visite.
   *   ⛔ POURQUOI C EST SUR ICI, ET SEULEMENT ICI : l URL contient la version exacte
   *     (`@base-org/account@2.5.13`), donc un cache NE PEUT PAS servir une autre version — un
   *     changement de version change l URL. Et l empreinte de ce bundle est verifiee au demarrage,
   *     fail-closed, avant d etre servi.
   *   ⛔ L EXCEPTION EST BORNEE AU CHEMIN `/npm/` : nos propres modules restent en `no-store`. Les
   *     elargir serait remettre le probleme qu on vient de fuir, sur le code qui change tous les
   *     jours. */
  'cache-control': e.image ? 'public, max-age=86400'
    : (e.vendorEpingle ? 'public, max-age=31536000, immutable' : 'no-store, max-age=0'),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
});

createServer((req, res) => {
  /* ⛔ Old Railway host name must never serve content — always send people to MAIN. */
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  if (host === 'tokenized-block-production.up.railway.app') {
    const raw = String(req.url || '/');
    /* droit au nom public (un seul saut, plus deux) ; /face y est servi aussi */
    const dest = 'https://tokenizedblock.space' + (raw.startsWith('/') ? raw : '/' + raw);
    res.writeHead(301, { Location: dest, 'Cache-Control': 'public, max-age=3600' });
    res.end();
    return;
  }

  const chemin = String(req.url || '/').split('?')[0];

  /* ⛔⛔ UN SEUL NOM PUBLIC (Phil, 2026-09-19) : tokenizedblock.space. Les PAGES ouvertes sur les anciens noms y sont
   *    renvoyees (301, meme chemin, meme ?block=). Les ressources NE le sont PAS : les images gravees a jamais dans les
   *    blocks pointent vers /face/<adresse>.png sur l ancien nom — elles doivent y repondre pour toujours ; /api et
   *    /sante restent aussi servis la ou on les appelle. */
  {
    const hote = String(req.headers.host || '').toLowerCase().split(':')[0];
    const ANCIENS = ['tokenized-block.up.railway.app', 'tokenized-block.app', 'www.tokenized-block.app', 'www.tokenizedblock.space'];
    const estPage = chemin === '/' || chemin.endsWith('.html');
    if (ANCIENS.includes(hote) && estPage && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(301, { Location: 'https://tokenizedblock.space' + String(req.url || '/'), 'Cache-Control': 'public, max-age=3600' });
      res.end();
      return;
    }
  }

  /* ⛔ 2026-09-14: Instant Create retired — factory createB20 unpaid on MAIN.
   * Hard 301 → /#creer (app.html free factory create; life fee at Launch → a6cf).
   * tip 2349: Create free on MAIN + Practice; fee moment = Launch. */
  if (chemin === '/index.html' || chemin === '/block-0.html') {
    res.writeHead(301, {
      Location: '/#creer',
      'Cache-Control': 'no-store, max-age=0',
    });
    res.end();
    return;
  }

  /* ══ REFERENCEMENT (2026-09-19) : robots + sitemap. Les pages privees (frais, deploy-*) ne sont pas indexees ; les
   *    anciens noms repondent deja en 301 vers tokenizedblock.space (ils transmettent leur referencement). */
  if (chemin === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' });
    res.end(['User-agent: *', 'Allow: /', 'Disallow: /frais.html', 'Disallow: /deploy-v2.html', 'Disallow: /deploy-v3.html', 'Disallow: /deploy-v4.html', 'Disallow: /deploy-v5.html', 'Disallow: /deploy-v6.html', 'Disallow: /deploy-v7.html', 'Disallow: /deploy-v8.html', 'Disallow: /deploy-pot.html', 'Disallow: /pot.html',
      'Disallow: /api/', '', 'Sitemap: https://tokenizedblock.space/sitemap.xml', ''].join('\n'));
    return;
  }
  if (chemin === '/sitemap.xml') {
    const jour = new Date().toISOString().slice(0, 10);
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' });
    res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + '  <url><loc>https://tokenizedblock.space/</loc><lastmod>' + jour + '</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>\n'
      + '</urlset>\n');
    return;
  }

  /* ══ PRIX EN DOLLARS D UNE DEVISE DE PAIRE (2026-09-19) ═══════════════════════════════════════════════════════════
   * ⛔ BUG MESURE : a la mise en vie, choisir USDC ou une action ne changeait que l exemple ; la valeur restait « 10 » —
   *    un block a 10 USDC (10 $) au lieu de ~26 000 $ en ETH, sans aucun plancher. La valeur par defaut est desormais la
   *    MEME en dollars, convertie avec ce prix. Seulement les devises de la liste V3 ; paire la plus liquide sur Base
   *    (DexScreener), au moins 10 000 $ de liquidite, sinon « non lu ». Cache 5 min. */
  /* ⛔⛔ LES BLOCKS DE N IMPORTE QUI, SANS FENETRE DE 24 HEURES.
   *     Le navigateur cherchait les creations sur 43 200 blocs — EXACTEMENT 24 h a ~2 s le bloc.
   *     Un block cree la veille disparaissait donc de « mes blocks », sur toutes les machines.
   *     Le serveur scanne les creations en continu ; il retient desormais QUI a cree, et repond ici.
   *   ⛔ LA BORNE PART AVEC LA REPONSE, TOUJOURS. `indexeDepuis` dit a partir de quand l index
   *     existe, et `couvertureComplete` dit s il a rattrape le premier block de TBLOCK. Tant que
   *     c est faux, une liste VIDE ne veut PAS dire « tu n as rien cree » — elle veut dire « pas
   *     encore indexe ». Les deux se ressemblent a l ecran et n ont rien a voir.
   *   ⛔ AUCUNE DONNEE PERSONNELLE : on rend des adresses de contrats, jamais un lien vers une
   *     identite. L adresse demandee n est ni journalisee ni conservee. */
  if (chemin === '/api/blocks-de') {
    const adr = String(new URL(req.url, 'http://x').searchParams.get('adr') || '').toLowerCase();
    const repondre = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (!/^0x[0-9a-f]{40}$/.test(adr)) { repondre({ ok: false, pourquoi: 'an address is required' }); return; }
    const blocks = [];
    for (const [jeton, createur] of createurParBlock) if (createur === adr) blocks.push(jeton);
    repondre({
      ok: true,
      lu: new Date().toISOString(),
      blocks,
      /* ⛔ CE QUE L INDEX SAIT, ET CE QU IL NE SAIT PAS — les deux, sinon le vide ment. */
      blocksIndexes: createurParBlock.size,
      blocksSuivis: blocksConnus.size,
      /* ⛔⛔ LA COUVERTURE EST CALCULEE, PAS ECRITE EN DUR. Un `false` constant serait un aveu
       *     permanent qui cesserait d informer ; un `true` en dur serait un mensonge. Elle devient
       *     vraie quand le rattrapage a atteint le PREMIER block de TBLOCK — et c est seulement a
       *     ce moment-la qu une liste vide signifie vraiment « tu n as rien cree ».
       *   ⛔ UNE SORTIE CONSTANTE N EST PAS UNE MESURE : c est la meme regle que partout ailleurs
       *     dans ce depot, et elle vaut aussi pour un booleen. */
      /* ⛔⛔ ET LA COUVERTURE EXIGE AUSSI ZERO TROU. Atteindre le premier block ne suffit PAS si on
       *     a saute des plages en chemin : on se declarerait complet avec des creations
       *     manquantes, et une liste vide redeviendrait un mensonge — le defaut meme qu on repare.
       *     Les DEUX conditions, jamais une seule. */
      couvertureComplete: rattrapageDepuis !== null && rattrapageDepuis <= PREMIER_BLOCK_TB
        && trousRattrapage.length === 0,
      rattrapageDepuis,
      /* ⛔ LES PLAGES SAUTEES SONT PUBLIEES, PAS TUES : c est ce qui rend le saut acceptable. Un
       *   trou nomme se rattrape ; un trou tu ne se rattrape jamais. */
      trous: trousRattrapage.length,
      plagesManquees: trousRattrapage.slice(-5),
      borne: 'Blocks whose creation transaction was read since this server started indexing. '
        + 'An empty list means "not indexed yet", never "you created nothing".',
    });
    return;
  }

  if (chemin === '/api/prix-usd') {
    const adr = String(new URL(req.url, 'http://x').searchParams.get('adr') || '').toLowerCase();
    /* ── ⛔⛔ LA PORTE S OUVRE AUX BLOCKS QU ON SUIT, ET A RIEN D AUTRE ──────────────────────────
     *     Le concept du produit est qu on rend N IMPORTE QUEL actif en block — donc n importe quel
     *     block doit pouvoir servir de paire. Un registre grave de 14 entrees ne peut pas porter ca :
     *     notre index suit deja ~2 000 blocks B20 decouverts SUR LA CHAINE.
     *   ⛔⛔ MAIS CET ENDPOINT RELAIE VERS DEXSCREENER, donc son filtre est une frontiere, pas une
     *       formalite. L ouvrir a une adresse arbitraire ferait de nous un proxy de prix pour
     *       n importe qui. `blocksConnus` n est PAS une entree utilisateur : c est l ensemble des
     *       creations B20 que NOTRE indexeur a lues sur la chaine. L appartenance a ce Set EST la
     *       validation — une adresse mal formee n y entre jamais (ligne 712 : regex a l insertion).
     *   ⛔ LE REGISTRE RESTE EN PREMIER : ETH, USDC, cbBTC et TOSHI ne sont pas des B20 et ne sont
     *     donc pas dans `blocksConnus`. Les deux sources sont complementaires, pas redondantes. */
    const admise = pairesProposees(8453).some((p) => ['STABLE', 'MAJEUR', 'ACTION'].includes(p.type) && p.adr.toLowerCase() === adr)
      || blocksConnus.has(adr);
    /* ⛔⛔⛔ CET ENDPOINT A ETE MUET, MESURE EN PRODUCTION LE 2026-10-01 : quatre `curl` de suite,
     *      HTTP 000 a 12 s puis 20 s, 20 s, 20 s — aucune reponse, jamais. Pas une lenteur : une
     *      ABSENCE. Et `/sante` rendait 200 pendant tout ce temps.
     *      ⇒ CONDITION : la fenetre FROIDE juste apres un deploiement. Le conteneur redemarre, le
     *        cache chaud est perdu, et le noeud RPC amont nous refuse — le serveur le DIT lui-meme
     *        sur ses voisins : `/api/cle` rendait « pool key not read: over rate limit » et
     *        `/api/face` « over rate limit », a la meme seconde.
     *      ⇒ ET LA FENETRE S EST REFERMEE SEULE : ~2 minutes plus tard, 0,44 s. J avais ecrit
     *        « reproductible, donc pas du froid » — c etait FAUX, et je le laisse ecrit ici :
     *        reproductible PENDANT la fenetre n est pas permanent. La correction de ce diagnostic
     *        ne change rien au defaut, mais elle change ce qu on peut en dire.
     *      ⚠️ ET LE 0,44 s NE PROUVE PAS LE CHEMIN FROID : `prixUsdCache` garde 300 s, donc cette
     *        reussite peut n etre qu un cache hit. Ce qui est prouve, c est le MUTISME ; la guerison
     *        est constatee, pas expliquee.
     *
     * ⛔⛔ LA CAUSE, ELLE, EST STRUCTURELLE. Le `fetch` DexScreener est borne
     *   (`AbortSignal.timeout(8000)`), mais la reponse n est envoyee qu A L INTERIEUR du `.then` de
     *   `faitsDeLaPool` puis de `alternativeAerodrome` — deux lectures ON-CHAIN sans aucune borne.
     *   Le prix, deja acquis en moins de 8 s, etait retenu en otage par son ENRICHISSEMENT.
     *   Ce fichier ecrit pourtant, vingt lignes plus bas : « LE PRIX EST UN FAIT, LA PORTE EST UNE
     *   POLITIQUE ». La mecanique disait le contraire : pas de politique, pas de fait.
     *   ⇒ C est le jumeau FAIBLE de `/api/trending`, qui porte « NEVER hang HTTP on cold scan » et
     *     rend un placeholder. Meme serveur, meme froid, une porte gardee et l autre pas.
     *
     * ⛔⛔ `repondu` : LA REPONSE EST A UN SEUL COUP, et ce verrou est la CONDITION pour poser une
     *   borne. Sans lui, la borne repond, puis l enrichissement se reveille et repond a son tour :
     *   Node leve `Cannot set headers after they are sent`. Une garde qui transforme un mutisme en
     *   crash n aurait rien repare — elle aurait change la FORME de la panne.
     *   ⚠️ CE HELPER EST RECOPIE A L IDENTIQUE DANS DEUX AUTRES HANDLERS (`/api/blocks-de`,
     *     `/api/parts-createur`), qui n ont PAS ce verrou. Mesure du jour : les deux repondent en
     *     0,32 s et 0,53 s, donc je n ai PAS de mutisme a leur reprocher et je ne les touche pas
     *     sur une symetrie. Nomme ici pour que le prochain qui pose une borne ailleurs sache
     *     qu il lui faut d abord ce verrou. */
    let repondu = false, borneFaits = null;
    const repondre = (o) => {
      if (repondu) return;
      repondu = true;
      /* ⛔ LE MINUTEUR SE DESARME ICI, PARCE QUE C EST LA SEULE SORTIE. Le desarmer dans chaque
       *   branche serait cinq endroits a ne pas oublier ; ici c est un seul, et il est sur le
       *   chemin de TOUTES. Un `setTimeout` laisse pendant retient le handler pour rien. */
      if (borneFaits) { clearTimeout(borneFaits); borneFaits = null; }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o));
    };
    if (!admise) { repondre({ ok: false, pourquoi: 'not a pair currency of this app' }); return; }
    const c = prixUsdCache.get(adr);
    if (c && Date.now() - c.t < 300000) { repondre(c.r); return; }
    fetch('https://api.dexscreener.com/tokens/v1/base/' + adr, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } })
      .then((x) => (x.ok ? x.json() : Promise.reject(new Error('HTTP ' + x.status))))
      .then((j) => {
        const p = (Array.isArray(j) ? j : []).filter((x) => String(x.baseToken && x.baseToken.address).toLowerCase() === adr)
          .sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))[0];
        const prix = p ? Number(p.priceUsd) : NaN, liq = p && p.liquidity ? Number(p.liquidity.usd) : 0;
        /* ── ⛔⛔ LE SEUIL DE TVL N EST PLUS LA PORTE, ET UNE MESURE L A DECIDE ─────────────────
         *     Il valait `liq >= 10000`. Mesure du 2026-09-28 en lisant `liquidity()` AU TICK
         *     COURANT : il ADMETTAIT BEc (TVL 10 072 $, 385 bps de glissement sur un achat de
         *     100 USDC) et REFUSAIT MUc (TVL 9 728 $, 8 bps) — quarante-huit fois mieux. En
         *     liquidite concentree, toute la liquidite peut etre LOIN du prix courant : la TVL ne
         *     dit pas le glissement, et le classement s inverse. La garde etait VRAIE et son
         *     critere le mauvais.
         *   ⛔ CE QUI RESTE ICI EST UN PLANCHER DE BRUIT, pas une politique : il ecarte les pools
         *     de poussiere avant qu on ne paie des lectures on-chain pour elles. La vraie porte
         *     est `porte-achat.js`, cote client, sur le GLISSEMENT — et elle ne peut pas vivre ici
         *     parce que cet endpoint sert AUSSI a convertir des FDV : y refuser un prix legitime
         *     casserait `valoDefautEnDevise`. LE PRIX EST UN FAIT, LA PORTE EST UNE POLITIQUE.
         *   ⛔ LES FAITS AJOUTES (`glissementBps`, `famille`) SONT LUS SUR LA CHAINE, et `famille`
         *     vient d un ALLER-RETOUR sur la factory Aerodrome, jamais du `dexId` de l agregateur :
         *     un nom rendu par un tiers n est pas une preuve de provenance. */
        const PLANCHER_DE_BRUIT_USD = 1000;
        if (!(prix > 0 && Number.isFinite(prix) && liq >= PLANCHER_DE_BRUIT_USD)) {
          repondre({ ok: false, pourquoi: 'no market above the ' + PLANCHER_DE_BRUIT_USD + ' USD noise floor' });
          return;
        }
        const r = { ok: true, prixUsd: prix, liquiditeUsd: liq, source: 'dexscreener', lu: new Date().toISOString() };
        /* ⛔⛔⛔ LA BORNE QUI EMPECHE LE MUTISME. A partir d ici le PRIX est acquis ; tout ce qui
         *      suit est de l ENRICHISSEMENT on-chain, et c est lui qui pouvait ne jamais rendre.
         *      Passe ce delai, on envoie le prix SANS les faits.
         *   ⛔ LA CHARGE EST EXACTEMENT CELLE DE LA BRANCHE `.catch` DEJA ECRITE PLUS BAS
         *     (`glissementBps: null`, `famille: 'NON_MESURE'`). Je n invente aucune semantique :
         *     un enrichissement qui expire est un enrichissement qui a echoue, et le client sait
         *     deja lire cet etat — `porte-achat.js` ne doit JAMAIS lire « non mesure » comme
         *     « bon marche », et c est deja sa regle.
         *   ⛔ `pourquoiFaits` DIT LA BORNE ET SA VALEUR, pas « unknown » : sans le delai dans la
         *     phrase, on ne saurait pas, en lisant un journal, si la lecture a echoue ou si c est
         *     NOUS qui avons coupe. Un chiffre absent de son propre message rend le message muet.
         *   ⛔ ET RIEN N EST MIS EN CACHE SUR CE CHEMIN : le code en aval ne cache que si
         *     `typeof f.glissementBps === 'number'`, donc la borne ne peut pas figer notre
         *     aveuglement pendant cinq minutes. C etait deja la bonne regle ; elle couvre ce cas.
         *   ⚠️ CE QUE LA BORNE NE FAIT PAS : elle n ANNULE pas la lecture on-chain, elle cesse de
         *     l attendre. Si elle aboutit apres coup, son resultat remplira le cache disque par le
         *     chemin normal et servira la requete SUIVANTE. Rien n est jete.
         *   ⛔ 6 s, ET PAS 8 : la borne doit rester SOUS celle de DexScreener (8 000 ms), sinon le
         *     pire des cas additionne les deux et depasse ce qu un navigateur attend sans broncher. */
        const BORNE_FAITS_MS = 6000;
        borneFaits = setTimeout(() => repondre({ ...r, glissementBps: null, famille: 'NON_MESURE',
          pourquoiFaits: 'pool facts not read within ' + BORNE_FAITS_MS + ' ms (chain read still pending); '
            + 'the price above is a measured fact, the missing ones are NOT a verdict' }), BORNE_FAITS_MS);
        /* ⛔ LES DEUX COTES DE LA PAIRE SONT PASSES, parce que la branche V4 en a besoin : depuis un
         *   `poolId` (un hash) on ne peut pas retrouver `currency0`, et sans lui le sens du
         *   glissement serait devine. Ils ne servent QU A cette lecture ; la famille, elle, reste
         *   prouvee par la chaine (`getSlot0` rend un prix non nul) et jamais par le `dexId`. */
        void faitsDeLaPool(p && p.pairAddress, {
          base: p && p.baseToken && p.baseToken.address,
          quote: p && p.quoteToken && p.quoteToken.address,
        }).then(async (f) => {
          /* ⛔ TROIS ETATS : une pool illisible rend `glissementBps: null` et
           *   `famille: 'NON_MESURE'`. Le client ne doit JAMAIS lire « non mesure » comme
           *   « bon marche ». */
          /* ⛔⛔ ET SI LA POOL SERVIE N EST PAS SUR AERODROME, ON CHERCHE CELLE QUI PORTE NOTRE
           *     FRAIS — sans rien decider. Le client compare les deux glissements et ne devie que
           *     si le surcout reste sous le frais (`choix-de-pool.js`). Rendre une alternative
           *     n est PAS la recommander : c est un chiffre de plus, pas une route choisie.
           *   ⛔ UNE ERREUR ICI NE DOIT PAS TUER LA REPONSE DE PRIX : le prix est un fait utile
           *     meme sans alternative. On la marque NON_MESURE et on continue. */
          let alt = null;
          try { alt = await alternativeAerodrome(adr, f.famille); }
          catch (e) { alt = { etat: 'NON_MESURE', pourquoi: 'alternative lookup failed: ' + String((e && e.message) || e).slice(0, 60) }; }
          const complet = { ...r, ...f, ...(alt ? { alternativeAerodrome: alt } : {}) };
          /* ⛔⛔ ON NE MET EN CACHE QUE CE QU ON A REELLEMENT LU. `faitsDeLaPool` se RESOUT (elle ne
           *     rejette pas) quand le RPC refuse, donc cacher sans regarder figerait un
           *     `glissementBps: null` pendant cinq minutes — et le prechauffage ne pourrait plus
           *     rien reparer. Mettre son propre aveuglement en cache est la facon la plus sure de
           *     le rendre permanent. */
          if (typeof f.glissementBps === 'number') {
            prixUsdCache.set(adr, { t: Date.now(), r: complet });
            /* ⛔ ON GARDE LA LECTURE REUSSIE SUR LE DISQUE : c est elle qui portera la porte pendant
             *   la prochaine secheresse de RPC. */
            faitsPersistes.set(adr, { glissementBps: f.glissementBps, famille: f.famille,
              pool: f.pool || null, tickSpacing: f.tickSpacing || null, t: Date.now() });
            ecrireFaitsPersistes();
            repondre({ ...complet, ageFaitsMs: 0 });
            return;
          }
          /* ⛔⛔ RIEN LU AUJOURD HUI : ON REND LE DERNIER VERDICT CONNU, AVEC SON AGE. Rendre
           *     `NON_MESURE` alors qu on a un verdict d hier sur le disque serait jeter une mesure
           *     qu on possede — et laisser la porte inerte pour rien. `pourquoiFaits` dit quand
           *     meme pourquoi la lecture du jour a echoue : on ne cache pas la panne, on ne s en
           *     sert juste pas comme d un verdict. */
          const vieux = faitsPersistes.get(adr);
          if (vieux) {
            repondre({ ...r, glissementBps: vieux.glissementBps, famille: vieux.famille,
              pool: vieux.pool, tickSpacing: vieux.tickSpacing,
              ageFaitsMs: Date.now() - Number(vieux.t || 0),
              pourquoiFaits: 'live read failed (' + String(f.pourquoiFaits || 'unknown').slice(0, 60)
                + '), serving the last verdict read' });
            return;
          }
          repondre(complet);
        }).catch(() => {
          const sansFaits = { ...r, glissementBps: null, famille: 'NON_MESURE',
            pourquoiFaits: 'pool facts not read' };
          /* ⛔ PAS DE CACHE SUR UN RESULTAT INCOMPLET : le mettre en cache figerait notre
           *   aveuglement pendant cinq minutes. */
          repondre(sansFaits);
        });
      })
      .catch((e) => repondre({ ok: false, pourquoi: 'price not read: ' + String((e && e.message) || e).slice(0, 80) }));
    return;
  }

  /* ⛔ NOS BLOCKS — global, pas personnel. La page appelait une fenetre fixe de 20 000 blocs sans
   *    cache : un block cree par nous plus de ~11 h plus tot cessait d etre « a nous » en silence.
   *    La reponse porte sa propre BORNE (depuis / jusqua / couvertureComplete). */
  /* ⛔ NE MONTRE QUE CE QU ON A VERIFIE : si la reconstruction est trouee, l etat vaut INCOMPLET et
   *    aucune part n est rendue. Afficher des parts sur des soldes faux paierait la mauvaise adresse. */
  if (chemin.startsWith('/api/holders/')) {
    const jeton = chemin.slice('/api/holders/'.length).toLowerCase();
    holdersCorps(jeton).then((corps) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(corps);
    }).catch(() => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: 'holders could not be read right now' }));
    });
    return;
  }

  /* ⛔ LE VEILLEUR, EXPOSE. Il crie sur ce que le contrat ACCEPTE : un second ancrage sur la meme
   *    periode. Le delai de contestation etant porte par la PERIODE et non par le jeton (trouvaille
   *    d audit du 2026-09-20, confirmee sous forge), tout jeton ancre plus de 6 h apres le premier
   *    n a AUCUNE fenetre. Le contrat n est pas modifiable : rendre visible est tout ce qui reste. */
  if (chemin === '/api/veille') {
    veiller({ rpc: rpcServeur, pot: '0xc743f6aAff2c4caD67C30B9e5d1aF0e913FCE272', depuis: 51571225 })
      .then((v) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        res.end(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x)));
      })
      .catch((e) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        /* ⛔ UNE VEILLE QUI ECHOUE LE DIT. « 0 alerte » sur une lecture ratee endort. */
        res.end(JSON.stringify({ ok: false, complet: false, alertes: [], pourquoi: String(e && e.message || e).slice(0, 120) }));
      });
    return;
  }

  /* ⛔ 2026-10-03 (Phil 00:20, spec Claude 00:27) : l index des blocks nes du CreateRouter (classement de ROUTAGE). */
  if (chemin === '/api/blocks-routeur') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(blocksRouteurCorps());
    return;
  }

  if (chemin === '/api/nos-blocks') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(nosBlocksCorps());
    return;
  }

  if (chemin === '/api/trending') {
    trending().then((corps) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(corps);
    });
    return;
  }

  /* ══ LE LOGO D UN BLOCK, A UNE URL (/face/0x….svg) ═════════════════════════════════════════════════
   * ⛔⛔ PHIL (2026-09-18) : « hors de l app, le block n a pas sa face — grosse erreur de design ». Mesure : la face
   *    EST deja gravee a la creation (champ image du contractURI, SVG). Mais DexScreener, les wallets et Basescan
   *    ne lisent pas le contractURI d un ERC-20 : ils demandent une URL de logo. Cette route la fournit, rendue
   *    depuis la face GRAVEE — la meme que l app dessine.
   * ⛔ SEULEMENT POUR UNE FACE GRAVEE (etat LU). Pour le token de quelqu un d autre, sans face gravee, on rend 404 :
   *    fabriquer un logo depuis son adresse, c est lui preter une identite qu il n a jamais choisie.
   * ⚠️ CE QUE CA NE FAIT PAS : l afficher automatiquement ailleurs. Il faut coller cette URL la ou chaque
   *    plateforme la demande (profil DexScreener, token list, fiche Basescan). */
  /* ══ KIT DEXSCREENER (Phil 2026-09-19 : « le block en 2D sur DexScreener ») ════════════════════════════════════════
   * Mesure (docs DexScreener) : AUCUN logo n est lu depuis la chaine ; il vient d une liste externe (CoinGecko…) ou de
   * « Enhanced Token Info », payant, commande par l equipe du token. On ne peut donc que PREPARER les images aux formats
   * demandes (logo carre, banniere 3:1). ⛔ Meme regle que /face : seulement pour une face GRAVEE, sinon 404. */
  const kit = chemin.match(/^\/face\/(0x[0-9a-fA-F]{40})\.(carre|banniere)\.png$/);
  if (kit) {
    const [, token, forme] = kit;
    Promise.all([
      resoudreFace(token),
      rpcServeur('eth_call', [{ to: token, data: '0x95d89b41' }, 'latest']).catch(() => null),
    ]).then(async ([f, symHex]) => {
      if (!f || f.etat !== 'LU' || !f.face) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end('no engraved face for this block');
        return;
      }
      let sym = '';
      try { const b = String(symHex || '').slice(2); const n = parseInt(b.slice(64, 128), 16); sym = Buffer.from(b.slice(128, 128 + n * 2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').slice(0, 12); } catch (_) { sym = ''; }
      const face = logoSvg(paramsLogoDepuisApparence(f.face, sym || '·'));
      const fond = (face.match(/<rect width="200" height="220" fill="([^"]+)"/) || [])[1] || '#0b0b14';
      const niche = (x, y, l, h) => face.replace(/^<svg /, '<svg x="' + x + '" y="' + y + '" width="' + l + '" height="' + h + '" ');
      const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const svg = forme === 'carre'
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220"><rect width="220" height="220" fill="' + fond + '"/>' + niche(10, 0, 200, 220) + '</svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
          + '<stop offset="0" stop-color="#05070f"/><stop offset="1" stop-color="' + fond + '"/></linearGradient></defs>'
          + '<rect width="1500" height="500" fill="url(#g)"/>'
          /* sans son fond carre : la face flotte sur le degrade */
          + niche(90, 40, 382, 420).replace(/<rect width="200" height="220" fill="[^"]+"\s*\/?>(<\/rect>)?/, '')
          /* le titre tient dans 880 px quelle que soit la longueur du symbole (12 caracteres max) */
          + '<text x="560" y="250" font-family="DejaVu Sans" font-size="' + Math.min(120, Math.floor(880 / (Math.max(4, (sym ? sym.length + 1 : 7)) * 0.72))) + '" font-weight="700" fill="#f2fbff">' + esc(sym ? '$' + sym : 'A block') + '</text>'
          + '<text x="564" y="325" font-family="DejaVu Sans" font-size="32" fill="#9cc3cf">a living block on Base · tokenizedblock.space</text></svg>';
      const rendre = await obtenirRasteriseur();
      const png = rendre(svg, forme === 'carre' ? 512 : 1500);
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400',
        'content-disposition': 'inline; filename="' + (sym || 'block').replace(/[^A-Za-z0-9]/g, '') + '-' + (forme === 'carre' ? 'logo-512' : 'banner-1500x500') + '.png"',
        'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' });
      res.end(Buffer.from(png));
    }).catch(() => {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('image not rendered right now');
    });
    return;
  }

  if (/^\/face\/0x[0-9a-fA-F]{40}\.png$/.test(chemin)) {
    const token = chemin.slice('/face/'.length, -'.png'.length);
    Promise.all([
      resoudreFace(token),
      rpcServeur('eth_call', [{ to: token, data: '0x95d89b41' }, 'latest']).catch(() => null),
    ]).then(async ([f, symHex]) => {
      if (!f || f.etat !== 'LU' || !f.face) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end('no engraved face for this block');
        return;
      }
      let sym = '';
      try {
        const b = String(symHex || '').slice(2);
        const n = parseInt(b.slice(64, 128), 16);
        sym = Buffer.from(b.slice(128, 128 + n * 2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').slice(0, 12);
      } catch (_) { sym = ''; }
      const rendre = await obtenirRasteriseur();
      const png = rendre(logoSvg(paramsLogoDepuisApparence(f.face, sym || '·')));
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' });
      res.end(Buffer.from(png));
    }).catch(() => {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('logo not rendered right now');
    });
    return;
  }

  if (/^\/face\/0x[0-9a-fA-F]{40}\.svg$/.test(chemin)) {
    const token = chemin.slice('/face/'.length, -'.svg'.length);
    Promise.all([
      resoudreFace(token),
      rpcServeur('eth_call', [{ to: token, data: '0x95d89b41' }, 'latest']).catch(() => null),
    ]).then(([r, symHex]) => {
      if (!r || r.etat !== 'LU' || !r.face) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end('no engraved face for this block');
        return;
      }
      let sym = '';
      try {
        const b = String(symHex || '').slice(2);
        const n = parseInt(b.slice(64, 128), 16);
        sym = Buffer.from(b.slice(128, 128 + n * 2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').slice(0, 12);
      } catch (_) { sym = ''; }
      const svg = logoSvg(paramsLogoDepuisApparence(r.face, sym || '·'));
      /* la face est immuable : une journee de cache public ne peut jamais servir une face perimee */
      res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' });
      res.end(svg);
    }).catch(() => {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('face not read right now');
    });
    return;
  }

  /* la face GRAVEE d un block : /api/face/0x… — celle que son createur a choisie, pas celle qu on devine */
  if (chemin.startsWith('/api/face/')) {
    const token = chemin.slice('/api/face/'.length);
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) {
      res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: 'whole address required' }));
      return;
    }
    resoudreFace(token).then((r) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(r));
    }).catch((e) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, etat: 'NON_LUE', pourquoi: 'face not read: ' + String(e.message || e).slice(0, 120) }));
    });
    return;
  }

  /* ══ LE POST GRAVE, RECONSTITUE CHEZ NOUS : /api/post/0x… ═══════════════════════════════════════
   * ⛔⛔ POURQUOI COTE SERVEUR. Le widget officiel de X chargerait `platform.twitter.com` chez
   *     CHAQUE visiteur : un script externe, du pistage, et une dependance qui peut tomber ou
   *     changer sans prevenir. Trois refus d integration ont deja ete essuyes ici pour cette raison
   *     exacte. On demande donc a X une fois, d ici, et la page redessine avec ses propres balises.
   * ⛔ ON NE RENVOIE JAMAIS LEUR HTML : seulement l auteur et le TEXTE, extraits et bornes.
   * ⛔ CACHE : une reponse LUE ou INTROUVABLE decrit un fait stable, elle se garde. Un NON_MESURE
   *   est un echec de LECTURE : jamais cache, sinon une minute de reseau coupe condamnerait
   *   l affichage d un post pour toute la vie du processus. Meme discipline que les faces. */
  if (chemin.startsWith('/api/post/')) {
    const token = chemin.slice('/api/post/'.length);
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) {
      res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: 'whole address required' }));
      return;
    }
    const t = token.toLowerCase();
    const rendre = (corps) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(corps));
    };
    if (postsLus.has(t)) { rendre(postsLus.get(t)); return; }
    resoudreFace(t).then(async (f) => {
      /* ⛔⛔ BUG QUE J AI MOI-MEME INTRODUIT ET LIVRE, corrige le 2026-09-25 apres mesure en
       *     production : `/api/face/` rendait bien le post grave de ce block, et `/api/post/`
       *     repondait « AUCUN ». Cause : `resoudreFace` rend `face: null` quand la LECTURE echoue,
       *     et mon code lisait ce `null` comme « pas de post grave ».
       *     C est `absence-of-evidence-vs-failure-to-look`, et j avais meme ecrit en commentaire
       *     que « pas de post est un fait stable » — ce qui n est vrai QUE si la face a ete lue.
       *   ⛔⛔ ET LE CACHE RENDAIT LA FAUTE DEFINITIVE : une seule lecture ratee condamnait
       *     l affichage du post de ce block pour toute la vie du processus. Une erreur qu on garde
       *     coute infiniment plus cher que la meme erreur oubliee.
       *   ⇒ On exige que la face ait ETE LUE avant de conclure quoi que ce soit sur son post. */
      if (!f || f.etat !== 'LU') {
        rendre({ ok: true, etat: 'NON_MESURE',
          pourquoi: 'this block\'s face could not be read right now — that is about our reading, not about the post' });
        return;
      }
      const lien = f.face && typeof f.face.tweet === 'string' ? f.face.tweet : null;
      if (!lien) {
        /* ⛔ ICI seulement « aucun post » est un FAIT : la face a ete lue, et elle ne porte pas de
         *   lien. C est stable, donc cachable. */
        const rep = { ok: true, etat: 'AUCUN', pourquoi: 'no post engraved on this block' };
        postsLus.set(t, rep);
        rendre(rep);
        return;
      }
      const p = await lirePostPublie({ lien });
      const rep = p.etat === 'LU'
        ? { ok: true, etat: 'LU', auteur: p.auteur, auteurLien: p.auteurLien, texte: p.texte, lien }
        : { ok: true, etat: p.etat, lien, pourquoi: p.pourquoi };
      if (p.etat !== 'NON_MESURE') postsLus.set(t, rep);
      rendre(rep);
    }).catch((e) => {
      rendre({ ok: false, etat: 'NON_MESURE', pourquoi: 'post not read: ' + String(e.message || e).slice(0, 120) });
    });
    return;
  }

  /* ══ LA VOIX D UN BLOCK : /api/voix (Raksha, 2026-10-02) ══════════════════════════════════════
   * GET  /api/voix?b=0x…,0x…   → les voix PUBLIQUES (sans le savoir entier, seulement son court resume), 60 au plus
   * GET  /api/voix/0x…         → la voix entiere d un block (pour sa fiche)
   * POST /api/voix/0x…         → { voix, horodatage, signature, tx? } — signe par le wallet qui a CREE le block.
   * ⛔ Ce qui coute du reseau (ecrecover, createur) ne tourne qu apres les verifications gratuites, et au plus
   *   VOIX_POSTS_MINUTE fois par minute pour tout le serveur. Aucune cle, aucun secret, aucun montant ici. */
  if (chemin === '/api/voix' || chemin.startsWith('/api/voix/')) {
    const rendreV = (code, corps) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(corps));
    };
    if (chemin === '/api/voix') {
      const q = new URL(req.url, 'http://x').searchParams;
      const liste = String(q.get('b') || '').toLowerCase().split(',').filter((a) => /^0x[0-9a-f]{40}$/.test(a)).slice(0, 60);
      const voix = {};
      for (const a of liste) { const v = voixParBlock.get(a); if (v) voix[a] = voixPublique(v.voix); }
      rendreV(200, { ok: true, voix });
      return;
    }
    const jetonV = chemin.slice('/api/voix/'.length).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(jetonV)) { rendreV(400, { ok: false, pourquoi: 'whole address required' }); return; }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const v = voixParBlock.get(jetonV);
      /* le createur est un fait public (expediteur de la tx de creation) : la fiche s en sert pour cacher l editeur aux autres */
      rendreV(200, { ok: true, voix: v ? v.voix : null, horodatage: v ? v.horodatage : null, createur: createurParBlock.get(jetonV) || null });
      return;
    }
    if (req.method !== 'POST') { rendreV(405, { ok: false, pourquoi: 'GET or POST only' }); return; }
    /* ⛔ le budget ne se compte qu AU MOMENT DU RESEAU : un corps mal forme ne prive personne de son enregistrement */
    const ipV = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const budgetV = () => {
      const minute = Math.floor(Date.now() / 60000);
      if (voixPosts.minute !== minute) { voixPosts.minute = minute; voixPosts.n = 0; voixPosts.parIp.clear(); }
      const n = (voixPosts.parIp.get(ipV) || 0) + 1;
      voixPosts.parIp.set(ipV, n);
      return ++voixPosts.n <= VOIX_POSTS_MINUTE && n <= VOIX_POSTS_IP_MINUTE;
    };
    let brut = '', trop = false;
    req.on('data', (c) => { if (trop) return; brut += c; if (brut.length > VOIX_CORPS_MAX) { trop = true; rendreV(413, { ok: false, pourquoi: 'too long' }); req.destroy(); } });
    req.on('end', async () => {
      if (trop) return;
      let corps;
      try { corps = JSON.parse(brut); } catch { rendreV(400, { ok: false, pourquoi: 'not JSON' }); return; }
      try {
        const avant = voixParBlock.get(jetonV);
        const r = await verifierEcriture({ jeton: jetonV, chaine: 8453, horodatage: corps && corps.horodatage, voix: corps && corps.voix,
          signature: corps && corps.signature, maintenant: Date.now(), precedent: avant ? avant.horodatage : null,
          recuperer: (texte, sig) => {
            if (!budgetV()) throw new Error('too many saves right now — try again in a minute');
            return recupererSignataire({ rpc: rpcServeur, texte, signature: sig });
          },
          proprietaire: () => proprietaireDuBlock({ rpc: rpcServeur, jeton: jetonV, connu: createurParBlock.get(jetonV) || null, tx: corps && corps.tx }) });
        if (!r.ok) { rendreV(r.pourquoi.startsWith('only the wallet') ? 403 : 400, r); return; }
        if (r.voix) voixParBlock.set(jetonV, { voix: r.voix, horodatage: r.horodatage, auteur: r.auteur });
        else voixParBlock.delete(jetonV);
        ecrireVoix();
        rendreV(200, { ok: true, voix: r.voix, horodatage: r.horodatage });
      } catch (e) { rendreV(200, { ok: false, pourquoi: 'not saved: ' + String((e && e.message) || e).slice(0, 80) }); }
    });
    return;
  }

  /* la vraie cle de pool d un block : /api/cle/0x… — lue sur la chaine, jamais devinee */
  if (chemin.startsWith('/api/cle/')) {
    const token = chemin.slice('/api/cle/'.length);
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) {
      res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: 'whole address required' }));
      return;
    }
    /* ⛔⛔ UNE CLE LUE UNE FOIS NE SE RELIT JAMAIS. Mesure du 2026-09-26 : cette route repondait
     *     `{"ok":false,"pourquoi":"pool key not read: over rate limit"}` pour MUc — un block qui
     *     trade 806 446 $ par 24 h et dont la pool v4 est PARFAITEMENT LISIBLE par notre propre
     *     StateView (`sqrtPriceX96 = 23726964141923096624193324578`, lu a la main).
     *     Sans cle, le client retombe sur ses devinettes de PoolKey ; 432 combinaisons essayees a la
     *     main n ont pas retrouve son poolId — un poolId est un HASH, on ne l inverse pas.
     *     ⇒ La fiche affichait « Market unread — that is about the network. Use Retry. » et le
     *       Retry retapait la MEME route etranglee. Un geste qui ne pouvait pas aboutir.
     *   ⛔ UNE CLE DE POOL EST IMMUABLE : elle est le hash de ses propres champs. La mettre en
     *     cache pour toujours n est donc pas un pari sur la fraicheur — c est un fait qui ne
     *     change pas. Le PRIX, lui, n est jamais cache ici : il est relu a chaque visite.
     *   ⛔ ON NE CACHE QUE LES SUCCES. Un `ok:false` mis en cache figerait un echec reseau en
     *     verdict permanent — exactement le defaut qu on corrige. */
    const cleCache = clesCache.get(token.toLowerCase());
    if (cleCache) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify({ ...cleCache, depuisCache: true }));
      return;
    }
    resoudreClePool(token).then((r) => {
      try {
        if (r && r.ok === true && Array.isArray(r.cles) && r.cles.length) {
          clesCache.set(token.toLowerCase(), { ok: true, cles: r.cles });
          ecrireCles();
        }
      } catch (_) { /* ⛔ une mise en cache ratee ne doit pas priver le client de sa reponse */ }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(r));
    }).catch((e) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: 'pool key not read: ' + String(e.message || e).slice(0, 120) }));
    });
    return;
  }

  /* qui bouge ce block, en direct (onglet Market du panneau) : /api/activite/0x… */
  if (chemin.startsWith('/api/activite/')) {
    const token = chemin.slice('/api/activite/'.length).toLowerCase();
    const rendreA = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(corps)); };
    if (req.method !== 'GET') { rendreA(405, { ok: false, pourquoi: 'GET only' }); return; }
    if (!/^0x[0-9a-f]{40}$/.test(token)) { rendreA(400, { ok: false, pourquoi: 'whole address required' }); return; }
    lireActiviteServeur(token).then((r) => rendreA(r && r.occupe ? 429 : 200, r))
      .catch((e) => rendreA(200, { ok: false, pourquoi: String((e && e.message) || e).slice(0, 120) }));
    return;
  }
  /* le marche d un block lu par le serveur (repli du navigateur quand ses noeuds publics le refusent) : /api/marche/0x… */
  if (chemin.startsWith('/api/marche/')) {
    const token = chemin.slice('/api/marche/'.length).toLowerCase();
    const rendreM = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(corps)); };
    if (req.method !== 'GET') { rendreM(405, { ok: false, pourquoi: 'GET only' }); return; }
    if (!/^0x[0-9a-f]{40}$/.test(token)) { rendreM(400, { ok: false, pourquoi: 'whole address required' }); return; }
    lireMarcheServeur(token).then((r) => rendreM(r && r.occupe ? 429 : 200, r))
      .catch((e) => rendreM(200, { ok: false, etat: 'NON_LUE', pourquoi: String((e && e.message) || e).slice(0, 120) }));
    return;
  }

  /* ══ LA NAISSANCE PAR UN AGENT, ET LE MCP (2026-10-04) ═════════════════════════════════════════════════════════════════
   *   GET  /api/naissance/paires                                       les devises de naissance
   *   GET  /api/naissance/plan?nom=&symbole=&compte=[&paire=][&sel=]   les appels NON SIGNES d une naissance entiere, simules
   *   GET  /api/caution?block=[&paire=][&compte=]                      le minimum du createur + l appel de sortie non signe
   *   POST /mcp                                                        les memes outils, en MCP (JSON-RPC 2.0, sans session)
   * ⛔ RIEN N EST SIGNE NI ENVOYE ICI. Nom et symbole d un block sont publics (ils seront graves) : ils peuvent voyager en GET. */
  /* l apercu du widget MCP tel que le serveur le rend a un client (resources/read) — pour le relire dans un navigateur */
  if (chemin === '/mcp/widget') {
    res.writeHead(widgetHtml ? 200 : 404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(widgetHtml || 'the widget is not built on this server');
    return;
  }
  if (chemin === '/api/naissance/paires' || chemin === '/api/naissance/plan' || chemin === '/api/caution' || chemin === '/mcp' || chemin.startsWith('/api/panel/')) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id, x-ms-monitor' };
    const rendreN = (code, corps, extra = {}) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...cors, ...extra });
      res.end(corps === null ? '' : JSON.stringify(corps));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const ipN = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const sondeN = req.headers['x-ms-monitor'] === '1';
    const occupe = () => rendreN(429, { ok: false, etat: 'NON_MESURE', pourquoi: 'busy: each plan reads the chain on a node shared with the whole site — retry in a minute' }, { 'retry-after': '60' });
    const qN = new URL(req.url, 'http://x').searchParams;
    /* ── LA TELECOMMANDE (panel-sessions.js) : POST JSON seulement — l identifiant de session est un secret au porteur, il ne voyage
     *   JAMAIS dans une URL (ni journal, ni referer). Le panneau garde le sien dans le fragment (#s=…), que le navigateur n envoie pas.
     *     /api/panel/ouvrir     { block? }                 -> { session, url }          (le panneau lui-meme, ou un agent)
     *     /api/panel/commande   { s, commande }            -> { n }                     (l agent PROPOSE)
     *     /api/panel/commandes  { s, depuis }              -> { commandes }             (le panneau lit)
     *     /api/panel/evenement  { s, evenement }           -> { m }                     (le panneau rend compte)
     *     /api/panel/etat       { s, depuis }              -> { evenements }            (l agent lit la suite) */
    if (chemin.startsWith('/api/panel/')) {
      if (req.method !== 'POST') { rendreN(405, { ok: false, pourquoi: 'POST only' }, { allow: 'POST, OPTIONS' }); return; }
      if (!budgetPanel(ipN)) { rendreN(429, { ok: false, pourquoi: 'too many panel requests from this address — slow down' }, { 'retry-after': '30' }); return; }
      let brutP = '', tropP = false;
      req.on('data', (c) => { if (tropP) return; brutP += c; if (brutP.length > 4096) { tropP = true; rendreN(413, { ok: false, pourquoi: 'request too large' }); req.destroy(); } });
      req.on('end', () => {
        if (tropP) return;
        let j;
        try { j = JSON.parse(brutP || '{}'); } catch { rendreN(400, { ok: false, pourquoi: 'not JSON' }); return; }
        if (!j || typeof j !== 'object' || Array.isArray(j)) { rendreN(400, { ok: false, pourquoi: 'a JSON object is expected' }); return; }
        const depuis = Number.isInteger(j.depuis) ? j.depuis : 0;
        let r;
        if (chemin === '/api/panel/ouvrir') r = ouvrirPanel(j.block === undefined || j.block === null || j.block === '' ? null : j.block);
        else if (chemin === '/api/panel/commande') r = registrePanel.pousser(j.s, j.commande);
        else if (chemin === '/api/panel/commandes') r = registrePanel.lireCommandes(j.s, depuis);
        else if (chemin === '/api/panel/evenement') r = registrePanel.noter(j.s, j.evenement);
        else if (chemin === '/api/panel/etat') r = registrePanel.lireEvenements(j.s, depuis);
        /* le cablage direct : le panneau publie l etat du cerveau du block affiche ; l agent le lit dans tblock_panel_state */
        else if (chemin === '/api/panel/cerveau') r = registrePanel.noterCerveau(j.s, j.cerveau);
        else { rendreN(404, { ok: false, pourquoi: 'unknown panel route' }); return; }
        rendreN(r.ok ? 200 : r.inconnue ? 404 : r.tropVite ? 429 : 400, r);
      });
      return;
    }
    if (chemin === '/api/naissance/paires') {
      if (req.method !== 'GET') { rendreN(405, { ok: false, pourquoi: 'GET only' }); return; }
      rendreN(200, pairesPourAgent());
      return;
    }
    if (chemin === '/api/naissance/plan') {
      if (req.method !== 'GET') { rendreN(405, { ok: false, pourquoi: 'GET only' }); return; }
      const d = { nom: String(qN.get('nom') || ''), symbole: String(qN.get('symbole') || ''), compte: String(qN.get('compte') || ''),
        paire: String(qN.get('paire') || 'ETH'), sel: String(qN.get('sel') || '') };
      if (!d.nom.trim() || !d.symbole.trim() || !/^0x[0-9a-f]{40}$/i.test(d.compte) || !/^(eth|0x[0-9a-f]{40})$/i.test(d.paire) || d.sel.length > 64) {
        rendreN(400, { ok: false, etat: 'REFUSE', pourquoi: 'usage: /api/naissance/plan?nom=<block name>&symbole=<ticker>&compte=<the wallet that will sign>'
          + '[&paire=<ETH or a currency address from /api/naissance/paires>][&sel=<free text that fixes the address>]' });
        return;
      }
      if (!prendreBudgetPlan(ipN)) { naissanceCompteurs.trop += 1; occupe(); return; }
      faireNaissance(d, { sonde: sondeN }).then((r) => rendreN(200, r))
        .catch((e) => rendreN(200, { ok: false, etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120) }))
        .finally(() => { railsEnVol -= 1; });
      return;
    }
    if (chemin === '/api/caution') {
      if (req.method !== 'GET') { rendreN(405, { ok: false, pourquoi: 'GET only' }); return; }
      const d = { block: String(qN.get('block') || ''), pair: String(qN.get('paire') || 'ETH'), account: String(qN.get('compte') || '') };
      if (!/^0x[0-9a-f]{40}$/i.test(d.block) || !/^(eth|0x[0-9a-f]{40})$/i.test(d.pair) || (d.account && !/^0x[0-9a-f]{40}$/i.test(d.account))) {
        rendreN(400, { ok: false, etat: 'REFUSE', pourquoi: 'usage: /api/caution?block=<block address>[&paire=<ETH or the paired currency address>][&compte=<the creator wallet>]' });
        return;
      }
      if (!prendreBudgetPlan(ipN)) { naissanceCompteurs.trop += 1; occupe(); return; }
      faireCaution(d).then((r) => rendreN(200, r))
        .catch((e) => rendreN(200, { ok: false, etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120) }))
        .finally(() => { railsEnVol -= 1; });
      return;
    }
    /* ── /mcp ── */
    if (req.method === 'GET') { rendreN(405, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'this MCP server answers POST only (no event stream)' } }, { allow: 'POST, OPTIONS' }); return; }
    if (req.method !== 'POST') { rendreN(405, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'POST only' } }, { allow: 'POST, OPTIONS' }); return; }
    let brutM = '', tropM = false;
    req.on('data', (c) => { if (tropM) return; brutM += c; if (brutM.length > 16 * 1024) { tropM = true; rendreN(413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'request too large' } }); req.destroy(); } });
    req.on('end', async () => {
      if (tropM) return;
      let msg;
      try { msg = JSON.parse(brutM); } catch { rendreN(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); return; }
      naissanceCompteurs.mcp += 1;
      /* chaque outil qui lit la chaine prend le budget des plans ; il le REND dans son finally */
      const avecBudget = (f) => async (a) => {
        if (!prendreBudgetPlan(ipN)) { naissanceCompteurs.trop += 1; const e = new Error('busy'); e.occupe = true; throw e; }
        try { return await f(a); } finally { railsEnVol -= 1; }
      };
      try {
        const rep = await traiterMcp(msg, { version: buildServi(), widget: () => widgetHtml, outils: {
          tblock_pairs: async () => pairesPourAgent(),
          tblock_plan_birth: avecBudget((a) => faireNaissance({ nom: a.name, symbole: a.symbol, compte: a.account, paire: a.pair || 'ETH', sel: a.salt || '' }, { sonde: sondeN })),
          tblock_plan_swap: avecBudget((a) => faireRail({ de: a.from, vers: a.to, montant: a.amount, compte: a.account })),
          tblock_creator_minimum: avecBudget((a) => faireCaution({ block: a.block, pair: a.pair || 'ETH', account: a.account || '' })),
          /* la telecommande : des PROPOSITIONS pour un panneau ouvert par l humain — aucune lecture de chaine, aucun envoi */
          tblock_panel_open: async (a) => { const r = ouvrirPanel(a.block || null); return r.ok ? { ...r, etat: 'PRET' } : { ...r, etat: 'REFUSE' }; },
          tblock_command: async (a) => {
            const { session, ...commande } = a;
            const r = registrePanel.pousser(session, commande);
            return r.ok ? { ok: true, etat: 'PRET', n: r.n, commande: r.commande, panneauOuvert: r.panneauOuvert,
              suite: r.panneauOuvert ? 'shown in the panel; read tblock_panel_state for the brain verdict and what the user signs'
                : 'queued, but no panel is open on this session right now — ask the user to open the link from tblock_panel_open' }
              : { ok: false, etat: 'REFUSE', pourquoi: r.pourquoi };
          },
          tblock_panel_state: async (a) => { const r = registrePanel.lireEvenements(a.session, a.since ? Number(a.since) : 0); return r.ok ? { ...r, etat: 'PRET' } : { ...r, etat: 'REFUSE' }; },
        } });
        if (rep === null) { res.writeHead(202, cors); res.end(); return; }
        rendreN(200, rep);
      } catch (e) {
        rendreN(200, { jsonrpc: '2.0', id: (msg && msg.id) === undefined ? null : msg.id, error: { code: -32603, message: 'internal error' } });
      }
    });
    return;
  }

  /* ══ NOS RAILS, EXPOSES : /api/rails/plan?de=&vers=&montant=&compte= (2026-10-03) ═══════════════════════════════════
   * ⛔ RIEN N EST SIGNE ICI : la reponse porte des appels NON SIGNES, construits par les planificateurs de l app. Le wallet
   *   de l agent les signe, dans l ordre de `aSigner`. Le budget ne se compte qu AU MOMENT DU RESEAU. */
  if (chemin === '/api/rails/plan') {
    const rendreR = (code, corps, extra = {}) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*', ...extra });
      res.end(JSON.stringify(corps));
    };
    if (req.method !== 'GET') { rendreR(405, { ok: false, pourquoi: 'GET only' }); return; }
    const q = new URL(req.url, 'http://x').searchParams;
    const demande = { de: String(q.get('de') || ''), vers: String(q.get('vers') || ''),
      montant: String(q.get('montant') || ''), compte: String(q.get('compte') || '') };
    if (![demande.de, demande.vers].every((x) => /^(eth|0x[0-9a-f]{40})$/i.test(x))
      || !/^0x[0-9a-f]{40}$/i.test(demande.compte) || !/^[1-9][0-9]{0,40}$/.test(demande.montant)) {
      rendreR(400, { ok: false, etat: 'REFUSE', pourquoi: 'usage: /api/rails/plan?de=<token address or ETH>&vers=<token address or ETH>'
        + '&montant=<integer, raw units of the token paid>&compte=<the wallet that will sign>' });
      return;
    }
    const sonde = req.headers['x-ms-monitor'] === '1';
    const cleR = [demande.de, demande.vers, demande.montant, demande.compte].join('|').toLowerCase();
    const enCache = railsCache.get(cleR);
    if (enCache && Date.now() - enCache.t < RAILS_CACHE_MS) { rendreR(200, { ...enCache.corps, depuisCache: true }); return; }
    const ipR = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const minuteR = Math.floor(Date.now() / 60000);
    if (railsBudget.minute !== minuteR) { railsBudget.minute = minuteR; railsBudget.n = 0; railsBudget.parIp.clear(); }
    const nIp = (railsBudget.parIp.get(ipR) || 0) + 1;
    if (nIp > RAILS_IP_MINUTE || railsBudget.n >= RAILS_MINUTE || railsEnVol >= RAILS_EN_VOL_MAX) {
      railsCompteurs.trop += 1;
      rendreR(429, { ok: false, etat: 'NON_MESURE', pourquoi: 'busy: each plan reads the chain on a node shared with the whole site — retry in a minute' },
        { 'retry-after': '60' });
      return;
    }
    railsBudget.parIp.set(ipR, nIp);
    railsBudget.n += 1;
    railsEnVol += 1;
    if (sonde) railsCompteurs.sondes += 1; else railsCompteurs.plans += 1;
    /* ⛔⛔ R10 (pool-sans-hook.js) : un B20 hors de nos sources TB n est libere que si ces sources sont LUES — dans CE processus,
     *   l etat module d index-routeur.js n est charge par personne (c est le client qui l appelle). Le serveur juge donc ses
     *   PROPRES corps, exactement comme le client les jugerait (meme chargeur, meme fraicheur) : index incomplet ou tete
     *   figee = sources non lues = tout B20 inconnu reste un block (fail-closed), et la reponse le DIT. */
    try { chargerIndexRouteur(JSON.parse(blocksRouteurCorps())); chargerNosBlocksTb(JSON.parse(nosBlocksCorps())); } catch (_) { /* sources non lues : fail-closed */ }
    planRail(demande, { rpc: rpcRails, clesDe: clesRails, chaine: 8453 }).then((r) => {
      if (!sourcesTbLues() && r.etat === 'REFUSE') r.sourcesTb = 'not read on the server: router index or our-blocks list incomplete or stale — a block born elsewhere is refused until they are';
      if (!sonde) {
        if (r.etat === 'PRET') railsCompteurs.prets += 1;
        else if (r.etat === 'APPROBATIONS') railsCompteurs.approbations += 1;
        else if (r.etat === 'REFUSE') railsCompteurs.refus += 1;
        else railsCompteurs.nonMesures += 1;
      }
      if (r.etat === 'PRET') {
        railsCache.set(cleR, { t: Date.now(), corps: r });
        while (railsCache.size > 200) railsCache.delete(railsCache.keys().next().value);
      }
      rendreR(200, r);
    }).catch((e) => {
      rendreR(200, { ok: false, etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120) });
    }).finally(() => { railsEnVol -= 1; });
    return;
  }

  /* ══ LE RAIL FIAT -> BASE (Phil, 2026-09-23 : « la raison est le bridge fiat to block ») ═══════
   * ⛔⛔ CETTE ROUTE NE RENVOIE RIEN DE FAUX. Sans cle CDP dans l environnement, elle repond
   *     `pret:false` avec le NOM de la variable manquante, et AUCUNE url. Le client retombe alors
   *     sur le lien public — un lien honnete qui ne pretend pas connaitre la destination.
   * ⛔ LE SECRET N ARRIVE JAMAIS ICI : il est lu par `cdp-jwt.js`, qui rend un jeton signe. Aucune
   *   reponse de cette route, y compris ses erreurs, ne peut le contenir.
   * ⚠️ NON EXERCE EN PRODUCTION : aucune cle n existe au moment ou j ecris ceci. Le chemin « OK »
   *   n a jamais tourne contre le vrai Coinbase. Personne ne doit lire cette route comme un revenu.
   * ⚠️ `GET` EXPRES, ET SANS DONNEE PERSONNELLE EN PARAMETRE : seule une adresse publique de wallet
   *   et un montant transitent. Rien d identifiant ne doit jamais entrer dans une query string. */
  /* ── ⛔⛔ CE QUE COINBASE SAIT VENDRE — LA QUESTION QU ON NE POUVAIT PAS POSER ────────────────
   *     Phil, 2026-09-27 : « le rail doit se faire fiat onramp Coinbase puis Block tokenise OU
   *     ACTION TOKENISEE direct ». Trois chemins avaient echoue avant celui-ci : la page d achat
   *     exige une connexion au compte Coinbase (refusee), `buy/options` rend 401 sans JWT, et
   *     `pay.coinbase.com/api/v1/buy/options` exige un app-id absent du depot.
   *     Ce serveur, lui, sait deja fabriquer le JWT — c est le meme signeur que pour la session.
   *   ⚠️ LECTURE SEULE, AUCUNE DONNEE PERSONNELLE : un code pays sur deux lettres, rien d autre.
   *     Aucun wallet, aucun montant, aucun identifiant ne transite.
   *   ⛔ LE JWT SIGNE `GET + hote + CHEMIN` SANS LA QUERY : mettre `?country=` dans la chaine
   *     signee rendrait un 401 que rien n expliquerait. Le chemin vient d une constante PARTAGEE
   *     avec le module qui appelle, pour que les deux ne puissent pas diverger. */
  if (chemin === '/api/onramp/options') {
    const q = new URL(req.url, 'http://x').searchParams;
    const etatO = etatCdp(process.env);
    if (!etatO.pret) {
      /* ⛔ 200 ET PAS 500, comme la route soeur : une capacite absente n est pas une panne. */
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pret: false, pourquoi: etatO.pourquoi }));
      return;
    }
    const signeO = signerJwtCdp({ cleId: process.env[etatO.cle], secretPem: process.env[etatO.secret],
      methode: 'GET', hote: 'api.developer.coinbase.com', chemin: CHEMIN_OPTIONS_ACHAT });
    if (signeO.etat !== 'OK') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pret: false, pourquoi: signeO.pourquoi }));
      return;
    }
    /* ⛔ Le JWT passe par un champ prive, JAMAIS par le vrai `process.env` — meme regle que la
     *   route de session : rien de ce qui sert a signer ne devient une variable globale. */
    lireOptionsAchat({ env: { [etatO.cle]: '1', [etatO.secret]: '1', __CDP_JWT: signeO.jwt },
      pays: q.get('pays') || 'US', subdivision: q.get('sub') })
      .then((r) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        res.end(JSON.stringify(r.etat === 'OK'
          ? { ok: true, pret: true, n: r.actifs.length, actifs: r.actifs,
              /* ⛔ LES DEUX LISTES VOYAGENT, ET LE COMPTE DES FIATS VAUT null QUAND ON N A PAS PU
               *   LIRE : un 0 dirait « aucune devise » la ou il faut lire « Coinbase ne l a pas
               *   rendue ». Deux faits opposes, et le second est notre ignorance.
               * ⛔⛔ CE COMMENTAIRE A ETE REECRIT PARCE QUE JE L AI D ABORD INJECTE PAR UNE CHAINE
               *     SHELL : bash a interprete les accents graves comme une substitution de commande
               *     (« null: command not found ») et a MANGE deux mots. Le code a survecu par
               *     chance — la substitution est tombee dans un commentaire. Toute edition passe par
               *     Write/Edit, jamais par une chaine shell. La regle existe pour ca. */
              fiatsDeclares: r.fiatsDeclares, nFiats: Array.isArray(r.fiatsDeclares) ? r.fiatsDeclares.length : null, pays: r.pays }
          : { ok: false, pret: true, etat: r.etat, pourquoi: r.pourquoi }));
      })
      .catch((e) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, pret: true, etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120) }));
      });
    return;
  }
  if (chemin === '/api/onramp/session') {
    const q = new URL(req.url, 'http://x').searchParams;
    const demande = validerDemande({ adresse: q.get('adresse'), actif: q.get('actif'),
      montantFiat: q.get('montant'), retourBlock: q.get('block') });
    if (demande.etat !== 'OK') {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pret: false, pourquoi: demande.pourquoi }));
      return;
    }
    const etat = etatCdp(process.env);
    if (!etat.pret) {
      /* ⛔ 200 ET PAS 500 : ce n est pas une panne, c est une capacite absente. Un 500 ferait
       *   chercher un bug la ou il n y a qu une variable a poser. Le client lit `pret:false`. */
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pret: false, pourquoi: etat.pourquoi }));
      return;
    }
    const HOTE = 'api.developer.coinbase.com', CHEMIN_CDP = '/onramp/v1/token';
    const signe = signerJwtCdp({ cleId: process.env[etat.cle], secretPem: process.env[etat.secret],
      methode: 'POST', hote: HOTE, chemin: CHEMIN_CDP });
    if (signe.etat !== 'OK') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pret: false, pourquoi: signe.pourquoi }));
      return;
    }
    /* ⛔ Le JWT signe est passe par un champ prive de l objet d environnement transmis, JAMAIS par
     *   le vrai `process.env` : rien de ce qui sert a signer ne devient une variable globale. */
    creerSession({ env: { [etat.cle]: '1', [etat.secret]: '1', __CDP_JWT: signe.jwt },
      adresse: demande.adresse, actif: demande.actif })
      .then((s) => {
        if (s.etat !== 'OK') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ ok: false, pret: true, etat: s.etat, pourquoi: s.pourquoi }));
          return;
        }
        /* ⛔⛔ LE DOMAINE DE RETOUR EST DECIDE ICI, JAMAIS PAR L APPELANT. Seul un block DEJA
         *     VALIDE par `validerDemande` (0x + 40 hex, minuscules) s ajoute en query. Reflechir
         *     une url fournie par le client serait un open-redirect sur un ecran qui parle
         *     d argent. La concatenation ci-dessous ne peut produire que notre propre origine.
         *   ⇒ Sans ce parametre, quelqu un qui finance depuis l ecran d un block revenait sur la
         *     page d accueil et devait le retrouver a la main : le rail fiat marchait, et le
         *     parcours fiat -> BLOCK s arretait la. */
        const retour = 'https://tokenizedblock.space/'
          + (demande.retourBlock ? '?block=' + demande.retourBlock : '');
        const u = urlOnramp({ sessionToken: s.sessionToken, actif: demande.actif,
          montantFiat: demande.montantFiat, retour });
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        res.end(JSON.stringify(u.etat === 'OK' ? { ok: true, pret: true, url: u.url }
          : { ok: false, pret: true, pourquoi: u.pourquoi }));
      })
      .catch((e) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, pret: true, etat: 'NON_MESURE',
          pourquoi: 'onramp session failed: ' + String((e && e.message) || e).slice(0, 120) }));
      });
    return;
  }

  if (chemin === '/api/ol/list') {
    listeOpenLaunch().then((corps) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(corps);
    });
    return;
  }

  /* ══ ENTONNOIR (Phil, 2026-09-19 : « fais l entonnoir, avec des resultats vrais ») ══════════════════════════
   * ⛔ ANONYME PAR CONSTRUCTION : on compte des ETAPES, rien d autre — ni adresse, ni IP, ni identifiant, ni cookie.
   * ⚠️ BORNES : persistant sur le volume /data (≤ 30 s de pertes a l arret) ; un curieux peut gonfler
   *    un compteur a la main — ce sont des ordres de grandeur, jamais une preuve d argent (l argent se lit sur a6cf). */
  if (chemin === '/api/etape') {
    const q = new URL(req.url, 'http://x').searchParams;
    const e = q.get('e') || '';
    /* ⛔⛔⛔ NOTRE PROPRE TRAFIC EST COMPTE A PART, ET C EST UNE MESURE QUI L A EXIGE. Le
     *      2026-09-30 j ai passe la journee a ouvrir l app dans un navigateur pour verifier mes
     *      deploiements — sans wallet, donc en declenchant `echange_refus_wallet`, `gm_refus_wallet`,
     *      `achat_clic`… Le meme jour, l entonnoir affichait 9 `echange_refus_wallet` pour
     *      10 `visite`, et j ai commence a en tirer des conclusions produit AVANT de realiser que
     *      je les avais fabriquees moi-meme. Rien ne distinguait mes taps de ceux d un visiteur.
     *    ⛔ ON SEPARE, ON NE JETTE PAS. Jeter notre trafic cacherait son volume : on ne saurait plus
     *      si un chiffre bas vient des visiteurs ou d un filtre trop large. Deux seaux, et les deux
     *      sont publies.
     *    ⚠️ ET CA NE REPARE PAS LE PASSE : les journees d avant restent melangees, sans moyen de
     *      les demeler. C est dit dans la reponse de `/api/entonnoir`, pas tu. */
    const interne = q.get('i') === '1';
    if (ETAPES_ENTONNOIR.includes(e)) {
      const jour = new Date().toISOString().slice(0, 10);
      const seau = interne ? entonnoir.interne : entonnoir.total;
      const seauJour = interne ? entonnoir.interneParJour : entonnoir.parJour;
      seau[e] = (seau[e] || 0) + 1;
      seauJour[jour] = seauJour[jour] || {};
      seauJour[jour][e] = (seauJour[jour][e] || 0) + 1;
      entonnoirSale = true;
      console.log('[entonnoir]', jour, e, interne ? '(INTERNE)' : '');
    }
    res.writeHead(204, { 'cache-control': 'no-store' });
    res.end();
    return;
  }
  if (chemin === '/api/entonnoir') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    /* ⛔⛔ LES DEUX SEAUX SONT PUBLIES, ET LA BORNE AVEC EUX. Ne rendre que `total` laisserait
     *     croire qu il est propre depuis toujours ; ne rendre que le notre cacherait le volume.
     *   ⛔ `melangeJusquau` DIT LA VERITE SUR LE PASSE : avant cette date, notre trafic de
     *     verification est DANS `total` et rien ne permet de l en sortir. Un chiffre dont on ne
     *     dit pas la borne se lit comme s il n en avait pas. */
    res.end(JSON.stringify({ ok: true, persistant: !!FICHIER_ENTONNOIR, depuis: entonnoir.depuis,
      etapes: ETAPES_ENTONNOIR, total: entonnoir.total, parJour: entonnoir.parJour,
      interne: entonnoir.interne || {}, interneParJour: entonnoir.interneParJour || {},
      melangeJusquau: '2026-09-30',
      borne: 'Steps counted before 2026-09-30 mix visitors with our own verification traffic, and '
        + 'they cannot be separated after the fact. From that date, our traffic is counted in '
        + '`interne` instead — separated, never dropped.' }));
    return;
  }

  /* ══ PARTS CREATEUR (Phil 2026-09-19 : « que a6cf soit l unique receveur ») ════════════════════════════════════════
   * Sur V2/V3, 1/3 des frais de swap va au CREATEUR enregistre de la pool ; il peut ceder cette part (transfererPart).
   * Lecture seule : les pools de nos hooks dont `compte` est le createur enregistre. Le serveur ne signe rien. */
  if (chemin === '/api/parts-createur') {
    const compte = String(new URL(req.url, 'http://x').searchParams.get('compte') || '').toLowerCase();
    const repondre = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (!/^0x[0-9a-f]{40}$/.test(compte)) { repondre({ ok: false, pourquoi: 'not an address' }); return; }
    fraisEnAttente().then(async () => {
      const pools = [];
      for (const p of fraisScan.pools) {
        let createur = null;
        try { createur = '0x' + String(await rpcServeur('eth_call', [{ to: p.hook, data: '0x631245a7' /* createurDe(bytes32) */ + p.id.slice(2) }, 'latest'])).slice(-40); } catch { createur = null; }
        if (!createur || createur.toLowerCase() !== compte) continue;
        const bloc = [p.c0, p.c1].find((a) => a.startsWith('0xb2')) || p.c1;
        let sym = null;
        try { const x = await rpcServeur('eth_call', [{ to: bloc, data: '0x95d89b41' }, 'latest']); const bx = String(x).slice(2); const n = parseInt(bx.slice(64, 128), 16); sym = Buffer.from(bx.slice(128, 128 + n * 2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').slice(0, 12); } catch { sym = null; }
        pools.push({ hook: p.hook, hookNom: (HOOKS_FRAIS.find((h) => h.adr === p.hook) || {}).nom || '?', id: p.id, bloc, symbole: sym });
      }
      repondre({ ok: true, compte, pools, feeWallet: WALLET_FRAIS });
    }).catch((e) => repondre({ ok: false, pourquoi: String((e && e.message) || e).slice(0, 120) }));
    return;
  }

  /* ══ QUI LANCE QUOI SUR BASE, EN CE MOMENT (2026-10-02) ═══════════════════════════════════════
   * ⛔ LECTURE SEULE : eth_getLogs des factories (o1/LaunchBlitz, Clanker, Zora, Doppler/bankr, OpenLaunch,
   *    B20 auto). Fenetres ratees et fronts non lus sont COMPTES dans la reponse, jamais tus.
   * ⛔ 6 h maximum par appel, cache 5 min : un scan de 24 h (~260 getLogs + ~1 500 eth_call) n a rien a
   *    faire derriere un bouton. Les chiffres de 24 h sont dans canal/DIG-LAUNCHBLITZ-capture-2026-10-02.md. */
  if (chemin === '/api/lancements-etrangers') {
    const heures = Math.min(6, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('h')) || 1));
    lancementsEtrangers(heures).then((r) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(r));
    }).catch((e) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: String((e && e.message) || e).slice(0, 160) }));
    });
    return;
  }

  if (chemin === '/api/frais-hook') {
    fraisEnAttente().then((r) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(r));
    }).catch((e) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: String((e && e.message) || e).slice(0, 160) }));
    });
    return;
  }

  /* ══ CE QUI EST REELLEMENT ARRIVE, ET SI C EST BIEN ARRIVE ══════════════════════════════════
   * ⛔ DEUX QUESTIONS DIFFERENTES : /api/frais-hook dit ce qui DORT en claims, celui-ci dit ce qui
   *    EST ARRIVE — et confronte chaque evenement au SOLDE du beneficiaire. Un hook emet ce qu il
   *    veut ; seul un delta de solde prouve un encaissement.
   * ⚠️ QUATRE ETATS : ARRIVE, PAS_ARRIVE, NON_CONCLUANT (le beneficiaire a paye lui-meme, l argent
   *    fait un aller-retour et le gas rend le delta negatif), NON_LU. */
  if (chemin === '/api/frais-recents') {
    const heures = Math.min(168, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('h')) || 24));
    fraisRecents(heures).then((r2) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(r2));
    }).catch((e) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: String((e && e.message) || e).slice(0, 160) }));
    });
    return;
  }

  /* sonde de sante — pour qu un cron puisse demander « es-tu vivant » sans charger l app */
  if (chemin === '/sante') {
    /* ok:false (et 503) si un module importe par l app n est pas servi : la page repondrait 200 mais serait morte */
    const ok = modulesManquants.length === 0;
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    /* ⛔ LE BUILD SERVI, POUR QU UN ONGLET DEJA OUVERT SACHE QU IL EST PERIME (2026-09-17 : Phil lisait
     * une page d avant le deploiement et en concluait que le travail n avait pas ete fait). Lu dans le
     * fichier SERVI, jamais recopie a la main. */
    /* `naissance` : le verdict de la sonde qui simule une naissance entiere contre le hook deploye (voir sonderNaissance). Il ne
     *   change PAS `ok` (un 503 ferait redemarrer le conteneur pour une panne de noeud) — il se LIT : etat PRET, ou la raison. */
    res.end(JSON.stringify({ ok, servis: cache.size, racine: RACINE, build: buildServi(), rails: railsCompteurs,
      naissance: { sonde: naissanceSonde, ...naissanceCompteurs },
      /* les quatre sondes cote a cote : naissance, marche, echange, cerveau — chacune PRET, ou sa raison */
      sondes: { naissance: naissanceSonde.etat, marche: autresSondes.marche, echange: autresSondes.echange, cerveau: autresSondes.cerveau, block: BLOCK_SONDE },
      mcpWidget: widgetHtml !== null, ...(ok ? {} : { modulesManquants }) }));
    return;
  }

  const cle = chemin === '/' ? '/' + RACINE : chemin;
  const e = cache.get(cle);
  if (!e) {
    /* ⛔ UN 404 EST UN 404. Rediriger vers l accueil ferait passer une faute de frappe pour une
     * page valide, et casserait le temoin negatif de nos sondes de production. */
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('not served');
    return;
  }
  /* ⛔ 2026-09-14: never 304 HTML/JS — Chrome kept Paid Create / Brain unread after Railway tip. Images still etag. */
  if (!e.image && req.headers['if-none-match'] === e.etag) {
    /* fall through to 200 with full body */
  } else if (e.image && req.headers['if-none-match'] === e.etag) {
    res.writeHead(304, entete(e));
    res.end();
    return;
  }
  /* ⛔ LE CLIENT DOIT AVOIR DEMANDE LE GZIP. On ne le devine pas : un client qui ne l annonce pas
   *    recevra le corps brut, exactement comme avant. */
  const accepteGz = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  const blocDemande = cle === '/' + RACINE ? (String(req.url || '').match(/[?&]block=(0x[0-9a-fA-F]{40})(?:&|$)/) || [])[1] : null;
  if (blocDemande) {
    /* ⛔ CE CHEMIN REECRIT LE HTML PAR REQUETE (les balises og du block demande) : le gzip
     *    pre-calcule ne correspond donc PLUS au corps envoye. On compresse a la volee ici, et
     *    seulement ici — servir le gzip du fichier d origine enverrait les mauvaises balises, ce
     *    qui est precisement le genre d erreur qu un cache rendrait indebuggable. */
    apercuBlock(blocDemande).then((tags) => {
      const html = String(e.corps).replace(/<!--og:debut-->[\s\S]*?<!--og:fin-->/, () => '<!--og:debut-->\n' + tags + '\n<!--og:fin-->');
      if (accepteGz) {
        const c = gzipSync(Buffer.from(html, 'utf8'), { level: 6 });
        res.writeHead(200, entete(e, true));
        res.end(req.method === 'HEAD' ? undefined : c);
        return;
      }
      res.writeHead(200, entete(e));
      res.end(req.method === 'HEAD' ? undefined : html);
    }).catch(() => { res.writeHead(200, entete(e)); res.end(req.method === 'HEAD' ? undefined : e.corps); });
    return;
  }
  if (accepteGz && e.gz) {
    res.writeHead(200, entete(e, true));
    res.end(req.method === 'HEAD' ? undefined : e.gz);
    return;
  }
  res.writeHead(200, entete(e));
  res.end(req.method === 'HEAD' ? undefined : e.corps);
}).listen(PORT, '0.0.0.0', () => {
  console.log('tokenized-block sert ' + cache.size + ' fichier(s) sur le port ' + PORT);
  console.log('racine -> ' + RACINE + '  ·  HTML et JS en no-cache, images 24 h');
  prechaufferFaitsDePool();
});

/* ── ⛔⛔ POURQUOI UN PRECHAUFFAGE, ET PAS UNE LECTURE A L OUVERTURE DE LA PAGE ──────────────────
 *     MESURE EN PRODUCTION LE 2026-09-29 : les faits de pool lus a la demande echouaient en
 *     « over rate limit » sur le RPC public, donc `glissementBps` valait `null`, donc la porte
 *     d achat etait INERTE — 16 verdicts `NON_MESURE` sur 17 devises. Le filtre existait et ne
 *     filtrait rien : BEc gardait sa puce avec 385 bps de glissement.
 *   ⛔ LA FORME JUSTE EST DONC UN RYTHME LENT, PAS UNE RAFALE A CHAQUE VISITE. Dix-sept devises,
 *     une a la fois, espacees : le RPC ne bronche pas, et les pages lisent un cache tiede.
 *   ⛔ ET LE RESULTAT PORTE SON AGE. Un verdict vieux de dix minutes reste un verdict ; un verdict
 *     dont on ignore l age serait une photo qu on prendrait pour du direct.
 *   ⚠️ CE QUE CA NE CORRIGE PAS : si le RPC refuse pendant tout un cycle, les verdicts restent
 *     inconnus et la porte reste inerte. Elle ne fait alors pas PIRE qu avant, mais elle ne fait
 *     pas son travail — et c est `pourquoiFaits` qui le dira, pas un silence. */
const INTERVALLE_PRECHAUFFE_MS = 4 * 60 * 1000;
const ESPACEMENT_ENTRE_DEVISES_MS = 4000;
async function prechaufferFaitsDePool() {
  const devises = (() => {
    try {
      return pairesProposees(8453)
        .filter((p) => p && (p.type === 'ACTION' || p.type === 'MAJEUR') && /^0x[0-9a-fA-F]{40}$/.test(String(p.adr)))
        .map((p) => String(p.adr).toLowerCase());
    } catch (_) { return []; }
  })();
  if (!devises.length) { console.log('prechauffage : aucune devise a lire'); return; }
  let lus = 0, inconnus = 0;
  for (const adr of devises) {
    /* ⛔ ON PASSE PAR L ENDPOINT INTERNE : un second chemin de lecture aurait diverge du premier. */
    try {
      const j = await fetch('http://127.0.0.1:' + PORT + '/api/prix-usd?adr=' + adr,
        { signal: AbortSignal.timeout(25000) }).then((r) => r.json());
      if (j && typeof j.glissementBps === 'number') lus += 1; else inconnus += 1;
    } catch (_) { inconnus += 1; }
    await new Promise((ok) => setTimeout(ok, ESPACEMENT_ENTRE_DEVISES_MS));
  }
  /* ⛔ LE JOURNAL DIT LES DEUX CHIFFRES. « prechauffage fait » sans le nombre d inconnus serait la
   *   phrase qui a laisse la porte inerte une journee entiere sans que rien ne le crie. */
  /* ⛔⛔ LA TAILLE DU CACHE PERSISTE EST DITE ICI, ET C EST LE SEUL MOYEN DE SAVOIR SI L ECRITURE
   *     MARCHE. Le journal de demarrage annonce « fichier encore vide » AVANT que le premier fait
   *     n arrive : sans ce second chiffre, une ecriture qui echoue en silence laisserait la porte
   *     redevenir inerte au prochain redemarrage, et rien ne le crierait. Deux chiffres cote a
   *     cote : ce qu on vient de lire, et ce qui survivra. */
  console.log('prechauffage des faits de pool : ' + lus + ' lus, ' + inconnus + ' inconnus, sur '
    + devises.length + ' devises · ' + faitsPersistes.size + ' verdict(s) gardes'
    + (FICHIER_FAITS_POOL ? '' : ' (EN MEMOIRE SEULE, aucun volume)'));
  setTimeout(prechaufferFaitsDePool, INTERVALLE_PRECHAUFFE_MS);
}
