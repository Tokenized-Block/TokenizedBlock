/* revenu-externe.js — LE FRAIS EST-IL ARRIVE AU WALLET, PAYE PAR QUELQU UN D AUTRE QUE NOUS ?
 *
 * ⛔⛔ POURQUOI (2026-10-16). Le revenu externe mesure vaut ~0 $ : a6cf a pris 0,0028 ETH en 14 j jusqu au 2026-09-21, dont ~2/3
 *   payes par nous ; /api/live rend 0 frais sur 24 h ; achat_ok existe mais ne dit pas QUI a paye ni COMBIEN. Trois juges
 *   independants ont demande la meme chose avant tout nouveau chemin d argent : un compteur de revenu EXTERNE, une ligne par frais,
 *   compte sur des transactions VERIFIEES (le recu, jamais un evenement seul ; le payeur = tx.from ou le sender d une UserOperation),
 *   en EXCLUANT nos propres wallets. C est l instrument que lisent tous les criteres d arret.
 * ⛔ UN EVENEMENT N EST PAS UNE TRANSACTION. Un Transfer ERC-20 vers a6cf emis par un contrat tiers ne prouve rien : on exige le
 *   STATUT 0x1 du recu et un log Transfer DU CONTRAT DE LA DEVISE, ou un delta de solde ETH (verifie par l appelant, hors module).
 * ⛔ AUCUNE ECRITURE, AUCUNE SIGNATURE : pur, teste a sec. */
import { keccak256 } from './keccak.js';
import { FEE_WALLET, FEE_WALLET_LEGACY_37EB, USDC_BASE } from './frais-creation.js';
import { WETH_BASE } from './plan-eth-block.js';

/** Les devises dont un Transfer vers a6cf COMPTE. ⛔ Liste blanche : n importe quel contrat peut emettre un Transfer nommant a6cf
 *  (spam, faux jetons) — sans elle, un attaquant gonfle le compteur pour le prix d un log. Les actions (frais Aerodrome EN SORTIE,
 *  donc dans le jeton de l action) sont ajoutees par l appelant, depuis la liste du serveur, jamais depuis la requete. */
export function devisesComptees(extra = []) {
  const s = new Set([bas(USDC_BASE), bas(WETH_BASE)]);
  for (const a of extra) if (ADR.test(bas(a))) s.add(bas(a));
  return s;
}

const enHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const TOPIC_TRANSFER = '0x' + enHex(keccak256(new TextEncoder().encode('Transfer(address,address,uint256)')));
const TOPIC_USER_OP = '0x' + enHex(keccak256(new TextEncoder().encode('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)')));
/* ⛔ 2026-10-17 (audit Grok, LOW) : un UserOperationEvent emis par N IMPORTE quel contrat designait le payeur — imitable. Seuls comptent
 *   ceux des EntryPoints, adresses LUES sur Base le 2026-10-17 (base.drpc.org, 10 derniers blocs : 37 logs de l une, 20 de l autre,
 *   les deux avec du bytecode) — jamais recopiees de memoire. */
const ENTRY_POINTS = new Set(['0x0000000071727de22e5e9d8baf0edac6f37da032', '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789']);
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();

/** Les lignes de frais NOMMEES (une par mecanisme) — une ligne absente ne se compte pas, elle n est pas « 0 ». */
export const LIGNES_FRAIS = Object.freeze(['swap_action', 'swap_devise', 'multipool', 'hook_block', 'banque', 'skin_mint', 'skin_vente', 'naissance', 'geste', 'autre']);

/** Nos wallets : le wallet de frais lui-meme, l ancien, et ceux que l operateur declare (sondes, Grok, dev). ⛔ Liste fermee, lue une
 *  fois ; une adresse qui n y est pas est EXTERNE par defaut — c est le sens du compteur. */
export function walletsInternes(declares = []) {
  const s = new Set([bas(FEE_WALLET), bas(FEE_WALLET_LEGACY_37EB)]);
  for (const a of declares) if (ADR.test(bas(a))) s.add(bas(a));
  return s;
}

/** Qui a REELLEMENT paye : tx.from, sauf pour une UserOperation ERC-4337 (le from est le bundler) : le `sender` indexe du
 *  UserOperationEvent EMIS PAR UN ENTRYPOINT. Plusieurs operations dans le lot : celle dont le sender a lui-meme envoye un Transfer
 *  vers le wallet de frais ; sinon c est AMBIGU -> null (le frais n est pas compte : mieux vaut un trou dit qu un payeur invente). */
