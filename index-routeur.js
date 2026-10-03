/* index-routeur.js — QUELS BLOCKS SONT NES DU CreateRouter ? (2026-10-03, decision Phil 00:20, spec Claude 00:27)
 * ⛔⛔ Seuls les VRAIS blocks TB sont restreints au routage (R4, sans-hook, hook tiers, jonction) ; les B20 des autres
 *     launchpads (PEXRA, …) restent echangeables sur leurs pools, frais routeur en ETH/USDC. Ce module ne decide RIEN de
 *     l AFFICHAGE (carte, fil, profils, listes) : il ne sert qu au classement de ROUTAGE (pool-sans-hook.js).
 * ⛔ PROVENANCE = MEME FORMULE QUE LE HOOK 7030 (`neDuRouteur`, TBlockLaunchLockHook.sol) : la factory B20 derive l adresse
 *     de (deployer, salt) seuls — 0xb2, dix octets nuls, puis les 9 premiers octets de keccak256(abi.encode(CreateRouter, sel)) ;
 *     createPaid passe le sel du createur tel quel. Arithmetique pure, synchrone.
 * ⛔ L APP N A PAS LE SEL D UNE ADRESSE QUELCONQUE : l INDEX est construit par le SERVEUR depuis l historique createPaid
 *     (log B20Created -> transaction -> to == CreateRouter, selecteur createPaid -> sel -> neDuRouteur verifie), servi par
 *     /api/blocks-routeur et tenu a jour. Graine : les 7 createPaid de mainnet, adresses ET sels lus on-chain (2026-10-03,
 *     7/7 egaux a la formule ; liste des transactions du routeur complete a la lecture, 9 tx dont 7 createPaid reussis).
 * ⛔⛔ R8 (C2, KO R6 ; decision Raksha) : LOGIQUE INVERSEE. Par defaut tout B20 non devise est un block (R5). Cet index ne
 *     sert plus qu a RESSERRER (un signal TB de plus) et a ouvrir la porte de LIBERATION des jetons tiers (pool-sans-hook.js) :
 *     un jeton tiers n est libere que si TOUTES les sources TB sont lues (cet index ET /api/nos-blocks). Un index faux, vide,
 *     perime ou illisible ne peut que GARDER un jeton tiers bloque ; il ne libere jamais un block TB.
 * ⛔ createPaid peut arriver par un contrat (EntryPoint 4337, smart wallet) : le sel est cherche partout dans l input (R7).
 *     Les anciens routeurs 0xd0a6 / 0x3486 (2026-09-14/15) : meme formule avec leur adresse ; 2 blocks nes de 0xd0a6. */
import { keccak256 } from './keccak.js';
import { CREATE_ROUTER } from './frais-creation.js';

const bas = (a) => String(a || '').toLowerCase();
export const SELECTEUR_CREATE_PAID = '0x1d03fb54'; /* createPaid(uint8,bytes32,bytes,bytes[],address) */
export const FACTORY_B20 = '0xb20f000000000000000000000000000000000000';
export const TOPIC_B20_CREATED = '0xfd9bf2730513a1709722ff379a0844dfd8f997d600693c2bcc659e188bbdba0d';
/** Retard maximal de l index servi (blocs, ~1 h a 2 s) au-dela duquel il n est plus « LU ». */
export const RETARD_MAX_INDEX = 1800;

function octets(hex) {
  const h = String(hex).replace(/^0x/, '');
  return Uint8Array.from(h.match(/../g) || [], (b) => parseInt(b, 16));
}
/** L adresse qu un createPaid de sel `sel` (bytes32 hex) fait naitre. */
export function adresseNeeDuRouteur(sel, routeur = CREATE_ROUTER) {
  const s = bas(sel).replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(s)) return null;
  const h = [...keccak256(octets('0'.repeat(24) + bas(routeur).slice(2) + s))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return '0xb2' + '0'.repeat(20) + h.slice(0, 18);
}
/** Meme fonction que TBlockLaunchLockHook.neDuRouteur(bloc, sel). */
export function neDuRouteur(bloc, sel, routeur = CREATE_ROUTER) {
  const a = adresseNeeDuRouteur(sel, routeur);
  return !!a && a === bas(bloc);
}

