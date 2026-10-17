/* volume-tirage.js — LE VOLUME VERIFIE d une transaction, pour le ticket QUOTIDIEN du Season Draw (Phil 2026-10-17 : « le ticket d entree
 * c est 10 dollar per day de volume sur le block UNIT » ; « si buy/sell tokenized stocks … est bon aussi »). PUR : aucun reseau.
 * Deux sources, chacune PROUVEE dans le recu, jamais dite par le client :
 *   - UNIT : les evenements Swap(id, …) EMIS PAR LE POOLMANAGER v4 sur une pool UNIT de NOTRE hook (poolIds passes par l appelant,
 *     calcules depuis la cle). Volume = |amount0| (cote ETH : currency0 = ETH natif). Un swap sur notre pool paie notre frais DANS le swap
 *     (hook) : la pool EST la preuve du frais, la ou un frais en ETH natif n a pas de log (verifierFrais ne peut pas le voir).
 *   - ACTIONS TOKENISEES : les Transfer du jeton de l action depuis / vers le payeur (le jeton echange), comptes une fois chacun.
 *     ⛔ L appelant n accepte cette source que si verifierFrais a vu NOTRE frais arriver (le trade est passe par l app).
 * Payeur = payeurDe (EntryPoints listes ; lot multi-operations ou EntryPoint inconnu -> null -> rien). */
import { payeurDe } from './revenu-externe.js';
import { keccak256Hex } from './keccak.js';

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
export const TOPIC_SWAP_V4 = keccak256Hex(new TextEncoder().encode('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)'));
export const TOPIC_TRANSFER = keccak256Hex(new TextEncoder().encode('Transfer(address,address,uint256)'));
const DEUX256 = 1n << 256n, DEUX255 = 1n << 255n;
const signe = (mot) => { const v = BigInt('0x' + mot); return v >= DEUX255 ? v - DEUX256 : v; };
const abs = (v) => (v < 0n ? -v : v);

/** PASS SKIN : le recu prouve un ACHAT de skin par le payeur — un mint ERC-721 du contrat de skins (Transfer, 4 topics, from 0x0, to = payeur)
 *  ET au moins `prix` d USDC du payeur vers le wallet de frais (Transfer, 3 topics). Rend { ok, payeur } | { ok:false, etat, pourquoi }. */
export function passSkinVerifie({ tx, recu, skins, usdc, wallet, prix }) {
  if (!tx || !recu) return { ok: false, etat: 'NON_LU', pourquoi: 'transaction or receipt not readable yet' };
  if (String(recu.status) !== '0x1' || bas(recu.transactionHash) !== bas(tx.hash)) return { ok: false, etat: 'REFUSE', pourquoi: 'not a confirmed purchase' };
  const payeur = payeurDe({ tx, recu });
  if (!payeur || !ADR.test(payeur)) return { ok: false, etat: 'REFUSE', pourquoi: 'the payer could not be read' };
  const p32 = '0x' + payeur.slice(2).padStart(64, '0'), w32 = '0x' + bas(wallet).slice(2).padStart(64, '0'), zero = '0x' + '0'.repeat(64);
  const logs = recu.logs || [];
  const mint = logs.some((l) => bas(l.address) === bas(skins) && (l.topics || []).length === 4 && bas(l.topics[0]) === TOPIC_TRANSFER && bas(l.topics[1]) === zero && bas(l.topics[2]) === p32);
  const paye = logs.filter((l) => bas(l.address) === bas(usdc) && (l.topics || []).length === 3 && bas(l.topics[0]) === TOPIC_TRANSFER && bas(l.topics[1]) === p32 && bas(l.topics[2]) === w32)
    .reduce((s, l) => s + BigInt('0x' + String(l.data).replace(/^0x/, '').slice(0, 64) || '0'), 0n);
  if (!mint) return { ok: false, etat: 'REFUSE', pourquoi: 'no skin minted to the payer in this transaction' };
  if (paye < BigInt(prix)) return { ok: false, etat: 'REFUSE', pourquoi: 'the skin price did not reach TokenizedBlock in this transaction' };
  return { ok: true, payeur };
}

/** l identifiant v4 d une cle { currency0, currency1, fee, tickSpacing, hooks } = keccak256(abi.encode(key)) */
export function poolIdDe(k) {
  const a = (x) => bas(x).slice(2).padStart(64, '0');
  const u = (n) => { let v = BigInt(n); if (v < 0n) v += DEUX256; return v.toString(16).padStart(64, '0'); };
  return keccak256Hex(Uint8Array.from(Buffer.from(a(k.currency0) + a(k.currency1) + u(k.fee) + u(k.tickSpacing) + a(k.hooks), 'hex')));
}

/**
 * @param { tx, recu, poolManager, poolsUnit:Set<poolId>, jetonsActions:Set<adresse> }
 * @returns { ok:true, payeur, unitWei:string, actions:[{ jeton, montant:string }] } | { ok:false, etat, pourquoi }
 */
export function volumeVerifie({ tx, recu, poolManager, poolsUnit, jetonsActions }) {
  if (!tx || !recu) return { ok: false, etat: 'NON_LU', pourquoi: 'transaction or receipt not readable yet' };
  if (String(recu.status) !== '0x1') return { ok: false, etat: 'REFUSE', pourquoi: 'the transaction failed' };
  if (bas(recu.transactionHash) !== bas(tx.hash)) return { ok: false, etat: 'REFUSE', pourquoi: 'receipt of another transaction' };
  const payeur = payeurDe({ tx, recu });
  if (!payeur || !ADR.test(payeur)) return { ok: false, etat: 'REFUSE', pourquoi: 'the payer could not be read' };
  const pm = bas(poolManager), p32 = '0x' + payeur.slice(2).padStart(64, '0');
  let unitWei = 0n;
  const parJeton = new Map();
  for (const l of recu.logs || []) {
    const tp = (l && l.topics) || [], adr = bas(l && l.address), data = String((l && l.data) || '').replace(/^0x/, '');
    if (adr === pm && bas(tp[0]) === TOPIC_SWAP_V4 && poolsUnit && poolsUnit.has(bas(tp[1])) && data.length >= 128) {
      unitWei += abs(signe(data.slice(0, 64)));
    } else if (tp.length === 3 && bas(tp[0]) === TOPIC_TRANSFER && jetonsActions && jetonsActions.has(adr) && (bas(tp[1]) === p32 || bas(tp[2]) === p32) && data.length >= 64) {
      parJeton.set(adr, (parJeton.get(adr) || 0n) + BigInt('0x' + data.slice(0, 64)));
    }
  }
  return { ok: true, payeur, unitWei: unitWei.toString(), actions: [...parJeton.entries()].map(([jeton, montant]) => ({ jeton, montant: montant.toString() })) };
}