export function payeurDe({ tx, recu, wallet = FEE_WALLET }) {
  const logs = recu && Array.isArray(recu.logs) ? recu.logs : [];
  const senders = [];
  for (const l of logs) {
    const tp = (l && l.topics) || [];
    if (tp.length >= 3 && bas(tp[0]) === TOPIC_USER_OP && ENTRY_POINTS.has(bas(l.address))) {
      const s = '0x' + bas(tp[2]).slice(26); if (ADR.test(s) && !senders.includes(s)) senders.push(s);
    }
  }
  if (senders.length === 1) return senders[0];
  if (senders.length > 1) {
    const w32 = '0x' + bas(wallet).slice(2).padStart(64, '0');
    const payants = new Set(logs.filter((l) => (l.topics || []).length === 3 && bas(l.topics[0]) === TOPIC_TRANSFER && bas(l.topics[2]) === w32)
      .map((l) => '0x' + bas(l.topics[1]).slice(26)));
    const m = senders.filter((s) => payants.has(s));
    return m.length === 1 ? m[0] : null;
  }
  const f = bas(tx && tx.from);
  return ADR.test(f) ? f : null;
}

/**
 * Verifie un recu et en extrait ce que le wallet de frais a RECU en jetons (logs Transfer vers a6cf, emis par le contrat de la devise).
 * L ETH natif n a pas de log : l appelant verifie le delta de solde (verifierArrivee de veille-frais.js) et passe `ethRecu`.
 * @returns {{ ok:true, payeur, externe:boolean, bloc, recus:[{devise, montant:string}] } | { ok:false, etat:'NON_LU'|'REFUSE', pourquoi }}
 */
export function verifierFrais({ tx, recu, internes, devises, wallet = FEE_WALLET, ethRecu = 0n }) {
  const admises = devises instanceof Set ? devises : devisesComptees();
  if (!tx || !recu) return { ok: false, etat: 'NON_LU', pourquoi: 'the transaction or its receipt could not be read yet' };
  if (String(recu.status) !== '0x1') return { ok: false, etat: 'REFUSE', pourquoi: 'this transaction failed on chain' };
  if (bas(recu.transactionHash) !== bas(tx.hash)) return { ok: false, etat: 'REFUSE', pourquoi: 'the receipt is not the one of this transaction' };
  const payeur = payeurDe({ tx, recu, wallet });
  if (!payeur) return { ok: false, etat: 'REFUSE', pourquoi: 'the payer could not be read (or several operations in one bundle and none paid the fee itself)' };
  const w32 = '0x' + bas(wallet).slice(2).padStart(64, '0');
  const parDevise = new Map();
  for (const l of (Array.isArray(recu.logs) ? recu.logs : [])) {
    const tp = (l && l.topics) || [];
    if (tp.length !== 3 || bas(tp[0]) !== TOPIC_TRANSFER || bas(tp[2]) !== w32) continue;
    let m = 0n; try { m = BigInt(String(l.data)); } catch (_) { continue; }
    if (m <= 0n) continue;
    const d = bas(l.address);
    if (!admises.has(d)) continue;
    parDevise.set(d, (parDevise.get(d) || 0n) + m);
  }
  let eth = 0n; try { eth = BigInt(ethRecu); } catch (_) { eth = 0n; }
  if (eth > 0n) parDevise.set('0x' + '0'.repeat(40), eth);
  if (!parDevise.size) return { ok: false, etat: 'REFUSE', pourquoi: 'nothing reached the fee wallet in this transaction' };
  let bloc = null; try { bloc = parseInt(String(recu.blockNumber), 16); } catch (_) { bloc = null; }
  const ensemble = internes instanceof Set ? internes : walletsInternes();
  return { ok: true, payeur, externe: !ensemble.has(payeur), bloc: Number.isInteger(bloc) ? bloc : null,
    recus: [...parDevise.entries()].map(([devise, montant]) => ({ devise, montant: montant.toString() })) };
}

/** Le compteur : { lignes: { <ligne>: { n, parDevise: { <devise>: montant } } }, interne: idem }. Pur : rend un NOUVEL objet. */
export function compterRevenu(etat, { ligne, verif }) {
  const l = LIGNES_FRAIS.includes(ligne) ? ligne : 'autre';
  const e = etat && typeof etat === 'object' ? etat : {};
  const seau = verif.externe ? 'externe' : 'interne';
  const copie = { externe: { ...(e.externe || {}) }, interne: { ...(e.interne || {}) } };
  const cur = copie[seau][l] ? { n: copie[seau][l].n, parDevise: { ...copie[seau][l].parDevise } } : { n: 0, parDevise: {} };
  cur.n += 1;
  for (const r of verif.recus) cur.parDevise[r.devise] = (BigInt(cur.parDevise[r.devise] || '0') + BigInt(r.montant)).toString();
  copie[seau][l] = cur;
  return copie;
}