/* Graine lue on-chain (eth_getTransactionByHash + recu ; fix-r4-logs/r6/createpaid-mainnet.json). */
/* R8 : les anciens routeurs du depot (9d75ccb 0xd0a6, 2026-09-14 ; fb259cb..8f6461c 0x3486). Meme formule, leur adresse. */
export const ROUTEURS_ANCIENS = Object.freeze(['0xd0a69ca617ceedcf66329802ce9d462347f1f148', '0x34862ff4e76330e55853a371fc245f55f60bff0a']);
/* Les 2 createPaid de 0xd0a6 (scan C2 de tous les B20Created depuis le Block 0 ; relus on-chain, statut 1, formule = log ;
 *   fix-r4-logs/r8/verif-anciens.json). 0x3486 : 0 creation. Avant PLANCHER_ROUTEUR, donc graine statique. */
export const GRAINE_ANCIENS_ROUTEURS = Object.freeze([
  { jeton: '0xb200000000000000000000407ee1732664dc8028', sel: '0x6b3303ae574df6d30dd0c31638d84224b364a79c6f2d2f7473da6fb4d0e68893', routeur: '0xd0a69ca617ceedcf66329802ce9d462347f1f148', bloc: 51314358, tx: '0x4a994e22dcda9b7460eb0c21c06fcfead02430367a9fd6573d9b592702ffab23' },
  { jeton: '0xb200000000000000000000dae0212b61be4c49bb', sel: '0x9307e0d12e4cab76b03fe9c70d8746d6aa84bd0b29baf75b7a3bbc8c31bca0fe', routeur: '0xd0a69ca617ceedcf66329802ce9d462347f1f148', bloc: 51314670, tx: '0x92873578c67954c822d4186d3173aa3750bd102c24480d328af245c5f14edb74' },
].map((g) => Object.freeze(g)));
const ROUTEURS_TOUS = [bas(CREATE_ROUTER), ...ROUTEURS_ANCIENS];
/** Le sel redonne-t-il ce jeton par la formule d un de NOS routeurs (actuel ou ancien) ? */
function neDUnDeNosRouteurs(jeton, sel, routeur = null) {
  return (routeur ? [bas(routeur)].filter((r) => ROUTEURS_TOUS.includes(r)) : ROUTEURS_TOUS).some((r) => neDuRouteur(jeton, sel, r));
}
export const GRAINE_ROUTEUR = Object.freeze([
  { jeton: '0xb20000000000000000000005090fb1d9da0e5949', sel: '0x68164f47865e6fc6476fbd9baa0bb5726b28d4cc9fef0bfa196ef4fe5adad640', bloc: 51998292, tx: '0xc222326ce21164b7c0a3ea03593cce2ffe84fa2a6a76115eadb593ed0aaf3c5f' },
  { jeton: '0xb200000000000000000000e7e9db76e8234f8f56', sel: '0x3ee0affb2bee9c1325f08b9feda54edeb71b86e8cc0b54a04fa71542b9be310d', bloc: 51955173, tx: '0x7ec40e5e8f1acb43604569db03bac3c6f3749f84c493e5421749aea9298f5278' },
  { jeton: '0xb2000000000000000000005113f47a963ebdc45c', sel: '0x70a846e93d7546e722313fa314ec88a8109f21b192b679da4a062595a2455abf', bloc: 51693323, tx: '0x737c5238b2cc8f3ca0724ab83710043d6c5a49fe1e06ddc7d5d2353af3a71967' },
  { jeton: '0xb200000000000000000000baa5356bfc210cc30a', sel: '0x01beda30879562e3f9ef866ef76f9216b7a0edd18e1a78ebfbd07ada4a8a6b5e', bloc: 51660080, tx: '0x1490c139dca6ebbe879d47eaf37558d5b32235434c36830aff9939a46bfaa46d' },
  { jeton: '0xb200000000000000000000df3ffcd9be89b3843c', sel: '0xbdb93b5d73a9877426bb2d5ad0c6e57bba2241b09c57360b33185a7784640485', bloc: 51359874, tx: '0x5f7e6a6bd653488336d266efe602901e6bcd4f74129f033fe064385943f79dbc' },
  { jeton: '0xb20000000000000000000072eb43b8db1029b7d9', sel: '0x59effef68caf2a5587b3796c33e1f762675227549c79ecde5f76542f800890a0', bloc: 51358276, tx: '0xb1b9bbc432f698300e1f085d2049247606fec8ccc9b40641bc2a415b0aaa77ac' },
  { jeton: '0xb200000000000000000000913c2d82ea435eb2aa', sel: '0xbbd23100cdd16acf3c890b5cea9cf7f374e468e7606215955134275293a848c4', bloc: 51356384, tx: '0x77b03fb923528b5d6b85fe45e3472dd7add1307a79c0f7904c86436d0e83caba' },
  /* R7 (Zero 1, K1) : createPaid passe par l EntryPoint ERC-4337 0x5ff137d4…2789 (smart wallet) — tx.to n est pas le routeur.
   *   Relu sur la chaine : statut 1, sel present dans l input, formule = log B20Created (fix-r4-logs/r7/scan-hooks.json). */
  { jeton: '0xb200000000000000000000e63ffc3f40bf92a042', sel: '0xaf653605fa93e0a42485f4839122b166d81c448c87e094847fc9de2f3020c27a', bloc: 51692885, tx: '0x6fee4932a982df3f6444dde424a7cb7afc838db7e074b4af930b57c473f00dba' },
].map((g) => Object.freeze(g)));
/** Plancher du balayage serveur (premier bloc ou le CreateRouter a du code) et borne haute couverte par la graine. */
export const PLANCHER_ROUTEUR = 51354834;
export const GRAINE_JUSQUA = 52095000;

