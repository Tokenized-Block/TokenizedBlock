/* ══ 2026-10-02 — REGLE DU FONDATEUR (13:27) : AUCUNE POOL SANS HOOK POUR UN BLOCK TokenizedBlock ═════════════════════
 * ⛔⛔ Le routage de l app (cotations, achat, vente, pont, sortie de route) ne choisit JAMAIS une pool dont `hooks` vaut
 *     0x0 quand un block TokenizedBlock en est une des deux devises. C est une regle de ROUTAGE, pas d affichage :
 *     aucun libelle, aucun badge, aucun avertissement ne la montre a l ecran. Le message de refus reste generique.
 *   · Un block TB = TBLOCK, TBGAS, ou le jeton B20 (0xb2…) echange par l appelant (`blocks`) — sauf s il est une devise de base
 *     (ETH, USDC, cbBTC, actions Coinbase…) : une jambe ETH→USDC hors hook (pont) n est pas une pool de block.
 *   · Exception unique : le format OpenLaunch (frais 3 %, espacement 200) — pools partenaires, hors de notre perimetre.
 *   Fait mesure (fork 52074517) : TBLOCK n a AUCUNE pool ETH avec hook ; sa seule pool ETH (frais 0, espacement 200)
 *   est sans hook — elle n est donc plus jamais choisie, et ce qui en dependait est refuse avant le wallet. */
import { TBLOCK, TBGAS, HOOK_PREVU, deviseFraisHook, estNotreHook } from './tokenomics.js';
import { REFERENT_O1_ACTIF, estHookO1Standard } from './referent-o1.js';
import { estHookMarcheOuvert } from './marche-ouvert.js';
import { DEVISES_BASE, ACTIONS_COINBASE } from './paires.js';
import { estNeDuRouteur, indexRouteurLu } from './index-routeur.js';

const bas = (a) => String(a || '').toLowerCase();
const ZERO = '0x0000000000000000000000000000000000000000';
const BLOCKS_TB = new Set([bas(TBLOCK), bas(TBGAS)]);
const DEVISES = new Set([ZERO, ...DEVISES_BASE.map((d) => bas(d.adr)), ...ACTIONS_COINBASE.map((d) => bas(d.adr))]
  .filter((a) => !BLOCKS_TB.has(a)));

export const MESSAGE_SANS_POOL = 'this block has no market the app can trade on right now — nothing was sent';

/** Vrai = devise CONNUE et vendable (ETH, devises de base hors TBLOCK/TBGAS, actions Coinbase). Tout autre
 *  jeton — un block en particulier — n en est pas une. */
export function estDeviseConnue(adr) {
  return DEVISES.has(bas(adr));
}
/** Vrai = ce jeton est un BLOCK pour une route multi-sauts (2026-10-02, fix R4) : ni devise connue, ni devise dont
 *  l appelant a lu le prix (`fraisDevisesOk`). ⛔ Un B20 (0xb2…) qui n est pas une devise connue reste un block MEME
 *  prixe : app.html met dans `fraisDevisesOk` les blocks lus avec prix et liquidite. Sans `fraisDevisesOk` : tout jeton
 *  inconnu est un block (fail-closed). */
export function estBlockDeRoute(adr, fraisDevisesOk = null, cles = []) {
  const a = bas(adr);
  /* ⛔ 2026-10-03 (Phil 00:20) : un B20 n est un block que s il est TB (classeBlock) ; un B20 d un autre launchpad, non. */
  return !pasUnBlockConnu(a) && (estBlockTbClasse(a, cles) || (!RE_B20.test(a) && !(fraisDevisesOk instanceof Set && fraisDevisesOk.has(a))));
}
/* ⛔⛔ 2026-10-02 (Zero 1, R4 item 2) : « B20 » = 0xb2 SUIVI DE 20 ZEROS, pas le seul prefixe 0xb2 (70 pools V3/Aerodrome et
 *   192 V4 de jetons ordinaires 0xb2… etaient refusees a tort). Une devise ou une action CONNUE du registre (OUSD, HTZc, PFEc,
 *   PMc, GMEc… — B20 elles aussi, ajoutees par 56878eb) n est jamais un block. */
export const RE_B20 = /^0xb20{20}/i;
function pasUnBlockConnu(a) { return estDeviseConnue(a); }
export function cleSansHook(cle) {
  return !!cle && /^0x0{40}$/i.test(String(cle.hooks || ZERO));
}
export function estBlockTb(adr, blocks = [], cles = []) {
  const a = bas(adr);
  if (!/^0x[0-9a-f]{40}$/.test(a)) return false;
  if (BLOCKS_TB.has(a)) return true;
  /* un block = un block TB (classeBlock, 2026-10-03) echange par l appelant ; un B20 d un autre launchpad ou un memecoin
   * hors B20 n est pas concerne par la regle */
  return blocks.map(bas).includes(a) && estBlockTbClasse(a, cles);
}
export function formatOpenLaunch(cle) {
  return Number(cle.fee) === 30000 && Number(cle.tickSpacing) === 200;
}
/** Vrai = cette cle est INTERDITE au routage (pool sans hook avec un block TB dedans). */
export function poolSansHookInterdite(cle, blocks = [], cles = [cle]) {
  if (!cleSansHook(cle) || formatOpenLaunch(cle)) return false;
  return estBlockTb(cle.currency0, blocks, cles) || estBlockTb(cle.currency1, blocks, cles);
}
/** Le premier indice de cle interdite, ou -1. */
export function indexPoolSansHookInterdite(cles, blocks = []) {
  return (cles || []).findIndex((c) => poolSansHookInterdite(c, blocks, cles || []));
}

