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
/* le rail fiat->Base : validation pure + transport, et la signature isolee dans son propre module */
import { etatCdp, validerDemande, urlOnramp, creerSession } from './onramp-session.js';
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
import { listerCreations } from './index-blocks.js';
import { frappesVers } from './mes-blocks.js';
import { prochaineFenetre } from './fenetre-scan.js';
import { veiller } from './veille-pot.js';
import { naissanceDuJeton, passeIncrementale, verifierSomme, soldesNegatifs } from './soldes-jeton.js';
import { partsHolders } from './parts-holders.js';
/* ⛔ LA VEILLE DES FRAIS VIT DANS SON MODULE, TESTE (66 assertions) : la reecrire ici en ferait une
 *    copie plus faible, sans ses quatre etats ni sa borne de fenetres ratees. */
import { scanFrais, verifierArrivee, resumerFrais } from './veille-frais.js';
import { NOS_BLOCKS_GENESE } from './origine.js';
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
/* tip 20260923-map-trending: rotate public Base RPCs — mainnet.base.org alone 413/rate-limits eth_getLogs (Map soleils die). */
/* tip 20260923-map-trending: only mainnet.base.org still serves free eth_getLogs (≤1k blocs). Others 413/HTML/plan. */
const RPC_LIST = (process.env.BASE_RPC || 'https://mainnet.base.org')
  .split(',').map((s) => s.trim()).filter(Boolean);
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
    return { ok: false, pourquoi: 'no Initialize found in the last ' + (fenetres * 2000) + ' blocks', balaye: fenetres * 2000 };
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
  const r = { ok: true, cles, balaye: fenetres * 2000 };
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