/* ── ETAT COTE APP (synchrone) ───────────────────────────────────────────────────────────────────────────────────── */
/* Une entree de graine dont la formule ne tombe pas juste n entre pas : une faute de recopie ne cree pas un block TB. */
const nes = new Set([...GRAINE_ROUTEUR.filter((g) => neDuRouteur(g.jeton, g.sel)),
  ...GRAINE_ANCIENS_ROUTEURS.filter((g) => neDUnDeNosRouteurs(g.jeton, g.sel, g.routeur))].map((g) => g.jeton));
/* ⛔⛔ 2026-10-03 — LE SEL ETAIT LU PUIS JETE. Chaque entree (graine, index servi, block qu on vient de creer) arrive avec son sel,
 *   prouve par la formule, et on n en gardait que l adresse. Or le hook 7030 exige ce sel a l inscription : sans lui il facture
 *   fraisVie + fraisCreation (0,001 ETH) au lieu de fraisVie (0,0003) — l Instant Birth revertait MontantInsuffisant et la mise
 *   en vie d un block deja cree aurait coute 0,0017. Seuls les sels du routeur ACTUEL entrent : c est celui que le hook connait
 *   (createRouter() lu on-chain = CREATE_ROUTER). */
const sels = new Map(GRAINE_ROUTEUR.filter((g) => neDuRouteur(g.jeton, g.sel)).map((g) => [bas(g.jeton), bas(g.sel)]));
let etat = { lu: false, pourquoi: 'index not loaded yet', jusqua: null };
/** Le sel de createPaid d un block ne du routeur ACTUEL (graine, index servi, ou block cree dans cette session), sinon null. */
export function selDuRouteur(adr) { return sels.get(bas(adr)) || null; }
/** Cherche dans l input d une transaction le sel qui redonne `jeton` par le routeur actuel : createPaid direct, sinon tout mot
 *  de 32 octets a tout decalage de 4 octets (smart wallet, 4337 — meme balayage que scannerNesDuRouteur). null si aucun. */
export function selDansInput(jeton, input) {
  const direct = selDeCreatePaid(input);
  if (direct && neDuRouteur(jeton, direct)) return direct;
  const inp = bas(input).replace(/^0x/, '');
  for (let off = 0; off < 64; off += 8) for (let k = off; k + 64 <= inp.length; k += 64) { const w = '0x' + inp.slice(k, k + 64); if (neDuRouteur(jeton, w)) return w; }
  return null;
}
/** Fraicheur maximale de la tete lue par le serveur (ms) : au-dela, l index n est plus « LU » (tete figee = R6-3). */
export const FRAICHEUR_MAX_TETE_MS = 10 * 60 * 1000;

/** Vrai = ce jeton est ne du CreateRouter (graine ou index servi). */
export function estNeDuRouteur(adr) { return nes.has(bas(adr)); }
/** Vrai = l index servi est LU (couverture complete, a jour). Faux = fail-closed pour les B20 non classes. */
export function indexRouteurLu() { return etat.lu === true; }
export function etatIndexRouteur() { return { ...etat, taille: nes.size }; }
/**
 * Charge la reponse de /api/blocks-routeur. Chaque entree doit porter son SEL et passer neDuRouteur ; une entree qui ne
 * passe pas est ignoree ET comptee. L index n est LU que si ok, couverture complete, aucune fenetre ratee, retard borne.
 * ⛔ ON UNIT, ON N ECRASE JAMAIS : une lecture qui echoue ne retire aucun block deja prouve.
 */