/* ══ 2026-10-02 13:58 — DECISION DU FONDATEUR : PLUS AUCUNE ROUTE PAR TBLOCK ═════════════════════════════════════════
 * ⛔⛔ TBLOCK n est plus une jambe intermediaire : un block s echange directement contre sa devise appariee (action
 *     tokenisee, USDC, ETH) sur une pool hookee, et le frais va a a6cf dans CETTE devise — jamais en block. TBLOCK
 *     lui-meme reste bloque dans l app (aucune pool hookee TBLOCK/ETH). `ROUTE_VIA_TBLOCK` ferme `routeViaTblock`. */
export const ROUTE_VIA_TBLOCK = false;
/** Vrai = cette cle passe par TBLOCK (une de ses deux devises). */
export function cleTouchTblock(cle) {
  return !!cle && (bas(cle.currency0) === bas(TBLOCK) || bas(cle.currency1) === bas(TBLOCK));
}

/* ══ 2026-10-02 13:59 — FONDATEUR : a6cf recoit ETH, USDC ou l action appariee, JAMAIS le block ═══════════════════════
 * ⛔⛔ Mesure fork (stock-proof, NVDAc) : sur une pool V8 ou le block est currency0, le HOOK verse a6cf en BLOCK
 *     (69 549 931 494 498 013 106 unites sur un achat de 71 247 NVDAc) et le routeur ajoutait 356 NVDAc — deux frais,
 *     dont un en block. Le contrat ne se change pas : l app REFUSE ces pools (Create ne les fabrique plus : item 2). */
export const REFUS_FRAIS_HOOK_EN_BLOCK = true;
/** Texte EXACT montre a l ecran pour ces blocks (decision 14:07 : rien d autre). */
export const MESSAGE_PAS_ICI = 'Not tradable here yet';
/** Vrai = le hook de cette pool verserait son frais dans le block `jeton` pour ce sens. */
export function fraisHookEnBlock(cle, jeton, sens, zeroForOne) {
  const d = deviseFraisHook(cle, sens, zeroForOne) || deviseFraisHookHorsListe(cle, sens, zeroForOne);
  return !!d && bas(d) === bas(jeton);
}
/* ══ 2026-10-02 (porte de livraison, revue Claude) — LES HOOKS QUI PRELEVENT EN BLOCK SANS ETRE DANS LA LISTE DES PAYEURS ══
 * ⛔ HOOK_PREVU (V1) a l ACHAT verse a6cf en BLOCK (fork 52072599 callTracer, tokenomics.js : « V1 achat : le hook prend du
 *   BLOCK (non compte) »). Il n est pas dans HOOKS_PAIENT_DEJA_A6CF (le routeur garde son frais) : sans cette table, un achat
 *   V1 payait deux frais, dont un en block, et `fraisHookEnBlock` ne le voyait pas. Devise prelevee : la SORTIE (le block). */
export const HOOKS_FRAIS_EN_BLOCK_HORS_LISTE = Object.freeze([Object.freeze({ hook: bas(HOOK_PREVU), sens: 'ACHAT' })]);
export function deviseFraisHookHorsListe(cle, sens, zeroForOne) {
  if (!cle || !HOOKS_FRAIS_EN_BLOCK_HORS_LISTE.some((e) => e.hook === bas(cle.hooks) && e.sens === sens)) return null;
  return bas(zeroForOne ? cle.currency1 : cle.currency0);
}

/* ══ 2026-10-02 (porte de livraison, revue Claude) — UN BLOCK A UNE JONCTION DE SEGMENTS ═════════════════════════════════
 * ⛔⛔ Les rails qui enchainent Aerodrome et Uniswap (franchissement V4 -> Aerodrome, segment Aerodrome a plusieurs sauts,
 *     ETH -> pivot -> action -> block, multipool) passaient un block A LA JONCTION : ETH ->(Aerodrome) blockC ->(V4 V8) NVDAc.
 *     Meme classe que R4, et la regle du fondateur casse : la pool Aerodrome du block n a pas de hook TB. Refus,
 *     texte exact MESSAGE_PAS_ICI. Un block ici = TBLOCK/TBGAS, ou un B20 (0xb2…) qui n est pas une devise connue — son prix
 *     lu ne change rien (meme choix que estBlockDeRoute). Rend l indice du premier block parmi `noeuds`, ou -1. */
export function estBlockAJonction(adr, cles = []) {
  return estBlockTbClasse(adr, cles);
}
export function indexBlocAJonction(noeuds, cles = []) {
  return (Array.isArray(noeuds) ? noeuds : []).findIndex((t) => estBlockAJonction(t, cles));
}