/* ⛔⛔ « NOS BLOCKS », CALCULE ICI ET PAS DANS LA PAGE (Phil, 2026-09-20 : « faut expandre depuis le
 *    debut »). Avant, la page scannait une fenetre FIXE de 20 000 blocs (~11 h) sans cache : un block
 *    cree par nous plus tot cessait d etre « a nous » sans aucune erreur a l ecran.
 * ⛔ PLANCHER VERIFIE SUR LA CHAINE, PAS RECITE : le Block 0 a ete mine au bloc 50861088
 *    (tx 0x925bbfbb3c6b90362aed9dbd09816f6c3548a30938913f65f8025c46d1541c92, code 0xef). Rien de nous
 *    ne peut etre anterieur, donc il est inutile de descendre plus bas.
 * ⛔ PLAGE CONTIGUE [depuis, jusqua] QUI N AVANCE QUE SUR UN SCAN PROPRE : une fenetre refusee par le
 *    noeud ne doit JAMAIS etre recouverte par un « deja lu ». Meme discipline que mesFrappes.
 * ⚠️ CACHE EN MEMOIRE : un redeploiement le vide et la couverture repart. C est DIT dans la reponse
 *    (depuis / jusqua / couvertureComplete), jamais masque. */
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
const nosBlocksEtat = { blocks: new Set(NOS_BLOCKS_GENESE), depuis: null, jusqua: null, ratees: 0, lu: null };
let nbEnCours = null;
async function etendreNosBlocks() {
  const fin = parseInt(await rpcServeur('eth_blockNumber', []), 16);
  let deBloc, aBloc;
  const f = prochaineFenetre({ fin, depuis: nosBlocksEtat.depuis, jusqua: nosBlocksEtat.jusqua,
    plancher: PREMIER_BLOCK_TB, pas: PAS_NOS_BLOCKS });
  if (!f) return; /* tout est couvert : plus rien a lire */
  deBloc = f.deBloc; aBloc = f.aBloc;
  /* ⛔ TOUS LES COMPTES, ET LES RATES DE CHACUN COMPTENT. Un seul compte qui echoue doit empecher la
   *    plage d avancer — sinon un trou serait recouvert par un « deja lu ». */
  let ratees = 0;
  for (const compte of NOS_CREATEURS) {
    const scan = await frappesVers({ rpc: rpcServeur, compte, deBloc, aBloc });
    for (const b of scan.blocks) nosBlocksEtat.blocks.add(String(b.jeton).toLowerCase());
    ratees += (scan.fenetresRatees || []).length;
  }
  const scan = { blocks: [], fenetresRatees: ratees ? [{ n: ratees }] : [] };
  /* ⛔ LES BLOCKS TROUVES SONT GARDES MEME SI UNE FENETRE A RATE : ils sont vrais. C est la PLAGE qui
   *    n avance pas, pas l ensemble. */
  for (const b of scan.blocks) nosBlocksEtat.blocks.add(String(b.jeton).toLowerCase());
  nosBlocksEtat.ratees = (scan.fenetresRatees || []).length;
  if (!nosBlocksEtat.ratees) {
    if (nosBlocksEtat.jusqua === null) { nosBlocksEtat.depuis = deBloc; nosBlocksEtat.jusqua = aBloc; }
    else if (aBloc === fin) nosBlocksEtat.jusqua = aBloc;
    else nosBlocksEtat.depuis = deBloc;
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
    const complet = nosBlocksEtat.depuis !== null && nosBlocksEtat.depuis <= PREMIER_BLOCK_TB;
    if (complet) {
      rattrapageArme = false;
      console.log('[nos-blocks] couverture complete jusqu au bloc ' + PREMIER_BLOCK_TB
        + ' · ' + nosBlocksEtat.blocks.size + ' block(s) a nous');
      return;
    }
    setTimeout(pas, 4000).unref?.();
  };
  setTimeout(pas, 1500).unref?.();
}
function nosBlocksCorps() {
  rattraperNosBlocks();
  return JSON.stringify({
    ok: true, lu: nosBlocksEtat.lu,
    blocks: [...nosBlocksEtat.blocks],
    depuis: nosBlocksEtat.depuis, jusqua: nosBlocksEtat.jusqua,
    plancher: PREMIER_BLOCK_TB,
    couvertureComplete: nosBlocksEtat.depuis !== null && nosBlocksEtat.depuis <= PREMIER_BLOCK_TB,
    fenetresRatees: nosBlocksEtat.ratees,
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
    return JSON.stringify({ ok: true, etat: 'NON_LU', jeton, lu: e.lu,
      pourquoi: 'a replay is running — balances are not publishable until it finishes' });
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
let blocsLusJusqua = null, trCache = { a: 0, corps: null }, trEnCours = null;
/* tip 20260923-map-trending: persist trending on volume so redeploy does not wipe Map soleils */
const FICHIER_TRENDING = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'trending-cache.json') : null;
const TRENDING_CACHE_VER = 'prebridge-v3'; /* bump to drop bad /data caches after RPC fenetre change */
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
    trCache = { a: Number(x.a) || 0, corps: x.corps }; /* a=0 → force refresh path still kicks background */
    for (const a of (x.adrs || [])) if (/^0x[0-9a-fA-F]{40}$/.test(a)) blocksConnus.add(a.toLowerCase());
    if (typeof x.blocsLusJusqua === 'number') blocsLusJusqua = x.blocsLusJusqua;
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
    console.log('[trending] scan done · creations=' + (cr.creations || []).length + ' · ratees=' + (cr.fenetresRatees || []).length + ' · connus=' + blocksConnus.size);
    /* advance if any creations read OR zero ratees; partial progress beats permanent hang */
    if (!(cr.fenetresRatees || []).length || (cr.creations || []).length) blocsLusJusqua = fin;
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
    corps = JSON.stringify({ ok: true, lu: new Date().toISOString(), blocksSuivis: adrs.length,
      fenetresRatees: (cr.fenetresRatees || []).length, lotsMarche: { ok: lotsOk, ko: lotsKo, statuts },
      ...resumerTrending(paires, adrs, { max: 400 }) }); /* tip 0038 : tous les blocks vivants pour la map (Trade en montre 40) */
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
  'chain_switch_ok', 'chain_switch_refus', 'pairer_clic',
  /* creation */
  'create_sign_propos', 'create_sign_refus', 'create_fund_bridge', 'create_go_bridge',
  'ib_preflight_ok', 'ib_preflight_fail', 'ib_balance_short',
  /* ⛔⛔ POURQUOI une creation echoue — mesure du 2026-09-23 : `cree` = 6, `cree_echec` = 8, et
   *     aucun moyen de savoir si ces 8 sont des refus polis dans le wallet ou des transactions qui
   *     revertent en brulant du gas. Les deux appellent des reponses OPPOSEES. Categories fermees
   *     produites par `causes-echec.js` ; `test-causes-echec.mjs` echoue si l une manque ici. */
  'cree_ko_refus', 'cree_ko_revert', 'cree_ko_envoi', 'cree_ko_reseau',
  'cree_ko_compte', 'cree_ko_attente', 'cree_ko_autre',
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
  'cree_refus_solde', 'cree_refus_lecture', 'cree_refus_frais', 'cree_refus_preparation',
  /* achat — l etape qui rapporte */
  /* ⛔ `achat_clic` = l INTENTION (clic sur Buy dans Market) · `achat_prepare` = on a passe les
   *   gardes et on prepare vraiment. Les deux partageaient le nom `achat_prepare` jusqu au
   *   2026-09-25, ce qui additionnait les deux bouts de l entonnoir et empechait d en calculer le
   *   taux. ⚠️ Les totaux d `achat_prepare` d avant ce build melangent les deux sens. */
  'achat_clic',
  'achat_prepare', 'achat_sign_propos', 'achat_sign_refus', 'achat_ok', 'marche_rescan_ok',
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
  /* ⛔⛔ OU MEURT LA MISE EN VIE. `cree`=6 / `vivant`=2 en production, et `vie_echec` ABSENT des
   *     totaux : les quatre blocks perdus sortaient par 19 portes qui ne comptaient rien. On compte
   *     desormais l ETAPE ATTEINTE — mourir a l etape 2 (les approbations) n appelle pas la meme
   *     reparation que mourir a l etape 1 (la lecture du marche). Cardinalite fermee : 4 valeurs. */
  'vie_ko_etape1', 'vie_ko_etape2', 'vie_ko_etape3', 'vie_ko_etape4',
  /* brain */
  'brain_bot_propose', 'brain_bot_journal', 'brain_bot_pay_recog',
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
      if (x && x.total && x.parJour) return x;
    }
  } catch (e) { console.log('[entonnoir] fichier illisible, on repart de zero :', e.message); }
  return { depuis: new Date().toISOString(), total: {}, parJour: {} };
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
  'visage.js', 'logo.js', 'faits.js', 'envoi.js', 'cerveau.js', 'metiers.js', 'frais-creation.js', 'prix-eth.js', 'messages.js', 'paires.js', 'face.js', 'lancer-pool.js', 'nourriture.js', 'apercu.js', 'mes-blocks.js', 'tokenized-bank.js', 'bridge.js', 'x402-pay.js', 'fil-live.js', 'achats.js', 'tokenomics.js', 'lancer-pool-v2.js', 'memoire-chaine.js', 'resume-tx.js', 'origine.js', 'echange.js', 'journal-cerveau.js', 'cerveau-echange.js', 'tweet-grave.js', 'liquidite.js', 'regles-cerveau.js', 'fragments-cerveau.js', 'parole-cerveaux.js', 'export-cerveau.js', 'brain-tasks.js', 'stades.js', 'pools-du-jeton.js', 'messagerie-blocks.js', 'relais-cerveaux.js', 'pnl-swaps.js', 'openlaunch.js', 'openlaunch-launch.js', 'map3d.js', 'trending.js', 'locker.js', 'tirage.js', 'cube3d.js', 'groupe-wallet.js', 'causes-echec.js', 'verif-paiement.js',
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
  const m = /data-build="([0-9A-Za-z_-]{6,40})"/.exec(e.corps.toString('utf8').slice(0, 200000));
  return m ? m[1] : null;
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
   * remettrait exactement le probleme qu on vient de fuir. */
  'cache-control': e.image ? 'public, max-age=86400' : 'no-store, max-age=0',
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
  if (chemin === '/api/prix-usd') {
    const adr = String(new URL(req.url, 'http://x').searchParams.get('adr') || '').toLowerCase();
    const admise = pairesProposees(8453).some((p) => ['STABLE', 'MAJEUR', 'ACTION'].includes(p.type) && p.adr.toLowerCase() === adr);
    const repondre = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (!admise) { repondre({ ok: false, pourquoi: 'not a pair currency of this app' }); return; }
    const c = prixUsdCache.get(adr);
    if (c && Date.now() - c.t < 300000) { repondre(c.r); return; }
    fetch('https://api.dexscreener.com/tokens/v1/base/' + adr, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } })
      .then((x) => (x.ok ? x.json() : Promise.reject(new Error('HTTP ' + x.status))))
      .then((j) => {
        const p = (Array.isArray(j) ? j : []).filter((x) => String(x.baseToken && x.baseToken.address).toLowerCase() === adr)
          .sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))[0];
        const prix = p ? Number(p.priceUsd) : NaN, liq = p && p.liquidity ? Number(p.liquidity.usd) : 0;
        const r = prix > 0 && Number.isFinite(prix) && liq >= 10000
          ? { ok: true, prixUsd: prix, liquiditeUsd: liq, source: 'dexscreener', lu: new Date().toISOString() }
          : { ok: false, pourquoi: 'no liquid enough market read' };
        if (r.ok) prixUsdCache.set(adr, { t: Date.now(), r });
        repondre(r);
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

  /* la vraie cle de pool d un block : /api/cle/0x… — lue sur la chaine, jamais devinee */
  if (chemin.startsWith('/api/cle/')) {
    const token = chemin.slice('/api/cle/'.length);
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) {
      res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: 'whole address required' }));
      return;
    }
    resoudreClePool(token).then((r) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(r));
    }).catch((e) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: 'pool key not read: ' + String(e.message || e).slice(0, 120) }));
    });
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
  if (chemin === '/api/onramp/session') {
    const q = new URL(req.url, 'http://x').searchParams;
    const demande = validerDemande({ adresse: q.get('adresse'), actif: q.get('actif'),
      montantFiat: q.get('montant') });
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
        const u = urlOnramp({ sessionToken: s.sessionToken, actif: demande.actif,
          montantFiat: demande.montantFiat, retour: 'https://tokenizedblock.space/' });
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
    const e = new URL(req.url, 'http://x').searchParams.get('e') || '';
    if (ETAPES_ENTONNOIR.includes(e)) {
      const jour = new Date().toISOString().slice(0, 10);
      entonnoir.total[e] = (entonnoir.total[e] || 0) + 1;
      entonnoir.parJour[jour] = entonnoir.parJour[jour] || {};
      entonnoir.parJour[jour][e] = (entonnoir.parJour[jour][e] || 0) + 1;
      entonnoirSale = true;
      console.log('[entonnoir]', jour, e);
    }
    res.writeHead(204, { 'cache-control': 'no-store' });
    res.end();
    return;
  }
  if (chemin === '/api/entonnoir') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, persistant: !!FICHIER_ENTONNOIR, depuis: entonnoir.depuis, etapes: ETAPES_ENTONNOIR, total: entonnoir.total, parJour: entonnoir.parJour }));
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
    res.end(JSON.stringify({ ok, servis: cache.size, racine: RACINE, build: buildServi(), ...(ok ? {} : { modulesManquants }) }));
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
});
