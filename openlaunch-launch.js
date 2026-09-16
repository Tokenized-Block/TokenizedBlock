// openlaunch-launch.js — prepare un appel `LaunchFactory.launch(...)` OpenLaunch depuis TokenizedBlock. NE SIGNE RIEN.
// ================================================================================================
// ⛔ SOURCE : LaunchFactory verifie sur Sourcify (Base 8453, lu le 2026-09-16) — struct LaunchParams
//    (name, symbol, metadataURI, quote, supply, startTick, lpFee, salt, Recipient[] {payout, bps}).
//    Regles du contrat recopiees ICI comme refus AVANT signature : lpFee <= 30000, startTick multiple de 200 et dans les
//    bornes, bps > 0 et somme = 10000, payout != 0. Quote ETH (address(0)) : le jeton trie toujours au-dessus, pas de findSalt.
// ⛔⛔ DECISION DE LEAD (Claude, mandat de Phil 2026-09-16 « rendre l app rentable ») : un launch fait DEPUIS notre app
//    partage les frais LP : 50 % au lanceur, 50 % a TokenizedBlock (Phil 2026-09-16 « dit 50/50 valide »). C est grave a vie par le locker (aucun retour) :
//    l ecran le dit en clair AVANT la signature, et le wallet montre la calldata. Frais payes dans la quote = ETH reel.
// ⛔ Le module ne lit pas le reseau et n envoie rien : il rend { to, data, value:'0x0', resume }.
import { selecteur } from './encodeur.js';
import { FEE_WALLET } from './frais-creation.js';

export const OL_FACTORY = '0x815542E8b392389A1389E22E588E4B62A67Ade72';
export const OL_LOCKER = '0xcd1680D26922fcd9CabFbb8a56bA40C333fD842a';
export const OL_SIG_LAUNCH = 'launch((string,string,string,address,uint256,int24,uint24,bytes32,(address,uint16)[]))';
export const OL_TOPIC_LAUNCHED_SIG = 'Launched(address,uint256,address,address,bytes32,int24,uint24,uint256,string)';
export const PART_TOKENIZEDBLOCK_BPS = 5000;
export const TICK_SPACING = 200;
const MIN_USABLE = -887200, MAX_USABLE = 887200;
const FRAIS_OK = [0, 10000, 30000];

const mot = (v) => BigInt.asUintN(256, BigInt(v)).toString(16).padStart(64, '0');
const motAdr = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
function dynChaine(s) {
  const h = [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const n = h.length / 2;
  return mot(n) + h + '00'.repeat((32 - (n % 32)) % 32);
}

/** startTick pour une FDV visee (en quote, ex. ETH) avec 1e9 jetons : prix = 1.0001^tick jeton/quote, aligne sur 200. */
export function tickPourFdv(fdvQuote, supply = 1e9) {
  const f = Number(fdvQuote);
  if (!(f > 0) || !Number.isFinite(f)) return null;
  const t = Math.round(Math.log(supply / f) / Math.log(1.0001) / TICK_SPACING) * TICK_SPACING;
  return t > MIN_USABLE && t <= MAX_USABLE ? t : null;
}

/** FDV (en quote) qu un startTick donne a 1e9 jetons — pour AFFICHER ce qui sera grave, recalcule depuis le tick. */
export function fdvDepuisTick(tick, supply = 1e9) { return supply / Math.pow(1.0001, Number(tick)); }

/**
 * @param {{nom:string, symbole:string, lanceur:string, startTick:number, lpFee:number, salt:string, metadataURI?:string}} o
 * @returns {{ etat:'OK', tx:{to,data,value}, resume } | { etat:'REFUSE', pourquoi:string }}
 */
export function planLaunchOL({ nom, symbole, lanceur, startTick, lpFee, salt, metadataURI = '' }) {
  const refus = (pourquoi) => ({ etat: 'REFUSE', pourquoi });
  const n = String(nom || '').trim(), s = String(symbole || '').trim();
  if (!n || n.length > 32) return refus('name: 1 to 32 characters');
  if (!/^[A-Za-z0-9]{1,11}$/.test(s)) return refus('symbol: 1 to 11 letters or digits');
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(lanceur || ''))) return refus('connect your wallet first');
  if (String(lanceur).toLowerCase() === FEE_WALLET.toLowerCase()) return refus('the TokenizedBlock fee wallet cannot launch here');
  if (!FRAIS_OK.includes(Number(lpFee))) return refus('LP fee must be 0, 1 % or 3 %');
  const t = Number(startTick);
  if (!Number.isInteger(t) || t % TICK_SPACING !== 0 || t <= MIN_USABLE || t > MAX_USABLE) return refus('start price out of range');
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(salt || ''))) return refus('salt must be 32 bytes');
  const uri = String(metadataURI || '');
  if (uri.length > 512) return refus('metadata URI too long');

  /* lpFee 0 = aucun frais : on ne nomme alors personne (liste vide = le contrat brule 0). */
  const recipients = Number(lpFee) === 0 ? [] : [
    { payout: String(lanceur), bps: 10000 - PART_TOKENIZEDBLOCK_BPS },
    { payout: FEE_WALLET, bps: PART_TOKENIZEDBLOCK_BPS },
  ];
  if (recipients.length && recipients.reduce((a, r) => a + r.bps, 0) !== 10000) return refus('recipient shares must sum to 100 %');

  /* tuple dynamique : 9 mots de tete, puis les queues dans l ordre name, symbol, metadataURI, recipients */
  const queueNom = dynChaine(n), queueSym = dynChaine(s), queueUri = dynChaine(uri);
  const queueRec = mot(recipients.length) + recipients.map((r) => motAdr(r.payout) + mot(r.bps)).join('');
  const tete = 9 * 32;
  let off = tete;
  const offNom = off; off += queueNom.length / 2;
  const offSym = off; off += queueSym.length / 2;
  const offUri = off; off += queueUri.length / 2;
  const offRec = off;
  const tuple = mot(offNom) + mot(offSym) + mot(offUri) + motAdr('0x0') + mot(0) + mot(t) + mot(lpFee) + String(salt).slice(2).toLowerCase()
    + mot(offRec) + queueNom + queueSym + queueUri + queueRec;
  const data = '0x' + selecteur(OL_SIG_LAUNCH) + mot(32) + tuple;
  return {
    etat: 'OK',
    tx: { to: OL_FACTORY, data, value: '0x0' },
    resume: {
      nom: n, symbole: s, quote: 'ETH', supply: '1,000,000,000', lpFeePct: Number(lpFee) / 10000,
      fdvEth: fdvDepuisTick(t), partLanceurPct: recipients.length ? (10000 - PART_TOKENIZEDBLOCK_BPS) / 100 : 0,
      partTokenizedBlockPct: recipients.length ? PART_TOKENIZEDBLOCK_BPS / 100 : 0,
    },
  };
}