/* ══ 2026-10-02 (C2, F1) — UN BLOCK SUR UNE POOL V4 A HOOK TIERS ═══════════════════════════════════════════════════════
 * ⛔⛔ Une cle V4 dont une devise est un block (estBlockAJonction : TBLOCK/TBGAS, ou B20 hors devises connues — PAS
 *     estBlockDeRoute, sinon un memecoin o1 non prixe hors B20, ex. BRIAN, serait refuse) n est admise que si :
 *     (1) estNotreHook, ou un hook V8-open LISTE (marche-ouvert.js) — les regles existantes (frais en block, V1, une jambe
 *         payante, garde marche ouvert) s appliquent ensuite ;
 *     (2) sans hook ET format OpenLaunch (3 % / 200) ;
 *     (3) le LaunchHook Standard d o1 avec REFERENT_O1_ACTIF (la part referrer a6cf, GO).
 *     Tout autre hook (o1 Tax, anciens o1, Clanker, Doppler, inconnu) -> refus avant toute cotation. Sans cle : rien a juger. */
export function hookAdmisPourBlock(cle, cles = [cle]) {
  if (!cle) return true;
  if (!estBlockAJonction(cle.currency0, cles) && !estBlockAJonction(cle.currency1, cles)) return true;
  const h = bas(cle.hooks || ZERO);
  if (estNotreHook(h) || estHookMarcheOuvert(h)) return true;
  if (h === ZERO) return formatOpenLaunch(cle);
  return REFERENT_O1_ACTIF === true && estHookO1Standard(h);
}

/* ══ 2026-10-03 (Phil 00:20, spec Claude 00:27) — QU EST-CE QU UN « BLOCK TB » POUR LE ROUTAGE ? ═════════════════════════
 * ⛔⛔ Seuls les vrais blocks TB sont restreints (R4, sans-hook, hook tiers, jonction). Un jeton est un block TB si :
 *     (a) il est ne du CreateRouter (index-routeur.js : graine + index servi, formule neDuRouteur du hook 7030) ;
 *     (b) TBLOCK / TBGAS (BLOCKS_TB), ou un des blocks V1 de test (RNG, TUTU, OK, O ; TBGAS en est aussi) qui gardent leurs regles ;
 *     (c) son marche lu est sur un de NOS hooks (estNotreHook) — une des `cles` passees, ou un marche deja vu par l app
 *         (noterMarcheSurNotreHook). Couvre les anciens blocks nes de la factory.
 *     Un B20 qu aucune regle ne classe : TIERS si l index est LU (echangeable comme sur 1bb12d6, frais routeur en ETH/USDC),
 *     INCONNU sinon — traite en block (fail-closed), ce qui ne refuse que ses pools SANS hook TB.
 * ⛔ CLASSEMENT DE ROUTAGE SEULEMENT : rien ici ne decide de l affichage (carte, fil, profils, listes).
 * ⛔ Une devise connue (ETH, USDC, OUSD, actions…) n est jamais un block ; un jeton hors B20 ne l est que par (c). */
const BLOCKS_V1_TEST = new Set(['0xb2000000000000000000004ff41cbd5ef8e49f14', '0xb20000000000000000000071224edc6587e362d2',
  '0xb2000000000000000000006d6f9102e9e4b221e0', '0xb200000000000000000000a3f3e63b48ef57c481']);
const marchesSurNosHooks = new Set();
/** L app a lu un marche (cle V4) sur un de NOS hooks : ses devises non connues sont des blocks TB (regle (c)). */
export function noterMarcheSurNotreHook(cle) {
  if (!cle || !estNotreHook(cle.hooks)) return false;
  for (const a of [bas(cle.currency0), bas(cle.currency1)]) if (/^0x[0-9a-f]{40}$/.test(a) && !DEVISES.has(a)) marchesSurNosHooks.add(a);
  return true;
}
function surNotreHook(a, cles) {
  return marchesSurNosHooks.has(a) || (Array.isArray(cles) ? cles : []).some((c) => !!c && estNotreHook(c.hooks)
    && (bas(c.currency0) === a || bas(c.currency1) === a));
}
/** 'TB' | 'TIERS' | 'INCONNU' | null (devise connue, adresse invalide, ou jeton hors B20 sans marche sur nos hooks). */
export function classeBlock(adr, cles = []) {
  const a = bas(adr);
  if (!/^0x[0-9a-f]{40}$/.test(a) || DEVISES.has(a)) return null;
  if (BLOCKS_TB.has(a) || BLOCKS_V1_TEST.has(a) || estNeDuRouteur(a) || surNotreHook(a, cles)) return 'TB';
  if (!RE_B20.test(a)) return null;
  return indexRouteurLu() ? 'TIERS' : 'INCONNU';
}
/** Vrai = traiter ce jeton en block TB au routage (TB prouve, ou INCONNU : fail-closed). */
export function estBlockTbClasse(adr, cles = []) {
  const c = classeBlock(adr, cles);
  return c === 'TB' || c === 'INCONNU';
}
