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
 * ⛔ UN INDEX ILLISIBLE NE VEUT PAS DIRE « PAS TB » : tant qu il n est pas LU (pas charge, reponse en echec, couverture
 *     incomplete ou en retard), un B20 qu on ne sait pas classer est traite en block (fail-closed) — ce qui ne refuse que
 *     ses pools SANS hook TB (pool-sans-hook.js). Un B20 sur un de NOS hooks est TB de toute facon (regle (c)).
 * ⛔ Limite dite : un createPaid appele DEPUIS un contrat (tx.to != CreateRouter) n est pas vu (pas de trace). L app appelle
 *     createPaid en transaction directe. */
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
export const GRAINE_ROUTEUR = Object.freeze([
  { jeton: '0xb20000000000000000000005090fb1d9da0e5949', sel: '0x68164f47865e6fc6476fbd9baa0bb5726b28d4cc9fef0bfa196ef4fe5adad640', bloc: 51998292, tx: '0xc222326ce21164b7c0a3ea03593cce2ffe84fa2a6a76115eadb593ed0aaf3c5f' },
  { jeton: '0xb200000000000000000000e7e9db76e8234f8f56', sel: '0x3ee0affb2bee9c1325f08b9feda54edeb71b86e8cc0b54a04fa71542b9be310d', bloc: 51955173, tx: '0x7ec40e5e8f1acb43604569db03bac3c6f3749f84c493e5421749aea9298f5278' },
  { jeton: '0xb2000000000000000000005113f47a963ebdc45c', sel: '0x70a846e93d7546e722313fa314ec88a8109f21b192b679da4a062595a2455abf', bloc: 51693323, tx: '0x737c5238b2cc8f3ca0724ab83710043d6c5a49fe1e06ddc7d5d2353af3a71967' },
  { jeton: '0xb200000000000000000000baa5356bfc210cc30a', sel: '0x01beda30879562e3f9ef866ef76f9216b7a0edd18e1a78ebfbd07ada4a8a6b5e', bloc: 51660080, tx: '0x1490c139dca6ebbe879d47eaf37558d5b32235434c36830aff9939a46bfaa46d' },
  { jeton: '0xb200000000000000000000df3ffcd9be89b3843c', sel: '0xbdb93b5d73a9877426bb2d5ad0c6e57bba2241b09c57360b33185a7784640485', bloc: 51359874, tx: '0x5f7e6a6bd653488336d266efe602901e6bcd4f74129f033fe064385943f79dbc' },
  { jeton: '0xb20000000000000000000072eb43b8db1029b7d9', sel: '0x59effef68caf2a5587b3796c33e1f762675227549c79ecde5f76542f800890a0', bloc: 51358276, tx: '0xb1b9bbc432f698300e1f085d2049247606fec8ccc9b40641bc2a415b0aaa77ac' },
  { jeton: '0xb200000000000000000000913c2d82ea435eb2aa', sel: '0xbbd23100cdd16acf3c890b5cea9cf7f374e468e7606215955134275293a848c4', bloc: 51356384, tx: '0x77b03fb923528b5d6b85fe45e3472dd7add1307a79c0f7904c86436d0e83caba' },
].map((g) => Object.freeze(g)));
/** Plancher du balayage serveur (premier bloc ou le CreateRouter a du code) et borne haute couverte par la graine. */
export const PLANCHER_ROUTEUR = 51354834;
export const GRAINE_JUSQUA = 52095000;

/* ── ETAT COTE APP (synchrone) ───────────────────────────────────────────────────────────────────────────────────── */
/* Une entree de graine dont la formule ne tombe pas juste n entre pas : une faute de recopie ne cree pas un block TB. */
const nes = new Set(GRAINE_ROUTEUR.filter((g) => neDuRouteur(g.jeton, g.sel)).map((g) => g.jeton));
let etat = { lu: false, pourquoi: 'index not loaded yet', jusqua: null };

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
export function chargerIndexRouteur(rep) {
  let rejetes = 0;
  const liste = rep && Array.isArray(rep.blocks) ? rep.blocks : [];
  for (const b of liste) {
    if (b && neDuRouteur(b.jeton, b.sel)) nes.add(bas(b.jeton)); else rejetes += 1;
  }
  const retard = rep && Number.isFinite(rep.tete) && Number.isFinite(rep.jusqua) ? rep.tete - rep.jusqua : Infinity;
  const lu = !!rep && rep.ok === true && rep.couvertureComplete === true && !rep.fenetresRatees && retard <= RETARD_MAX_INDEX;
  etat = { lu, jusqua: rep && Number.isFinite(rep.jusqua) ? rep.jusqua : null, rejetes,
    pourquoi: lu ? null : (!rep || rep.ok !== true ? 'index not served' : rep.couvertureComplete !== true ? 'index coverage incomplete'
      : rep.fenetresRatees ? 'index windows failed' : 'index behind the chain head') };
  return etatIndexRouteur();
}
/** Le serveur n a pas pu etre lu : l etat repasse NON LU (les blocks deja prouves restent). */
export function indexRouteurIllisible(pourquoi = 'index could not be read') { etat = { ...etat, lu: false, pourquoi }; }
/** L app qui vient de creer un block connait son sel : elle peut l ajouter (prouve) sans attendre le serveur. */
export function ajouterNeDuRouteur(jeton, sel) { if (!neDuRouteur(jeton, sel)) return false; nes.add(bas(jeton)); return true; }

/* ── BALAYAGE COTE SERVEUR (lecture seule) ───────────────────────────────────────────────────────────────────────── */
/** Le sel d un appel createPaid (mot 1 apres le selecteur), ou null si ce n est pas un createPaid. */
export function selDeCreatePaid(input) {
  const s = bas(input);
  if (!s.startsWith(SELECTEUR_CREATE_PAID) || s.length < 10 + 128) return null;
  return '0x' + s.slice(10 + 64, 10 + 128);
}
/**
 * Lit [deBloc, aBloc] par fenetres de `pas` : logs B20Created de la factory, puis chaque transaction ; garde celles dont
 * to == CreateRouter, selecteur createPaid, et dont le sel redonne l adresse du log (neDuRouteur). Les fenetres et les
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
      if (bas(tx.to) !== bas(routeur)) continue;
      const sel = selDeCreatePaid(tx.input);
      if (!sel) continue;
      for (const c of crees) if (neDuRouteur(c.jeton, sel, routeur)) blocks.push({ jeton: c.jeton, sel, bloc: c.bloc, tx: h });
    }
  }
  return { blocks, fenetresRatees };
}