export function chargerIndexRouteur(rep, maintenantMs = Date.now()) {
  let rejetes = 0;
  const liste = rep && Array.isArray(rep.blocks) ? rep.blocks : [];
  for (const b of liste) {
    if (b && neDUnDeNosRouteurs(b.jeton, b.sel, b.routeur || null)) {
      nes.add(bas(b.jeton));
      if (neDuRouteur(b.jeton, b.sel)) sels.set(bas(b.jeton), bas(b.sel));
    } else rejetes += 1;
  }
  const retard = rep && Number.isFinite(rep.tete) && Number.isFinite(rep.jusqua) ? rep.tete - rep.jusqua : Infinity;
  /* R8 (C2 R6-3) : une liste vide ou amputee « complete » n est pas lue (le serveur sert toujours la graine) ; une tete
   *   figee (eth_blockNumber en echec cote serveur) n est pas lue non plus (teteLueA, horloge murale). */
  const servis = new Set(liste.map((b) => bas(b && b.jeton)));
  const graineServie = GRAINE_ROUTEUR.every((g) => servis.has(g.jeton));
  const teteFraiche = !!rep && Number.isFinite(rep.teteLueA) && Math.abs(maintenantMs - rep.teteLueA) <= FRAICHEUR_MAX_TETE_MS;
  const lu = !!rep && rep.ok === true && rep.couvertureComplete === true && !rep.fenetresRatees && retard <= RETARD_MAX_INDEX
    && graineServie && teteFraiche && rejetes === 0;
  etat = { lu, jusqua: rep && Number.isFinite(rep.jusqua) ? rep.jusqua : null, rejetes,
    pourquoi: lu ? null : (!rep || rep.ok !== true ? 'index not served' : rep.couvertureComplete !== true ? 'index coverage incomplete'
      : rep.fenetresRatees ? 'index windows failed' : retard > RETARD_MAX_INDEX ? 'index behind the chain head'
        : !graineServie ? 'index list incomplete' : !teteFraiche ? 'index head stale' : 'index entries rejected') };
  return etatIndexRouteur();
}
/** Le serveur n a pas pu etre lu : l etat repasse NON LU (les blocks deja prouves restent). */
export function indexRouteurIllisible(pourquoi = 'index could not be read') { etat = { ...etat, lu: false, pourquoi }; }
/** L app qui vient de creer un block connait son sel : elle peut l ajouter (prouve) sans attendre le serveur. */
export function ajouterNeDuRouteur(jeton, sel) { if (!neDuRouteur(jeton, sel)) return false; nes.add(bas(jeton)); sels.set(bas(jeton), bas(sel)); return true; }

/* ── R8 : /api/nos-blocks (blocks frappes par nos comptes surveilles) — une SOURCE TB de plus, lue pour resserrer ─────────── */
const nosServis = new Set();
let etatNos = { lu: false, pourquoi: 'our blocks not loaded yet' };
/** Vrai = ce jeton est dans /api/nos-blocks (deja lu). */
export function estNotreBlockServi(adr) { return nosServis.has(bas(adr)); }
export function nosBlocksTbLus() { return etatNos.lu === true; }
/** Charge /api/nos-blocks pour le ROUTAGE (union, jamais d ecrasement). Lu = ok, couverture complete, 0 fenetre ratee, liste non vide,
 *  ET (F1, C2 R9b) meme borne que l index du routeur : retard tete - jusqua <= RETARD_MAX_INDEX, tete lue il y a <= 10 min, et
 *  jamais une fenetre en attente au-dela de cette borne. */
export function chargerNosBlocksTb(rep, maintenantMs = Date.now()) {
  const liste = rep && Array.isArray(rep.blocks) ? rep.blocks : [];
  for (const b of liste) if (/^0x[0-9a-f]{40}$/.test(bas(b))) nosServis.add(bas(b));
  const lu = !!rep && rep.ok === true && rep.couvertureComplete === true && !rep.fenetresRatees && liste.length > 0;
  const retard = rep && Number.isFinite(rep.tete) && Number.isFinite(rep.jusqua) ? rep.tete - rep.jusqua : Infinity;
  const teteFraiche = !!rep && Number.isFinite(rep.teteLueA) && Math.abs(maintenantMs - rep.teteLueA) <= FRAICHEUR_MAX_TETE_MS;
  const attenteTropLoin = !!rep && Number(rep.fenetresEnAttente) > 0 && retard > RETARD_MAX_INDEX;
  const aJour = retard <= RETARD_MAX_INDEX && teteFraiche && !attenteTropLoin;
  etatNos = { lu: lu && aJour, pourquoi: lu && aJour ? null : !lu ? 'our blocks list not complete'
    : attenteTropLoin ? 'our blocks: a window is pending beyond the lag bound' : retard > RETARD_MAX_INDEX ? 'our blocks behind the chain head'
      : 'our blocks head stale' };
  return { ...etatNos, taille: nosServis.size };
}
export function nosBlocksTbIllisibles(pourquoi = 'our blocks could not be read') { etatNos = { lu: false, pourquoi }; }
/** Toutes les sources TB servies sont-elles lues ? Sinon AUCUN jeton tiers n est libere (pool-sans-hook.js). */
export function sourcesTbLues() { return indexRouteurLu() && nosBlocksTbLus(); }

