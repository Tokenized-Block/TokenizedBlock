// apercu.js — ce que le wallet va signer, RELU DEPUIS LE CALLDATA, avant l ouverture du wallet.
// ================================================================================================
// ⛔⛔ ON RELIT LA TRANSACTION, PAS L INTENTION. L apercu decode les octets qui partent vraiment
//    (`to`, `data`, `value`) : si l ecran et le calldata divergeaient un jour, c est le calldata qui
//    parle ici. Idee reprise de basedpad.fun (lu le 2026-09-13) : paire, prix, frais et DESTINATAIRE
//    dits avant la signature.
// ⛔ UN APPEL QU ON NE SAIT PAS LIRE EST DIT ILLISIBLE, jamais resume au hasard : « ne signe pas ce
//    que tu ne peux pas lire ».
// ⚠️ FONCTION PURE : aucun reseau. Les noms viennent des modules qui portent deja ces adresses — aucune
//    adresse n est recopiee ici.
import { selecteur, MAX_UINT256, MAX_UINT160 } from './pool.js';
import { lireMemo } from './messages.js';
import { FEE_WALLET, USDC_BASE, USDC_DECIMALES } from './frais-creation.js';
import { FACTORY } from './index-blocks.js';
import { V4_ADRESSES, PERMIT2, PROPRIETAIRE_PERMANENT } from './lancer-pool.js';
import { formaterUnites } from './montants.js';

/** ⛔ RECOPIE de index.html (const ROUTEUR) — le test d echange.js compare la meme valeur ; apercu ne l importe
 *  pas d echange.js pour ne pas tirer le lecteur de marche dans un module pur. */
const ROUTEUR_SWAP = { 84532: '0x492E6456D9528771018DeB9E87ef7750EF184104', 8453: '0x6ff5693b99212DA76aD316178A184AB56D299b43' };

export const ETATS_APERCU = ['LUE', 'INCONNUE'];
const S = {
  transfer: selecteur('transfer(address,uint256)'),
  approve: selecteur('approve(address,uint256)'),
  permit2: selecteur('approve(address,address,uint160,uint48)'),
  create: selecteur('createB20(uint8,bytes32,bytes,bytes[])'),
  execute: selecteur('execute(bytes,bytes[],uint256)'),
  multicall: selecteur('multicall(bytes[])'),
  modify: selecteur('modifyLiquidities(bytes,uint256)'),
};

const court = (a) => a.slice(0, 6) + '…' + a.slice(-4);

/** Le nom d une adresse connue de l app, sinon l adresse courte. */
export function nomDe(adr, { chaine, compte = null, jeton = null, symbole = null } = {}) {
  const a = String(adr || '').toLowerCase();
  const V = V4_ADRESSES[Number(chaine)] || {};
  const connus = [
    [compte, 'you'], [jeton, symbole ? 'the block ' + symbole : 'this block'],
    [FEE_WALLET, 'TokenizedBlock fee wallet'], [USDC_BASE, 'USDC'], [FACTORY, 'B20 factory'],
    [PERMIT2, 'Permit2 (Uniswap)'], [V.posm, 'Uniswap v4 position manager'], [ROUTEUR_SWAP[Number(chaine)], 'Uniswap router'],
    [PROPRIETAIRE_PERMANENT, 'dead address (nobody)'],
  ];
  for (const [x, nom] of connus) if (x && String(x).toLowerCase() === a) return nom + ' ' + court(a);
  return court(a);
}

const mot = (data, i) => data.slice(10 + 64 * i, 10 + 64 * (i + 1));
const adresseDe = (m) => '0x' + m.slice(24);

/**
 * @param {{chaine:number, tx:{to:string,data:string,value?:string}, compte?:string, jeton?:string,
 *   symbole?:string, decimales?:number}} o
 * @returns {{etat:'LUE'|'INCONNUE', action:string, lignes:string[]}}
 */
