/* brain-os.js — LE « BRAIN OS » : nos propres outils de lecture pour les cerveaux des blocks, sans aucune cle tierce.
 *
 * POURQUOI (Phil, 2026-10-18) : « copy how Base Rooms did it and rebuild an OS for our brains ». Base Rooms OS donne a ses agents des
 *   outils (token_safety, explain_tx, wallet_*, gas) qui exigent une cle de buddy. Ici, les MEMES gestes sont refaits avec ce que l app
 *   lit deja : la chaine Base (le `rpc` de l app) et nos propres routes (/api/avoirs, /api/blocks-de, /api/tirage). Aucune cle.
 *
 * ⛔⛔ NOUS DISONS CE QUI A ETE MESURE, RIEN D AUTRE. Chaque ligne rendue est une lecture (avec son chiffre) ou dit « not read ». Aucun
 *   outil ne dit « safe » : la surete est une liste de mesures (code B20, plafond de frappe, aller-retour cote achat puis vente sur sa
 *   pool, a deux tailles). Une pool qui cote l achat et REFUSE la revente est dite telle quelle.
 * ⛔ UN EVENEMENT N EST PAS UNE TRANSACTION : un log n est nomme « des notres » (BlockRolls, nos hooks, la factory B20, le PoolManager)
 *   que si SON ADRESSE est celle du contrat. Une forme connue venue d une autre adresse est dite « not from <contrat> ».
 * ⛔ PUR : aucun reseau propre. `rpc(methode, params)` et `lireJson(chemin)` sont injectes (l app passe les siens ; les tests, des faux).
 *   Rien ici ne signe, n envoie, ni ne propose une transaction. */
import { topic, selecteur } from './keccak.js';
import { vieDuBlock } from './marche.js';
import { encodeQuote } from './pool.js';
import { QUOTEUR, estRevertDeChaine, estRevertPasAssezDeLiquidite } from './echange.js';
import { V4_ADRESSES } from './lancer-pool.js';
import { faitsDuBlock } from './faits.js';
import { prixEthUsd } from './prix-eth.js';
import { HOOKS, TOPIC_PAYE, TOPIC_MIS_EN_ATTENTE, TOPIC_MISE_EN_VIE, TOPIC_FRAIS_V1, TOPIC_USER_OP } from './veille-frais.js';
import { HOOK_7030 } from './tokenomics.js';
import { FACTORY, TOPIC_CREATED } from './index-blocks.js';
import { BLOCKROLLS_DEPLOIEMENT } from './blockrolls-deploiement.js';
import { EV_ROLLED, EV_SETTLED, EV_PASS_BOUGHT, EV_DAY_CLOSED, EV_DAY_DRAWN, EV_RULES_SET } from './blockrolls-plan.js';
import { EV_EXPIRED, filtreLogsJoueur, rollsEnAttente } from './rolls-en-attente.js';
import { BLOCKSKINS } from './blockskins-actif.js';
import { MISSIONS_DEPLOIEMENT } from './missions-deploiement.js';
import { TICKETPOT_DEPLOIEMENT } from './ticketpot-deploiement.js';
import { EV_FUNDED, EV_CLOSED, EV_CLAIMED, EV_ROLLED_OVER } from './ticketpot-plan.js';
import { DEVISES_BASE, ACTIONS_COINBASE } from './paires.js';

