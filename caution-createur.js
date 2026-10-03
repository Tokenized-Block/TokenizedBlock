/* caution-createur.js — LE MINIMUM DU CREATEUR (hook 7030) : le LIRE, et preparer sa sortie. Aucune signature ici.
 *
 * ⛔⛔ POURQUOI (2026-10-04) : la naissance sur le hook 7030 depose le minimum du createur (~1 $ de la devise appariee) chez le
 *   contrat du marche. L ecran Create le dit depuis 225bc4e, et disait aussi « this app does not offer that step yet » : le
 *   createur ne pouvait le reprendre qu en appelant le contrat a la main. Ce module est ce pas manquant, partage par l ecran et
 *   par le MCP : il LIT l etat, et rend les appels NON SIGNES. Le wallet du createur signe.
 * LA REGLE, lue dans la source du hook deploye (TBlockLaunchLockHook) et verifiee sur fork (banc-naissance-7030-fork) :
 *   · `createurs(id)` = (qui, retraitDes, nDeploy) ; `caution(id)` = depose ; `minimumCaution(id)` = fixe a la naissance ;
 *   · la part du createur (PART_CREATEUR, 300 ppm = 0,03 %) coule tant que qui != 0, retraitDes == 0 ET caution >= minimum ;
 *   · `demanderRetrait(key)` : pose retraitDes = maintenant + DELAI_RETRAIT (604 800 s = 7 jours) — LA PART S ARRETE AUSSITOT ;
 *   · `retirerCaution(key)` : possible a partir de retraitDes ; rend TOUT le depot au createur ; avant : RetraitPasPret ;
 *   · seul le createur inscrit peut appeler l un ou l autre (PasLeCreateur).
 * ⛔ CE QUE CA COUTE DE SORTIR, et l ecran doit le dire AVANT : des la demande, les 0,03 % ne vont plus au createur. Le depot ne
 *   rapporte rien pendant les 7 jours, et apres le retrait la part ne revient qu en redeposant (`recharger`, non propose ici).
 * ⛔ BORNE : lecture a un instant ; l appel prepare n est PAS simule ici — l appelant le simule (ecran) ou le dit (MCP). */
import { selecteur, poolId, cleDePool, encodeInitializePool } from './pool.js';

const ETH = '0x0000000000000000000000000000000000000000';
const bas = (a) => String(a || '').toLowerCase();
export const SIG_DEMANDER_RETRAIT = 'demanderRetrait((address,address,uint24,int24,address))';
export const SIG_RETIRER_CAUTION = 'retirerCaution((address,address,uint24,int24,address))';
/** La cle de pool d un block ne sur le hook 7030 contre `devise` : frais LP 0, espacement 200 (lancer-pool.js), hooks = le hook. */
export function cleMarcheCreateur({ bloc, devise, hook }) {
  return cleDePool(devise || ETH, bloc, { fee: 0, tickSpacing: 200, hooks: hook });
}
/* les cinq mots de la cle, tels que le contrat les attend (tuple statique) : repris de l encodeur canonique, pas recopies */
const motsCle = (cle) => encodeInitializePool(cle, 0n).slice(10, 10 + 5 * 64);
export function appelDemanderRetrait({ hook, cle }) {
  return { to: hook, data: '0x' + selecteur(SIG_DEMANDER_RETRAIT) + motsCle(cle), value: '0x0', nom: 'Ask to take back the creator minimum (your 0.03% share stops now)', role: 'exit-request' };
}
export function appelRetirerCaution({ hook, cle }) {
  return { to: hook, data: '0x' + selecteur(SIG_RETIRER_CAUTION) + motsCle(cle), value: '0x0', nom: 'Take back the creator minimum', role: 'exit' };
}

/**
 * L etat du minimum du createur pour CE marche. `maintenantSec` = l heure de la CHAINE si l appelant la connait (sinon l horloge).
 * @returns {Promise<{ etat:'LUE'|'AUCUN'|'NON_MESURE', pourquoi?:string, createur?:string, depose?:bigint, minimum?:bigint,
 *   retraitDes?:number, partActive?:boolean, phase?:'ACTIF'|'SORTIE_DEMANDEE'|'RETIRABLE'|'RETIRE'|'SOUS_LE_MINIMUM',
 *   secondesRestantes?:number, delaiSec?:number }>}
 */
export async function etatCautionCreateur({ rpc, hook, cle, maintenantSec = Math.floor(Date.now() / 1000) }) {
  const id = poolId(cle).slice(2);
  const lire = (sig) => rpc('eth_call', [{ to: hook, data: '0x' + selecteur(sig) + (sig.includes('bytes32') ? id : '') }, 'latest']);
  let rc, rd, rm, rdelai;
  try {
    [rc, rd, rm, rdelai] = await Promise.all([lire('createurs(bytes32)'), lire('caution(bytes32)'), lire('minimumCaution(bytes32)'), lire('DELAI_RETRAIT()')]);
  } catch (e) { return { etat: 'NON_MESURE', pourquoi: 'the market contract could not be read: ' + String((e && e.message) || e).slice(0, 120) }; }
  const h = String(rc || '').replace(/^0x/, '');
  if (h.length < 192 || String(rd).length < 66 || String(rm).length < 66 || String(rdelai).length < 66) return { etat: 'NON_MESURE', pourquoi: 'the market contract gave an incomplete answer' };
  const createur = '0x' + h.slice(24, 64), retraitDes = Number(BigInt('0x' + h.slice(64, 128)));
  const depose = BigInt(rd), minimum = BigInt(rm), delaiSec = Number(BigInt(rdelai));
  if (/^0x0{40}$/.test(createur)) return { etat: 'AUCUN', pourquoi: 'no creator minimum was ever deposited for this market' };
  const partActive = retraitDes === 0 && minimum !== 0n && depose >= minimum;
  let phase;
  if (retraitDes === 0) phase = depose >= minimum && minimum !== 0n ? 'ACTIF' : 'SOUS_LE_MINIMUM';
  else if (depose === 0n) phase = 'RETIRE';
  else phase = maintenantSec >= retraitDes ? 'RETIRABLE' : 'SORTIE_DEMANDEE';
  return { etat: 'LUE', createur: bas(createur), depose, minimum, retraitDes, partActive, phase, delaiSec,
    secondesRestantes: phase === 'SORTIE_DEMANDEE' ? Math.max(0, retraitDes - maintenantSec) : 0 };
}

/** Ce que CE compte peut signer maintenant pour ce marche : l appel non signe, ou la raison nommee. */
export function sortieCautionPour({ etat, compte, hook, cle }) {
  if (!etat || etat.etat !== 'LUE') return { appel: null, pourquoi: (etat && etat.pourquoi) || 'the creator minimum could not be read' };
  if (bas(compte) !== etat.createur) return { appel: null, pourquoi: 'only the wallet that created this market can take the creator minimum back' };
  if (etat.phase === 'ACTIF' || etat.phase === 'SOUS_LE_MINIMUM') return { appel: appelDemanderRetrait({ hook, cle }), etape: 'DEMANDER' };
  if (etat.phase === 'RETIRABLE') return { appel: appelRetirerCaution({ hook, cle }), etape: 'RETIRER' };
  if (etat.phase === 'SORTIE_DEMANDEE') return { appel: null, pourquoi: 'the request is made: the minimum can be taken back in ' + etat.secondesRestantes + ' seconds' };
  return { appel: null, pourquoi: 'the creator minimum was already taken back' };
}
