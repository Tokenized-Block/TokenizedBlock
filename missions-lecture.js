/* missions-lecture.js — LIRE le tableau des missions de BlockMissionsV3 par ses vues (taskCount, tasks(i), holdOf(i), escrowLeft(i)). PUR.
 * ⛔ Pourquoi les vues et pas les logs : la verite est l etat du contrat, et les noeuds publics plafonnent les fenetres de logs
 *   (publicnode : pas d archive ; drpc : 10 blocs). Une vue n a pas de fenetre.
 * ⛔ Rien ici ne signe. Une valeur illisible -> la mission est rendue `lue: false`, jamais completee par une valeur devinee.
 * Disposition des retours (BlockMissionsV3 @ a23bdfa) :
 *   tasks(i) -> Task { blockToken, paired, rewardToken, creator, reward, maxDone, done, perWallet, expiry, target, topic0, descHash } (12 mots)
 *   holdOf(i) -> (minBlock, minPaired, bonusMinBlock, bonusBps, window) (5 mots) ; escrowLeft(i) -> uint256 ; taskCount() -> uint256 */
import { selecteur } from './keccak.js';

const sel = (f) => String(selecteur(f)).replace(/^0x/, '');
export const SEL = Object.freeze({
  taskCount: sel('taskCount()'), tasks: sel('tasks(uint256)'), holdOf: sel('holdOf(uint256)'), escrowLeft: sel('escrowLeft(uint256)'),
  verifier: sel('verifier()'), paused: sel('paused()'),
});
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
export const appel = (nom, i) => '0x' + SEL[nom] + (i === undefined ? '' : mot(i));
const mots = (hex) => { const s = String(hex || '').replace(/^0x/, ''); const out = []; for (let k = 0; k + 64 <= s.length; k += 64) out.push(s.slice(k, k + 64)); return out; };
const adr = (w) => '0x' + w.slice(24).toLowerCase();
const nb = (w) => BigInt('0x' + w);

/** decode le retour de tasks(i). 12 mots exactement, sinon null. */
export function decoderTache(hex) {
  const w = mots(hex);
  if (w.length !== 12) return null;
  return { blockToken: adr(w[0]), paired: adr(w[1]), rewardToken: adr(w[2]), creator: adr(w[3]), reward: nb(w[4]).toString(),
    maxDone: Number(nb(w[5])), done: Number(nb(w[6])), perWallet: Number(nb(w[7])), expiry: Number(nb(w[8])), target: adr(w[9]),
    topic0: '0x' + w[10], descHash: '0x' + w[11] };
}

/** decode le retour de holdOf(i). 5 mots, sinon null. */
export function decoderDetention(hex) {
  const w = mots(hex);
  if (w.length !== 5) return null;
  return { minBlock: nb(w[0]).toString(), minPaired: nb(w[1]).toString(), bonusMinBlock: nb(w[2]).toString(), bonusBps: Number(nb(w[3])), window: Number(nb(w[4])) };
}

/** l etat d une mission pour l ecran, a un instant donne (secondes). */
export function etatMission(t, escrow, maintenant) {
  if (!t) return 'NON_LU';
  if (BigInt(escrow || 0) === 0n) return 'FERMEE';
  if (maintenant >= t.expiry) return 'EXPIREE';
  if (t.done >= t.maxDone) return 'COMPLETE';
  return 'OUVERTE';
}

/** lit toute la table (au plus `max` missions, les plus recentes d abord). rpc injecte : (methode, params) -> result. */
export async function lireMissions({ rpc, contrat, max = 50, maintenant = Math.floor(Date.now() / 1000) }) {
  const n = Number(BigInt(await rpc('eth_call', [{ to: contrat, data: appel('taskCount') }, 'latest'])));
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('taskCount unreadable');
  const ids = [];
  for (let i = n - 1; i >= 0 && ids.length < max; i--) ids.push(i);
  const missions = [];
  for (const i of ids) {
    let t = null, h = null, e = null;
    try {
      const [rt, rh, re] = await Promise.all([
        rpc('eth_call', [{ to: contrat, data: appel('tasks', i) }, 'latest']),
        rpc('eth_call', [{ to: contrat, data: appel('holdOf', i) }, 'latest']),
        rpc('eth_call', [{ to: contrat, data: appel('escrowLeft', i) }, 'latest']),
      ]);
      t = decoderTache(rt); h = decoderDetention(rh); e = BigInt(re).toString();
    } catch (_) { /* illisible : dit plus bas */ }
    missions.push(t && h && e !== null ? { id: i, lue: true, ...t, detention: h, escrowLeft: e, etat: etatMission(t, e, maintenant) } : { id: i, lue: false, etat: 'NON_LU' });
  }
  return { total: n, missions, bornee: n > max };
}