export function apercuTransaction({ chaine, tx, compte = null, jeton = null, symbole = null, decimales = 18 }) {
  const ctx = { chaine, compte, jeton, symbole };
  const to = String((tx && tx.to) || '').toLowerCase();
  const data = String((tx && tx.data) || '0x').toLowerCase();
  const valeur = tx && tx.value ? BigInt(tx.value) : 0n;
  const lignes = ['Contract: ' + nomDe(to, ctx)];
  if (valeur > 0n) lignes.push('ETH sent with it: ' + formaterUnites(valeur, 18) + ' ETH');
  const sel = data.slice(2, 10);
  const V = V4_ADRESSES[Number(chaine)] || {};

  if (sel === S.transfer && data.length >= 138) {
    const dest = adresseDe(mot(data, 0));
    const montant = BigInt('0x' + mot(data, 1));
    const usdc = to === String(USDC_BASE).toLowerCase();
    const unite = usdc ? 'USDC' : (to === String(jeton || '').toLowerCase() && symbole ? symbole : 'units');
    lignes.push('Sends: ' + formaterUnites(montant, usdc ? USDC_DECIMALES : decimales) + ' ' + unite);
    lignes.push('To: ' + nomDe(dest, ctx));
    const memo = lireMemo(data);
    if (memo.etat === 'LU') lignes.push('Message, public forever: « ' + memo.texte + ' »');
    return { etat: 'LUE', action: dest === String(compte || '').toLowerCase() && montant === 0n
      ? 'Write a message on chain (0 to yourself)' : 'Transfer', lignes };
  }
  if (sel === S.approve && data.length >= 138) {
    const montant = BigInt('0x' + mot(data, 1));
    lignes.push('Lets ' + nomDe(adresseDe(mot(data, 0)), ctx) + ' move '
      + (montant === MAX_UINT256 ? 'ANY amount (unlimited, until you revoke it)' : formaterUnites(montant, decimales)));
    return { etat: 'LUE', action: 'Approval', lignes };
  }
  if (sel === S.permit2 && to === PERMIT2.toLowerCase() && data.length >= 266) {
    const montant = BigInt('0x' + mot(data, 2));
    lignes.push('Token: ' + nomDe(adresseDe(mot(data, 0)), ctx));
    lignes.push('Lets ' + nomDe(adresseDe(mot(data, 1)), ctx) + ' move '
      + (montant === MAX_UINT160 ? 'ANY amount (unlimited)' : formaterUnites(montant, decimales)) + ' through Permit2');
    return { etat: 'LUE', action: 'Permit2 approval', lignes };
  }
  if (sel === S.execute && ROUTEUR_SWAP[Number(chaine)] && to === ROUTEUR_SWAP[Number(chaine)].toLowerCase()) {
    lignes.push('Swaps through the Uniswap v4 router. The amounts, the minimum you accept and the 0.5 % TokenizedBlock fee are listed with this transaction.');
    const frais = FEE_WALLET.slice(2).toLowerCase();
    lignes.push(data.includes(frais) ? 'Fee recipient inside this transaction: TokenizedBlock fee wallet ' + court(FEE_WALLET.toLowerCase())
      : 'No TokenizedBlock fee inside this transaction.');
    return { etat: 'LUE', action: 'Swap', lignes };
  }
  if (sel === S.create && to === FACTORY.toLowerCase()) {
    lignes.push('Creates a new B20 block. You become its admin; the factory refuses a salt already used.');
    return { etat: 'LUE', action: 'Create a block', lignes };
  }
  if ((sel === S.multicall || sel === S.modify) && V.posm && to === V.posm.toLowerCase()) {
    const permanent = data.includes(String(PROPRIETAIRE_PERMANENT).slice(2).toLowerCase().padStart(64, '0'));
    lignes.push(sel === S.multicall ? 'Creates the pool, then places liquidity' : 'Places liquidity in an existing pool');
    lignes.push(permanent ? 'Position owner: dead address — nobody can ever withdraw or collect'
      : 'Position owner: NOT the dead address — this position can be withdrawn by its owner');
    return { etat: 'LUE', action: 'Launch a market', lignes };
  }
  lignes.push('This call could not be read here. Do not sign what you cannot read.');
  return { etat: 'INCONNUE', action: 'Unknown call', lignes };
}
