// origine.js — d ou vient un block, et peut-on encore en frapper ?
// ================================================================================================
// ⛔ MESURE DU 2026-09-13 : 459 creations B20 sur Base en ~22 h, et 2 seulement via TokenizedBlock (TBLOCK, TTB).
//    La carte et le fil montrent TOUS les B20 : sans marque, Phil croyait que chaque block aurait du payer le frais.
// ⛔ LE SIGNE « FAIT AVEC TOKENIZEDBLOCK » = une FACE gravee par Create dans contractURI (data:application/json avec
//    un champ `face` valide). C est une STRUCTURE, pas une preuve d identite : n importe qui pourrait graver la meme
//    forme. L ecran dit « its face was engraved by TokenizedBlock's Create », pas « certifie ».
// ⛔ MESURE DU MEME JOUR (jubjub, 0xb2…c231) : supply 100 Md, plafond = max uint128, le createur garde MINT_ROLE —
//    il peut frapper plus a tout moment. « Scelle » = supply == plafond : plus rien ne peut etre frappe, par personne.
import { faceDuBlock } from './face.js';
import { selecteur } from './pool.js';

export const ORIGINES = ['TOKENIZEDBLOCK', 'AILLEURS', 'NON_LU'];
export const SCELLEMENTS = ['SCELLE', 'OUVERT', 'NON_LU'];

/** L origine d apres l etat de lecture de la face (`faceDuBlock` / `faceDepuisUri`). */
export function origineDepuisFace(etatFace) {
  if (etatFace === 'LU') return 'TOKENIZEDBLOCK';
  if (etatFace === 'AUCUNE' || etatFace === 'AUTRE_SOURCE' || etatFace === 'INVALIDE') return 'AILLEURS';
  return 'NON_LU';
}

/** Scelle si la supply atteint le plafond. ⛔ Une valeur non lue ne se dit ni scellee ni ouverte. */
export function scellementDepuis(supply, plafond) {
  if (typeof supply !== 'bigint' || typeof plafond !== 'bigint') return { etat: 'NON_LU', marge: null };
  if (supply >= plafond) return { etat: 'SCELLE', marge: 0n };
  return { etat: 'OUVERT', marge: plafond - supply };
}

/** Trois lectures : contractURI, totalSupply, supplyCap. */
export async function lireOrigineEtScellement({ rpc, jeton }) {
  const lire = rpc;
  const f = await faceDuBlock({ rpc: lire, jeton });
  let supply = null, plafond = null;
  try {
    supply = BigInt(await lire('eth_call', [{ to: jeton, data: '0x' + selecteur('totalSupply()') }, 'latest']));
    plafond = BigInt(await lire('eth_call', [{ to: jeton, data: '0x' + selecteur('supplyCap()') }, 'latest']));
  } catch { supply = supply ?? null; plafond = null; }
  return { origine: origineDepuisFace(f.etat), scellement: scellementDepuis(supply, plafond) };
}

/** Les phrases a l ecran. */
export function phrasesOrigine({ origine, scellement }) {
  const o = origine === 'TOKENIZEDBLOCK' ? '🧩 Made with TokenizedBlock — its face was engraved by our Create.'
    : origine === 'AILLEURS' ? 'Created elsewhere on Base — not through TokenizedBlock, so no TokenizedBlock fee was paid.'
      : 'Origin not read yet.';
  const s = scellement.etat === 'SCELLE' ? '🔒 Sealed: the supply is at its cap — nobody can mint more.'
    : scellement.etat === 'OUVERT' ? '⚠️ Not sealed: more can still be minted (the cap is above the supply) by whoever holds the mint role.'
      : 'Seal not read.';
  return { origine: o, scellement: s };
}