const ETH = '0x0000000000000000000000000000000000000000';
const ADR = /^0x[0-9a-fA-F]{40}$/, HASH = /^0x[0-9a-fA-F]{64}$/;
const bas = (x) => String(x || '').toLowerCase();
const motAdr = (w) => '0x' + String(w || '').replace(/^0x/, '').slice(-40).toLowerCase();
const mots = (data) => (String(data || '').replace(/^0x/, '').match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
const signe128 = (v) => { const x = BigInt.asUintN(128, v); return x >= (1n << 127n) ? x - (1n << 128n) : x; };
const ligne = (texte, classe = '') => ({ texte, classe });

/** Un montant brut en unites humaines : 6 decimales au plus, zeros de fin retires. */
export function unites(brut, dec, frac = 6) {
  let v; try { v = BigInt(brut); } catch (_) { return String(brut); }
  if (!Number.isInteger(dec) || dec < 0 || dec > 36) return v.toString() + ' raw units';
  const neg = v < 0n; if (neg) v = -v;
  const s = v.toString().padStart(dec + 1, '0');
  const ent = s.slice(0, s.length - dec), f = dec ? s.slice(s.length - dec).slice(0, frac).replace(/0+$/, '') : '';
  return (neg ? '-' : '') + ent + (f ? '.' + f : '');
}
const pctBps = (bps) => (Number(bps) / 100).toFixed(Number(bps) % 100 === 0 ? 0 : 1) + ' %';

/* ── LE REGISTRE DE NOS CONTRATS (adresse -> nom) : la seule source de « des notres » ── */
export function contratsConnus(chaine = 8453) {
  const m = new Map();
  const V = V4_ADRESSES[Number(chaine)] || {};
  if (V.poolm) m.set(bas(V.poolm), 'the Uniswap v4 PoolManager');
  for (const [v, a] of Object.entries(HOOKS)) m.set(bas(a), 'our hook ' + v);
  if (HOOK_7030) m.set(bas(HOOK_7030), 'our hook 7030');
  m.set(bas(FACTORY), 'the B20 factory');
  if (BLOCKROLLS_DEPLOIEMENT.adresse) m.set(bas(BLOCKROLLS_DEPLOIEMENT.adresse), 'BlockRolls');
  if (BLOCKSKINS && ADR.test(BLOCKSKINS)) m.set(bas(BLOCKSKINS), 'BlockSkins');
  if (MISSIONS_DEPLOIEMENT.adresse) m.set(bas(MISSIONS_DEPLOIEMENT.adresse), 'Missions');
  if (TICKETPOT_DEPLOIEMENT.adresse) m.set(bas(TICKETPOT_DEPLOIEMENT.adresse), 'TicketPot');
  if (QUOTEUR[Number(chaine)]) m.set(bas(QUOTEUR[Number(chaine)]), 'the Uniswap v4 quoter');
  return m;
}
const REGISTRE = () => [...DEVISES_BASE.filter((d) => (d.chaines || []).includes(8453)), ...ACTIONS_COINBASE];
const symboleConnu = (adr) => { const d = REGISTRE().find((x) => bas(x.adr) === bas(adr)); return d ? d.symbole : null; };
const estHookDesNotres = (h) => [...Object.values(HOOKS), HOOK_7030].filter(Boolean).some((x) => bas(x) === bas(h));

/* les evenements reconnus : topic0 -> { nom, de (le nom du contrat qui DOIT l emettre, ou null = n importe quel jeton) } */
export const SIGNATURES = Object.freeze({
  TRANSFER: 'Transfer(address,address,uint256)',
  APPROVAL: 'Approval(address,address,uint256)',
  SWAP_V4: 'Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)',
  INITIALIZE_V4: 'Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)',
  MODIFY_LIQUIDITY_V4: 'ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)',
  TASK_POSTED: 'TaskPosted(uint256,address,address,address,uint256,uint32,uint64,bytes32)',
});
export const TOPICS = Object.freeze({
  TRANSFER: topic(SIGNATURES.TRANSFER), APPROVAL: topic(SIGNATURES.APPROVAL), SWAP_V4: topic(SIGNATURES.SWAP_V4),
  INITIALIZE_V4: topic(SIGNATURES.INITIALIZE_V4), MODIFY_LIQUIDITY_V4: topic(SIGNATURES.MODIFY_LIQUIDITY_V4),
  TASK_POSTED: topic(SIGNATURES.TASK_POSTED),
  ROLLED: topic(EV_ROLLED), SETTLED: topic(EV_SETTLED), PASS_BOUGHT: topic(EV_PASS_BOUGHT), EXPIRED: topic(EV_EXPIRED),
  DAY_CLOSED: topic(EV_DAY_CLOSED), DAY_DRAWN: topic(EV_DAY_DRAWN), RULES_SET: topic(EV_RULES_SET),
  TP_FUNDED: topic(EV_FUNDED), TP_CLOSED: topic(EV_CLOSED), TP_CLAIMED: topic(EV_CLAIMED), TP_ROLLED_OVER: topic(EV_ROLLED_OVER),
});

/* ════════════════════════════════════ SAFETY ════════════════════════════════════ */
/** La taille de la sonde, dans la devise qui paie : ETH 0,001 ; une devise a 6 decimales 1 unite ; sinon 1/1000 d unite. Puis x10. */
export function taillesSonde(decDevise, estEth) {
  if (estEth) return [10n ** 15n, 10n ** 16n];
  if (decDevise === 6) return [10n ** 6n, 10n ** 7n];
  if (!Number.isInteger(decDevise) || decDevise < 3) return null;
  return [10n ** BigInt(decDevise - 3), 10n ** BigInt(decDevise - 2)];
}
/** Un devis du Quoter v4 : { ok, sortie } | { ok:false, revert:boolean } — un revert (la pool / son hook refuse) n est pas une panne. */
async function coter(rpc, quoteur, cle, zeroForOne, montant) {
  try {
    const r = await rpc('eth_call', [{ to: quoteur, data: encodeQuote({ cle, zeroForOne, montant }) }, 'latest']);
    if (!r || String(r).length < 66) return { ok: false, revert: false };
    return { ok: true, sortie: BigInt(String(r).slice(0, 66)) };
  } catch (e) { return { ok: false, revert: estRevertDeChaine(e), mince: estRevertPasAssezDeLiquidite(e) }; }
}
/** Achat de `entree` puis revente de tout ce qui est recu, sur la MEME pool : ce qui revient, mesure. */
export async function allerRetour({ rpc, quoteur, cle, jeton, entree }) {
  const jetonEst0 = bas(cle.currency0) === bas(jeton);
  const achat = await coter(rpc, quoteur, cle, !jetonEst0, entree);
  if (!achat.ok) return { etat: achat.revert ? 'ACHAT_REFUSE' : 'NON_LU', entree };
  if (achat.sortie <= 0n) return { etat: 'ACHAT_REFUSE', entree };
  const vente = await coter(rpc, quoteur, cle, jetonEst0, achat.sortie);
  /* ⛔ 2026-10-18 (mesure : « safety UNIT ») : le Quoter mesure CHAQUE jambe sur l etat ACTUEL de la pool, pas apres l achat. Une pool a
   *   liquidite d un seul cote (nos naissances) rend NotEnoughLiquidity a la revente : c est une pool MINCE, pas un refus du hook. */
  if (!vente.ok) return { etat: vente.mince ? 'VENTE_MINCE' : vente.revert ? 'VENTE_REFUSEE' : 'NON_LU', entree, recu: achat.sortie };
  return { etat: 'LU', entree, recu: achat.sortie, retour: vente.sortie, gardeBps: Number((vente.sortie * 10000n) / entree) };
}

/**
 * Ce qui se MESURE de la surete d un jeton, sans cle tierce.
 * @returns {Promise<{ jeton, faits, marche, allers:object[], lignes:{texte,classe}[], resume:string }>}
 */
export async function lireSurete({ rpc, jeton, chaine = 8453, clesExactes = [], deviseDAbord = false }) {
  const lignes = [];
  const a = bas(jeton);
  if (!ADR.test(a) || a === ETH) return { jeton: a, lignes: [ligne('Safety not read — give a token contract address.', 'non')], resume: 'Safety not read — no token contract.' };
  const V = V4_ADRESSES[Number(chaine)] || {}, quoteur = QUOTEUR[Number(chaine)];
  const morceaux = [];
  /* 1. le code et la frappe (faits.js : B20 = code EXACTEMENT 0xef) */
  let faits = null;
  try { faits = await faitsDuBlock({ rpc, jeton: a }); } catch (_) { faits = null; }
  const sym = (faits && faits.symbole) || symboleConnu(a) || a.slice(0, 6) + '…' + a.slice(-4);
  if (!faits || faits.code === null) { lignes.push(ligne('Contract code: not read.', 'non')); morceaux.push('code not read'); }
  else if (faits.code === '0x' || faits.code === '') { lignes.push(ligne('There is no contract at this address on Base.', 'non')); morceaux.push('no contract'); }
  else if (faits.estB20) {
    lignes.push(ligne('B20 token: its code is the B20 marker (0xef), the token standard of Base.'));
    morceaux.push('B20');
    if (faits.mintFerme === true) { lignes.push(ligne('Supply is at its cap: no more can be minted.')); morceaux.push('mint closed'); }
    else if (faits.mintFerme === false && faits.supply !== null && faits.cap !== null && Number.isInteger(faits.decimales)) {
      lignes.push(ligne('Supply ' + unites(faits.supply, faits.decimales, 2) + ' of a cap of ' + unites(faits.cap, faits.decimales, 2) + ': more can be minted.'));
      morceaux.push('mint open');
    } else { lignes.push(ligne('Supply and cap: not read.', 'non')); morceaux.push('cap not read'); }
    lignes.push(ligne('Its admin and mint roles are not read here.'));
  } else {
    /* ⛔ corrige 2026-10-18 : la copie testait /^0xb20{20}/ (« 0xb2 » puis VINGT zeros) — le prefixe imite est « 0xb20… » (b20-prefix-impersonation) */
    lignes.push(ligne('A contract, not a B20 token' + (/^0xb20/.test(a) ? ' — its address starts like one, which proves nothing' : '') + '.'));
    morceaux.push('not a B20');
    /* owner() : une lecture ; un revert = pas de fonction owner() ; une panne = non lu */
    try {
      const r = await rpc('eth_call', [{ to: a, data: selecteur('owner()') }, 'latest']);
      if (r && String(r).length >= 66) {
        const o = motAdr(String(r).slice(0, 66));
        lignes.push(ligne(/^0x0{40}$/.test(o) ? 'owner() is the zero address.' : 'owner() is ' + o + ' — that address may hold powers over this token.', /^0x0{40}$/.test(o) ? '' : 'non'));
      } else lignes.push(ligne('owner(): no answer.'));
    } catch (e) { lignes.push(ligne(estRevertDeChaine(e) ? 'No owner() function answered.' : 'owner(): not read.')); }
  }
  /* 2. sa pool (marche.js vieDuBlock : la meme recherche que le planificateur) */
  let marche = null;
  try { marche = await vieDuBlock({ rpc, stateView: V.stateView, jeton: a, clesExactes, deviseDAbord }); } catch (_) { marche = null; }
  const allers = [];
  if (!marche || marche.etat === 'NON_LUE' || marche.etat === 'REFUSEE') { lignes.push(ligne('Its pool: not read.', 'non')); morceaux.push('pool not read'); }
  else if (marche.etat === 'NON_TROUVEE') { lignes.push(ligne('No pool found among the keys we read — not a claim that it has none.')); morceaux.push('no pool found'); }
  else if (!marche.cle) { lignes.push(ligne('Its pool: not read.', 'non')); morceaux.push('pool not read'); }
  else {
    const cle = marche.cle, hook = bas(cle.hooks);
    const devise = bas(cle.currency0) === a ? bas(cle.currency1) : bas(cle.currency0);
    const fee = Number(cle.fee);
    const hookTxt = !hook || /^0x0{40}$/.test(hook) ? 'no hook' : estHookDesNotres(hook) ? 'our hook ' + hook : 'a third-party hook ' + hook;
    lignes.push(ligne('Pool: paired with ' + (devise === ETH ? 'ETH' : symboleConnu(devise) || devise) + ', ' + (fee === 0x800000 ? 'dynamic LP fee' : 'LP fee ' + (fee / 10000) + ' %') + ', ' + hookTxt + '.'));
    /* 3. l aller-retour, a deux tailles */
    let decDevise = devise === ETH ? 18 : null;
    if (decDevise === null) { try { decDevise = Number(BigInt(await rpc('eth_call', [{ to: devise, data: '0x313ce567' }, 'latest']))); } catch (_) { decDevise = null; } }
    const tailles = taillesSonde(decDevise, devise === ETH);
    const symDev = devise === ETH ? 'ETH' : symboleConnu(devise) || 'units';
    if (!tailles || !quoteur) { lignes.push(ligne('Round trip: not measured (the decimals of its paired currency were not read).', 'non')); morceaux.push('round trip not read'); }
    else {
      for (const t of tailles) {
        const r = await allerRetour({ rpc, quoteur, cle, jeton: a, entree: t });
        allers.push(r);
        const combien = unites(t, decDevise) + ' ' + symDev;
        if (r.etat === 'LU') {
          const perte = 10000 - r.gardeBps;
          lignes.push(ligne('Round trip ' + combien + ' → ' + (Number.isInteger(faits && faits.decimales) ? unites(r.recu, faits.decimales) + ' ' + sym : r.recu + ' raw units')
            + ' → ' + unites(r.retour, decDevise) + ' ' + symDev + ' back: ' + pctBps(Math.max(0, perte)) + ' lost (fees and price impact included).', r.gardeBps < 9000 ? 'non' : ''));
          morceaux.push(combien + ' round trip ' + pctBps(Math.max(0, perte)) + ' lost');
        } else if (r.etat === 'VENTE_MINCE') {
          lignes.push(ligne('Buying ' + combien + ' quotes; selling that amount back does not quote right now — the pool holds too little of the other side at today\'s price (NotEnoughLiquidity). This is depth, not a block on selling: it is measured on the pool as it is now, not after your buy.', 'non'));
          morceaux.push('thin on the sell side right now');
          break;
        } else if (r.etat === 'VENTE_REFUSEE') {
          lignes.push(ligne('Buying ' + combien + ' quotes, but SELLING it back does not: the pool or its hook refused the sale.', 'non'));
          morceaux.push('selling back does not quote');
          break;
        } else if (r.etat === 'ACHAT_REFUSE') {
          lignes.push(ligne('Buying ' + combien + ' does not quote: the pool or its hook refused.', 'non'));
          morceaux.push('buy of ' + combien + ' does not quote');
          break;
        } else { lignes.push(ligne('Round trip ' + combien + ': not read.', 'non')); morceaux.push('round trip not read'); break; }
      }
    }
  }
  return { jeton: a, symbole: sym, faits, marche, allers, lignes, resume: 'Measured: ' + morceaux.join(' · ') + '.' };
}

/* ════════════════════════════════════ EXPLAIN A TX ════════════════════════════════════ */
function nomLog(l, connus, chaine) {
  const ad = bas(l.address), t0 = bas(l.topics && l.topics[0]), t = l.topics || [], w = (() => { try { return mots(l.data); } catch (_) { return []; } })();
  const qui = connus.get(ad) || null;
  const pm = bas((V4_ADRESSES[Number(chaine)] || {}).poolm);
  const deQui = (nom) => (qui === nom ? '' : ' — but not from ' + nom + ' (sent by ' + ad + '), so not trusted');
  if (t0 === TOPICS.TRANSFER && t.length === 3) return { type: 'transfer', jeton: ad, de: motAdr(t[1]), vers: motAdr(t[2]), montant: w[0] };
  if (t0 === TOPICS.TRANSFER && t.length === 4) return { texte: 'NFT transfer of #' + BigInt(t[3]).toString() + ' (collection ' + ad + ') from ' + motAdr(t[1]) + ' to ' + motAdr(t[2]) + '.' };
  if (t0 === TOPICS.APPROVAL && t.length === 3) return { type: 'approval', jeton: ad, de: motAdr(t[1]), vers: motAdr(t[2]), montant: w[0] };
  if (t0 === TOPICS.SWAP_V4) return { texte: 'Uniswap v4 swap on pool ' + String(t[1] || '').slice(0, 12) + '… by ' + motAdr(t[2]) + ': amount0 ' + (w[0] !== undefined ? signe128(w[0]) : '?') + ', amount1 ' + (w[1] !== undefined ? signe128(w[1]) : '?') + ' (raw units, as the pool reports them)' + (ad === pm ? '' : deQui('the Uniswap v4 PoolManager')) + '.' };
  if (t0 === TOPICS.INITIALIZE_V4) return { texte: 'A new Uniswap v4 pool was opened (id ' + String(t[1] || '').slice(0, 12) + '…)' + (ad === pm ? '' : deQui('the Uniswap v4 PoolManager')) + '.' };
  if (t0 === TOPICS.MODIFY_LIQUIDITY_V4) return { texte: 'Liquidity changed on Uniswap v4 pool ' + String(t[1] || '').slice(0, 12) + '…' + (ad === pm ? '' : deQui('the Uniswap v4 PoolManager')) + '.' };
  if (t0 === bas(TOPIC_CREATED)) return { texte: 'A new B20 token was created: ' + motAdr(t[1]) + (qui === 'the B20 factory' ? '' : deQui('the B20 factory')) + '.' };
  const br = 'BlockRolls';
  if (t0 === TOPICS.ROLLED) return { texte: 'BlockRolls: roll #' + (t[1] ? BigInt(t[1]).toString() : '?') + ' by ' + motAdr(t[2]) + (w.length === 9 ? ', target block ' + w[5] + (w[6] === 1n ? ', with a pass' : '') : '') + deQui(br) + '.' };
  if (t0 === TOPICS.SETTLED) return { texte: 'BlockRolls: roll #' + (t[1] ? BigInt(t[1]).toString() : '?') + ' settled' + (w.length === 9 ? ' — score ' + w[6] + ', payout ' + unites(w[7], 6) + ' USDC' : '') + deQui(br) + '.' };
  if (t0 === TOPICS.EXPIRED) return { texte: 'BlockRolls: roll #' + (t[1] ? BigInt(t[1]).toString() : '?') + ' expired (not settled in time)' + deQui(br) + '.' };
  if (t0 === TOPICS.PASS_BOUGHT) return { texte: 'BlockRolls: a week pass was bought' + deQui(br) + '.' };
  if (t0 === TOPICS.DAY_CLOSED) return { texte: 'BlockRolls: a day of the pass pot was closed' + deQui(br) + '.' };
  if (t0 === TOPICS.DAY_DRAWN) return { texte: 'BlockRolls: a day of the pass pot was drawn' + deQui(br) + '.' };
  if (t0 === TOPICS.RULES_SET) return { texte: 'BlockRolls: new rules were set' + deQui(br) + '.' };
  if ([bas(TOPIC_PAYE), bas(TOPIC_MIS_EN_ATTENTE), bas(TOPIC_MISE_EN_VIE), bas(TOPIC_FRAIS_V1)].includes(t0)) {
    const nom = t0 === bas(TOPIC_PAYE) ? 'paid a fee' : t0 === bas(TOPIC_MIS_EN_ATTENTE) ? 'set a fee aside' : t0 === bas(TOPIC_MISE_EN_VIE) ? 'took a birth fee' : 'took a fee';
    return { texte: (qui && /^our hook/.test(qui) ? 'Our ' + qui.slice(4) : 'A fee-shaped event from ' + ad + ' (not one of our hooks, so not trusted):') + ' ' + nom + '.' };
  }
  if (t0 === bas(TOPIC_USER_OP)) return { texte: 'Smart-account operation: the real sender is ' + motAdr(t[2]) + ' (the transaction “from” is the bundler that relayed it).' };
  /* ⛔ corrige 2026-10-18 : la copie disait « no Missions contract of ours is recorded » meme quand le board EST enregistre et que l emetteur
   *   est un AUTRE contrat — le cas qui compte (une forme connue venue d ailleurs). Enregistre et different = « not from Missions, not trusted ». */
  const enregistre = (nom) => [...connus.values()].includes(nom);
  if (t0 === TOPICS.TASK_POSTED) return { texte: 'A mission was posted (TaskPosted)' + (qui === 'Missions' ? '' : enregistre('Missions') ? deQui('Missions') : ' by ' + ad + ' — no Missions contract of ours is recorded, so it is not checked as ours') + '.' };
  if ([TOPICS.TP_FUNDED, TOPICS.TP_CLOSED, TOPICS.TP_CLAIMED, TOPICS.TP_ROLLED_OVER].includes(t0)) return { texte: 'A TicketPot event' + (qui === 'TicketPot' ? '' : enregistre('TicketPot') ? deQui('TicketPot') : ' from ' + ad + ' — no TicketPot of ours is recorded, so it is not checked as ours') + '.' };
  return { texte: 'Unknown event from ' + (qui ? qui + ' (' + ad + ')' : ad) + ' (topic ' + String(t0).slice(0, 10) + '…).', inconnu: true };
}

/** Ce qu une transaction a fait, lu sur la chaine : de / vers / valeur / statut / frais, puis chaque log reconnu (ou dit inconnu). */
export async function expliquerTx({ rpc, hash, chaine = 8453, maxLogs = 25 }) {
  if (!HASH.test(String(hash || ''))) return { lignes: [ligne('Transaction not read — a hash is 0x and 64 characters.', 'non')] };
  let tx = null, recu = null;
  try { [tx, recu] = await Promise.all([rpc('eth_getTransactionByHash', [hash]), rpc('eth_getTransactionReceipt', [hash])]); }
  catch (_) { return { lignes: [ligne('Transaction not read — the node did not answer. Try again.', 'non')] }; }
  if (!tx) return { lignes: [ligne('This node does not know this transaction on Base (wrong network, not sent yet, or not seen by this node).', 'non')] };
  const connus = contratsConnus(chaine);
  const lignes = [];
  const nomDe = (x) => { const n = connus.get(bas(x)); return n ? bas(x) + ' (' + n + ')' : bas(x); };
  const valeur = (() => { try { return BigInt(tx.value || '0x0'); } catch (_) { return 0n; } })();
  lignes.push(ligne('From ' + bas(tx.from) + ' to ' + (tx.to ? nomDe(tx.to) : 'nobody (it creates a contract)') + (valeur > 0n ? ', sending ' + unites(valeur, 18) + ' ETH' : '') + '.'));
  if (!recu) { lignes.push(ligne('Not confirmed yet: no receipt on this node.', 'non')); return { tx, recu, lignes }; }
  const ok = String(recu.status) === '0x1';
  let frais = null;
  try {
    const g = BigInt(recu.gasUsed), p = BigInt(recu.effectiveGasPrice || tx.gasPrice || '0x0'), l1 = recu.l1Fee ? BigInt(recu.l1Fee) : 0n;
    frais = g * p + l1;
    lignes.push(ligne((ok ? 'Succeeded' : 'Reverted — nothing it tried to do happened, but the fee was paid') + ' in block ' + parseInt(recu.blockNumber, 16)
      + '. Fee ' + unites(frais, 18, 8) + ' ETH (' + g + ' gas' + (recu.l1Fee ? ' + the L1 data fee' : '') + ').', ok ? 'oui' : 'non'));
  } catch (_) { lignes.push(ligne((ok ? 'Succeeded' : 'Reverted') + '. Fee: not read.', ok ? 'oui' : 'non')); }
  if (recu.contractAddress) lignes.push(ligne('It created the contract ' + bas(recu.contractAddress) + '.'));
  const logs = Array.isArray(recu.logs) ? recu.logs : [];
  if (!logs.length) lignes.push(ligne(ok ? 'No events.' : 'No events (a reverted transaction leaves none).'));
  /* les decimales des jetons des Transfer / Approval : registre d abord, puis UNE lecture par jeton (6 au plus) */
  const decimales = new Map();
  for (const d of REGISTRE()) if (Number.isInteger(d.decimales)) decimales.set(bas(d.adr), d.decimales);
  const aLire = [...new Set(logs.filter((l) => l && l.topics && [TOPICS.TRANSFER, TOPICS.APPROVAL].includes(bas(l.topics[0])) && l.topics.length === 3).map((l) => bas(l.address)))].filter((x) => !decimales.has(x)).slice(0, 6);
  await Promise.all(aLire.map(async (j) => { try { const d = Number(BigInt(await rpc('eth_call', [{ to: j, data: '0x313ce567' }, 'latest']))); if (Number.isInteger(d) && d <= 36) decimales.set(j, d); } catch (_) { /* brut */ } }));
  const nomJeton = (j) => symboleConnu(j) || j;
  let inconnus = 0;
  for (const l of logs.slice(0, maxLogs)) {
    const n = nomLog(l, connus, chaine);
    if (n.inconnu) inconnus += 1;
    if (n.type === 'transfer') {
      const d = decimales.get(n.jeton);
      lignes.push(ligne('Transfer: ' + (Number.isInteger(d) ? unites(n.montant ?? 0n, d) : String(n.montant ?? '?') + ' raw units of') + ' ' + nomJeton(n.jeton) + ' from ' + n.de + ' to ' + n.vers + '.'));
    } else if (n.type === 'approval') {
      const d = decimales.get(n.jeton), illimite = (n.montant ?? 0n) >= (1n << 255n);
      lignes.push(ligne('Approval: ' + n.de + ' lets ' + nomDe(n.vers) + ' spend ' + (illimite ? 'an UNLIMITED amount' : Number.isInteger(d) ? unites(n.montant ?? 0n, d) : String(n.montant ?? '?') + ' raw units') + ' of ' + nomJeton(n.jeton) + '.', illimite ? 'non' : ''));
    } else lignes.push(ligne(n.texte));
  }
  if (logs.length > maxLogs) lignes.push(ligne((logs.length - maxLogs) + ' more events, not listed here.'));
  return { tx, recu, frais, inconnus, lignes };
}

/* ════════════════════════════════════ WALLET ════════════════════════════════════ */
/** Un jour du tirage, lisible : « J2026-10-18 » -> « 2026-10-18 UTC » ; un timestamp (s ou ms) -> sa date ; sinon le texte tel quel. */
export function jourLisible(j) {
  const s = String(j ?? '');
  if (/^[JM]\d{4}-\d{2}(-\d{2})?$/.test(s)) return s.slice(1) + ' UTC';
  if (/^\d+$/.test(s)) { const n = Number(s); const d = new Date(n < 1e12 ? n * 1000 : n); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : s; }
  return s;
}
/**
 * Un wallet, lu : ETH, puis USDC et actions (/api/avoirs), ses blocks crees (/api/blocks-de) et ceux que l app connait deja pour lui
 * (`blocksConnus`), son ticket du jour (/api/tirage), ses rolls en attente (logs BlockRolls des 1 000 derniers blocs).
 */
export async function lireWallet({ rpc, lireJson, adresse, blocksConnus = [], nomDe = () => null, maxBlocks = 12 }) {
  const a = bas(adresse);
  if (!ADR.test(a)) return { lignes: [ligne('Wallet not read — give a whole address, 0x and 40 characters.', 'non')] };
  const lignes = [];
  try { lignes.push(ligne('ETH: ' + unites(BigInt(await rpc('eth_getBalance', [a, 'latest'])), 18) + '.')); } catch (_) { lignes.push(ligne('ETH: not read.', 'non')); }
  /* USDC et actions : la route du serveur (le meme lecteur que la Bank) */
  try {
    const j = await lireJson('/api/avoirs?compte=' + a);
    const av = j && j.ok !== false && Array.isArray(j.avoirs) ? j.avoirs : null;
    if (!av) lignes.push(ligne('USDC and tokenized stocks: not read.', 'non'));
    else {
      const pleins = av.filter((x) => x && /^\d+$/.test(String(x.solde)) && BigInt(x.solde) > 0n);
      if (!pleins.length) lignes.push(ligne('No USDC or tokenized stock in this wallet' + (Array.isArray(j.nonLus) && j.nonLus.length ? ' (' + j.nonLus.length + ' not read)' : '') + '.'));
      for (const x of pleins.slice(0, 12)) lignes.push(ligne((x.symbole || x.adr) + ': ' + (Number.isInteger(x.decimales) ? unites(x.solde, x.decimales) : x.solde + ' raw units') + (x.action ? ' (tokenized stock)' : '') + '.'));
      if (Array.isArray(j.nonLus) && j.nonLus.length && pleins.length) lignes.push(ligne(j.nonLus.length + ' other balance(s) not read.', 'non'));
    }
  } catch (_) { lignes.push(ligne('USDC and tokenized stocks: not read.', 'non')); }
  /* ses blocks : crees (index du serveur) + ceux que l app connait deja pour ce wallet ; un solde lu par block */
  let crees = null, complet = false;
  try { const j = await lireJson('/api/blocks-de?adr=' + a); crees = j && j.ok && Array.isArray(j.blocks) ? j.blocks.map(bas).filter((x) => ADR.test(x)) : null; complet = !!(j && j.couvertureComplete === true); } catch (_) { crees = null; }
  /* ⛔ 2026-10-18 (mesure, serveur frais) : un index PAS encore complet rendait [] et l outil disait « Blocks created: 0 » au createur de
   *   UNIT. Un zero n est dit que sur une couverture COMPLETE ; sinon « at least N », ou « not known yet » si rien n est encore indexe. */
  if (crees === null) lignes.push(ligne('Blocks created: not read.', 'non'));
  else if (complet) lignes.push(ligne('Blocks created: ' + crees.length + '.'));
  else if (crees.length) lignes.push(ligne('Blocks created: at least ' + crees.length + ' (the server index is still catching up).'));
  else lignes.push(ligne('Blocks created: not known yet — the server index is still catching up.', 'non'));
  const tous = [...new Set([...(crees || []), ...(Array.isArray(blocksConnus) ? blocksConnus : []).map(bas).filter((x) => ADR.test(x))])];
  let detenus = 0, nonLus = 0;
  for (const b of tous.slice(0, maxBlocks)) {
    try {
      const [s, d] = await Promise.all([rpc('eth_call', [{ to: b, data: '0x70a08231' + a.slice(2).padStart(64, '0') }, 'latest']), rpc('eth_call', [{ to: b, data: '0x313ce567' }, 'latest'])]);
      const solde = BigInt(String(s).slice(0, 66)), dec = Number(BigInt(d));
      if (solde > 0n) { detenus += 1; lignes.push(ligne('Holds ' + unites(solde, dec, 2) + ' ' + (nomDe(b) || b) + (crees && crees.includes(b) ? ' (created by this wallet)' : '') + '.')); }
    } catch (_) { nonLus += 1; }
  }
  if (tous.length && !detenus && !nonLus) lignes.push(ligne('Holds none of the ' + Math.min(tous.length, maxBlocks) + ' block(s) checked.'));
  if (nonLus) lignes.push(ligne(nonLus + ' block balance(s) not read.', 'non'));
  if (tous.length > maxBlocks) lignes.push(ligne((tous.length - maxBlocks) + ' more block(s) not checked here.'));
  /* le ticket du jour et les rolls en attente */
  let t = null;
  try { t = await lireJson('/api/tirage'); } catch (_) { t = null; }
  if (!t || !t.ok || !t.jour) lignes.push(ligne('Today’s ticket: not read.', 'non'));
  else {
    const w = (Array.isArray(t.jour.wallets) ? t.jour.wallets : []).find((x) => x && bas(x.adresse) === a);
    /* ⛔ corrige 2026-10-18 (relecture avant cablage) : `wallets` liste TOUT wallet qui a echange aujourd hui, ticket ou pas (volumeUsd sous le
     *   seuil = pas de ticket) ; la version copiee disait « ticket: yes » des qu une entree existait. Le ticket = `w.ticket` (serveur : tJ.includes)
     *   ou la liste `tickets` (adresses, ou objets { adresse }), comme l onglet Game. */
    const aTicket = !!(w && w.ticket === true) || (Array.isArray(t.jour.tickets) && t.jour.tickets.some((x) => bas(x && x.adresse ? x.adresse : x) === a));
    const pass = (Array.isArray(t.jour.passes) ? t.jour.passes : []).find((x) => x && bas(x.adresse) === a);
    lignes.push(ligne(aTicket ? 'Today’s ticket: yes' + (w && Number.isFinite(Number(w.volumeUsd)) ? ' (volume today $' + Number(w.volumeUsd).toFixed(2) + ')' : '') + '.'
      : 'No ticket today yet' + (Number.isFinite(Number(t.seuilVolumeUsd)) ? ' (a ticket needs $' + Number(t.seuilVolumeUsd) + ' of verified volume)' : '') + '.', aTicket ? 'oui' : ''));
    /* ⛔ corrige 2026-10-18 : `jusqua` est un ID DE JOUR du serveur (« J2026-10-18 », tirage-saison.js jourDe), pas un timestamp. La version
     *   copiee faisait new Date(NaN).toISOString() — un RangeError qui faisait tomber TOUTE la lecture du wallet. */
    if (pass) lignes.push(ligne('Week pass: yes' + (pass.jusqua ? ' (through ' + jourLisible(pass.jusqua) + ')' : '') + '.'));
  }
  const rc = t && t.rolls;
  if (rc && ADR.test(String(rc.contrat || '')) && Number.isSafeInteger(Number(rc.bloc)) && Number(rc.bloc) > 0) {
    try {
      const tete = parseInt(await rpc('eth_blockNumber', []), 16);
      const de = Math.max(Number(rc.bloc), tete - 1000);
      const logs = await rpc('eth_getLogs', [filtreLogsJoueur({ contrat: rc.contrat, joueur: a, de, a: tete })]);
      if (!Array.isArray(logs)) throw new Error('logs unreadable');
      const r = rollsEnAttente({ logs, contrat: rc.contrat, joueur: a, tete });
      const n = (k) => (Array.isArray(r[k]) ? r[k].length : Number(r[k]) || 0);
      lignes.push(ligne(n('reglables') + n('tropTot') + n('perdus') === 0 ? 'No roll waiting to settle (last 1 000 blocks).'
        : 'Rolls waiting: ' + n('reglables') + ' can be settled now, ' + n('tropTot') + ' too early, ' + n('perdus') + ' lost (window passed).', n('reglables') || n('perdus') ? 'non' : ''));
    } catch (_) { lignes.push(ligne('Rolls waiting to settle: not read.', 'non')); }
  }
  return { lignes };
}

/* ════════════════════════════════════ GAS ════════════════════════════════════ */
const mediane = (l) => { const s = [...l].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
/** Les frais d un geste, MESURES sur des transactions recentes de Base : gas utilise (mediane) + frais L1 lus dans leurs recus. */
async function gasMesure(rpc, filtre, maxTx = 5) {
  const logs = await rpc('eth_getLogs', [filtre]);
  if (!Array.isArray(logs)) throw new Error('logs unreadable');
  const hashes = [...new Set(logs.map((l) => l && l.transactionHash).filter((h) => HASH.test(String(h))))].slice(-maxTx);
  const recus = (await Promise.all(hashes.map((h) => rpc('eth_getTransactionReceipt', [h]).catch(() => null)))).filter((r) => r && r.gasUsed);
  if (!recus.length) return { n: 0 };
  return { n: recus.length, gas: mediane(recus.map((r) => BigInt(r.gasUsed))), l1: mediane(recus.map((r) => (r.l1Fee ? BigInt(r.l1Fee) : 0n))) };
}
/** Le gas de Base maintenant : base fee, et ce que coutent un swap Uniswap v4 et un roll, d apres des transactions REELLES recentes. */
export async function lireGas({ rpc, chaine = 8453, fenetreSwap = 30, fenetreRoll = 1999 }) {
  const lignes = [];
  const V = V4_ADRESSES[Number(chaine)] || {};
  let base = null, prio = null, tete = null;
  try {
    const b = await rpc('eth_getBlockByNumber', ['latest', false]);
    tete = parseInt(b.number, 16); base = b.baseFeePerGas ? BigInt(b.baseFeePerGas) : null;
  } catch (_) { /* dit plus bas */ }
  try { prio = BigInt(await rpc('eth_maxPriorityFeePerGas', [])); } catch (_) { prio = null; }
  if (base === null) { lignes.push(ligne('Base fee: not read.', 'non')); return { lignes }; }
  const gwei = (w) => (Number(w) / 1e9).toFixed(Number(w) < 1e7 ? 4 : 3);
  lignes.push(ligne('Base fee now: ' + gwei(base) + ' gwei' + (prio !== null ? ', tip ' + gwei(prio) + ' gwei' : ' (tip not read)') + ' — block ' + tete + '.'));
  let usd = null;
  try { const p = await prixEthUsd({ rpc, stateView: V.stateView }); usd = p && p.etat === 'LU' ? p.usd : null; } catch (_) { usd = null; }
  lignes.push(ligne(usd ? 'ETH price: $' + usd.toFixed(2) + ' (median of our USDC pools).' : 'ETH price: not read — costs are given in ETH only.', usd ? '' : 'non'));
  const prix = base + (prio || 0n);
  const dire = (quoi, m, combien) => {
    if (!m || !m.n) return lignes.push(ligne(quoi + ': not measured — no such transaction in the last ' + combien + ' blocks.'));
    const eth = m.gas * prix + (m.l1 || 0n);
    lignes.push(ligne(quoi + ': about ' + m.gas + ' gas (median of ' + m.n + ' recent one' + (m.n > 1 ? 's' : '') + ') → ' + unites(eth, 18, 8) + ' ETH' + (usd ? ' ≈ $' + (Number(eth) / 1e18 * usd).toFixed(4) : '') + ' at this base fee, L1 data fee included.'));
  };
  try { dire('A Uniswap v4 swap', await gasMesure(rpc, { address: V.poolm, fromBlock: '0x' + Math.max(0, tete - fenetreSwap).toString(16), toBlock: '0x' + tete.toString(16), topics: [TOPICS.SWAP_V4] }), fenetreSwap); }
  catch (_) { lignes.push(ligne('A Uniswap v4 swap: not read.', 'non')); }
  if (BLOCKROLLS_DEPLOIEMENT.adresse) {
    try { dire('A roll (BlockRolls)', await gasMesure(rpc, { address: bas(BLOCKROLLS_DEPLOIEMENT.adresse), fromBlock: '0x' + Math.max(BLOCKROLLS_DEPLOIEMENT.bloc || 0, tete - fenetreRoll).toString(16), toBlock: '0x' + tete.toString(16), topics: [TOPICS.ROLLED] }, 3), fenetreRoll); }
    catch (_) { lignes.push(ligne('A roll (BlockRolls): not read.', 'non')); }
  }
  return { base, prio, usd, lignes };
}
