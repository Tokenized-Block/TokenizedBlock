// resume-tx.js — une transaction du fil, dite en UNE phrase qu on comprend tout de suite.
// ================================================================================================
// ⛔ DEMANDE DE PHIL (2026-09-13) : « detaille mieux la tx en une ligne, on comprend tout direct ». Le fil
//    affichait chaque Transfer brut (« jubjub · 0xab7d…9ab2 → 0x4985…2b2b · signed by 0x208e…0105 ») :
//    deux lignes par swap, un routeur et le PoolManager que personne ne reconnait.
// ⛔ ON DIT LA STRUCTURE, JAMAIS L INTENTION : « a achete via le pool » veut dire que des jetons sont SORTIS du
//    PoolManager dans une transaction signee par ce compte. Le signataire est `tx.from` (lu), pas l evenement.
// ⚠️ ACHAT / VENTE SONT ICI DEDUITS DES TRANSFERTS DU BLOCK (sortie / entree du PoolManager), pas du log Swap :
//    un swap qui traverse le pool dans les deux sens dans la meme tx est dit « swapped through the pool ».
import { formaterUnites } from './montants.js';

const ZERO = '0x0000000000000000000000000000000000000000';
export const GENRES_RESUME = ['ACHAT', 'VENTE', 'ALLER_RETOUR', 'FRAPPE', 'MEMOIRE', 'MESSAGE', 'ENVOI'];

/** 1234567.89 -> « 1.23M » ; au-dessous de 1 000, jusqu a 4 decimales significatives. */
export function montantCourt(brut, decimales) {
  if (typeof brut !== 'bigint' || !Number.isInteger(decimales)) return '?';
  const n = Number(formaterUnites(brut, decimales));
  if (!Number.isFinite(n)) return formaterUnites(brut, decimales);
  const unites = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [v, s] of unites) if (n >= v) return (Math.round((n / v) * 100) / 100) + s;
  return String(Math.round(n * 10000) / 10000);
}

/**
 * @param {object} o
 * @param {object[]} o.transfers   les Transfer du block DANS la meme transaction ({from,to,value})
 * @param {string|null} o.signataire  `tx.from`, lu ; null si la transaction n a pas ete lue
 * @param {string|null} o.sym
 * @param {number|null} o.decimales
 * @param {string} o.poolManager
 * @param {(a:string)=>string} o.nom  nomme une adresse (connue ou courte)
 * @param {{etat:string,texte?:string}|null} o.memo
 * @returns {{genre:string, phrase:string}}
 */
export function resumerTransaction({ transfers, signataire, sym, decimales, poolManager, nom, memo = null }) {
  const pm = String(poolManager || '').toLowerCase();
  const S = String(sym || 'tokens');
  const qui = signataire ? nom(signataire) : 'someone (transaction not read)';
  const somme = (liste) => liste.reduce((s, t) => s + (typeof t.value === 'bigint' ? t.value : 0n), 0n);
  const q = (v) => (Number.isInteger(decimales) ? montantCourt(v, decimales) : 'an unknown amount of');
  const sortis = transfers.filter((t) => t.from.toLowerCase() === pm);
  const entres = transfers.filter((t) => t.to.toLowerCase() === pm);
  const frappes = transfers.filter((t) => t.from.toLowerCase() === ZERO);

  if (frappes.length) {
    const vers = [...new Set(frappes.map((t) => nom(t.to)))].join(', ');
    return { genre: 'FRAPPE', phrase: q(somme(frappes)) + ' ' + S + ' minted to ' + vers };
  }
  if (sortis.length && entres.length) {
    return { genre: 'ALLER_RETOUR', phrase: qui + ' swapped ' + S + ' through the pool (in and out in one transaction)' };
  }
  if (sortis.length) return { genre: 'ACHAT', phrase: qui + ' bought ' + q(somme(sortis)) + ' ' + S + ' from the pool' };
  if (entres.length) return { genre: 'VENTE', phrase: qui + ' sold ' + q(somme(entres)) + ' ' + S + ' into the pool' };

  const soi = transfers.length === 1 && transfers[0].from.toLowerCase() === transfers[0].to.toLowerCase();
  if (soi && memo && memo.etat === 'LU' && /^tbm\d+ /.test(memo.texte)) {
    return { genre: 'MEMOIRE', phrase: qui + ' recorded ' + S + '\'s brain memory on chain' };
  }
  if (memo && memo.etat === 'LU') {
    const t = transfers[0];
    return { genre: 'MESSAGE', phrase: nom(t.from) + ' sent ' + q(t.value) + ' ' + S + ' to ' + nom(t.to) + ' with a message' };
  }
  const t = transfers[0];
  const signeAilleurs = signataire && signataire.toLowerCase() !== t.from.toLowerCase() ? ' (signed by ' + nom(signataire) + ')' : '';
  return { genre: 'ENVOI', phrase: nom(t.from) + ' sent ' + q(somme(transfers)) + ' ' + S + ' to ' + nom(t.to) + signeAilleurs };
}