/* ── BALAYAGE COTE SERVEUR (lecture seule) ───────────────────────────────────────────────────────────────────────── */
/** Le sel d un appel createPaid (mot 1 apres le selecteur), ou null si ce n est pas un createPaid. */
export function selDeCreatePaid(input) {
  const s = bas(input);
  if (!s.startsWith(SELECTEUR_CREATE_PAID) || s.length < 10 + 128) return null;
  return '0x' + s.slice(10 + 64, 10 + 128);
}
/**
 * Lit [deBloc, aBloc] par fenetres de `pas` : logs B20Created de la factory, puis chaque transaction ; garde le jeton si un
 * mot de l input (createPaid direct, ou appel via un contrat : 4337, smart wallet) redonne son adresse (neDuRouteur). Les fenetres et les
 * transactions ratees sont COMPTEES (`fenetresRatees`) : la plage ne doit pas avancer sur un trou.
 */
export async function scannerNesDuRouteur({ rpc, deBloc, aBloc, pas = 1000, routeur = CREATE_ROUTER }) {
  const hex = (n) => '0x' + n.toString(16);
  const blocks = [];
  let fenetresRatees = 0;
  for (let a = deBloc; a <= aBloc; a += pas) {
    const b = Math.min(aBloc, a + pas - 1);
    let logs;
    try { logs = await rpc('eth_getLogs', [{ address: FACTORY_B20, topics: [TOPIC_B20_CREATED], fromBlock: hex(a), toBlock: hex(b) }]); }
    catch { fenetresRatees += 1; continue; }
    const parTx = new Map();
    for (const l of logs || []) {
      if (bas(l.address) !== FACTORY_B20 || bas((l.topics || [])[0]) !== TOPIC_B20_CREATED) continue;
      if (!parTx.has(l.transactionHash)) parTx.set(l.transactionHash, []);
      parTx.get(l.transactionHash).push({ jeton: bas('0x' + String(l.topics[1]).slice(26)), bloc: parseInt(l.blockNumber, 16) });
    }
    for (const [h, crees] of parTx) {
      let tx;
      try { tx = await rpc('eth_getTransactionByHash', [h]); } catch { fenetresRatees += 1; continue; }
      if (!tx) { fenetresRatees += 1; continue; }
      /* ⛔ R7 (Zero 1, K1) : createPaid peut arriver par un contrat (EntryPoint ERC-4337, smart wallet, multicall) : tx.to
       *   n est alors PAS le routeur. On cherche le sel partout dans l input (mots de 32 octets, a tout decalage de 4 octets) ;
       *   la formule CREATE2 le prouve (pas de faux positif). */
      const direct = bas(tx.to) === bas(routeur) ? selDeCreatePaid(tx.input) : null;
      const inp = bas(tx.input).replace(/^0x/, '');
      for (const c of crees) {
        let sel = direct && neDuRouteur(c.jeton, direct, routeur) ? direct : null, par = sel ? bas(routeur) : null;
        const routeurs = [bas(routeur), ...ROUTEURS_ANCIENS.filter((r) => r !== bas(routeur))];
        for (let off = 0; !sel && off < 64; off += 8) for (let k = off; !sel && k + 64 <= inp.length; k += 64) { const w = '0x' + inp.slice(k, k + 64); for (const r of routeurs) if (!sel && neDuRouteur(c.jeton, w, r)) { sel = w; par = r; } }
        if (sel) blocks.push(par === bas(routeur) ? { jeton: c.jeton, sel, bloc: c.bloc, tx: h } : { jeton: c.jeton, sel, routeur: par, bloc: c.bloc, tx: h });
      }
    }
  }
  return { blocks, fenetresRatees };
}
