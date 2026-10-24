/* mesure-misables-decouvertes-20261025.mjs — LES MISABLES AVEC LA TABLE DU 2026-10-25 (regle misables.js INCHANGEE), UNE MESURE LIVE.
 * ⛔ Exige misables.js (branche claude/misables-20261024, pas encore dans ce depot) : a lancer depuis une COPIE ou les deux sont reunis
 *   (misables.js + ce pools-actions-aerodrome.js). CANDIDATS_CL y est derive de POOLS_ACTIONS_AERODROME : ajouter les actions prouvees
 *   a la table EST les ajouter aux candidats — la regle de misables.js n est pas touchee.
 * « avant » = les memes candidats SANS les cinq entrees du 2026-10-25 ; « apres » = tous. Meme rpc, meme bloc epingle, une passe.
 * RPC : base-rpc.publicnode.com (bloc recent, pas d archive). Lecture seule.
 * Usage : node mesure-misables-decouvertes-20261025.mjs <sortie.json> */
import { writeFileSync } from 'node:fs';
import { CANDIDATS_CL, coterMisableTailles, ligneMisable, listeMisables, TAILLES_USDC, USDC } from './misables.js';
import { ALLER_RETOUR_REFUSES } from './pools-actions-aerodrome.js';

const AJOUTS_20261025 = new Set(['SANc', 'SEc', 'ULc', 'NOKc', 'LIc']);
const RPC = 'https://base-rpc.publicnode.com';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const rpc = async (m, p) => {
  for (let k = 0; k < 6; k += 1) {
    n += 1;
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: n, method: m, params: p }) });
      if (r.status === 429 || r.status >= 500) { await pause(1000 * (k + 1)); continue; }
      const j = await r.json();
      if (j.error) { if (/rate|limit/i.test(j.error.message)) { await pause(1000 * (k + 1)); continue; } const e = new Error(j.error.message); e.data = j.error.data; throw e; }
      return j.result;
    } catch (e) { if (k === 5 || /revert|execution/i.test(e.message)) throw e; await pause(800 * (k + 1)); }
  }
  throw new Error('no answer');
};
/* la reference de prix : la pool USDC que sert /api/trending (meme source que le serveur de misables) */
const tr = await (await fetch('https://tokenizedblock.space/api/trending', { headers: { 'x-ms-monitor': '1' } })).json();
const refs = new Map();
for (const l of tr.lignes || []) {
  const adr = String(l.adr || '').toLowerCase(), pool = String(l.poolAdr || '').toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(pool) && String(l.quoteAdr || '').toLowerCase() === USDC) refs.set(adr, { pool });
}
const bloc = parseInt(await rpc('eth_blockNumber', []), 16);
const lignes = [];
for (const c of CANDIDATS_CL) {
  const cot = await coterMisableTailles({ rpc, candidat: c, sorties: TAILLES_USDC, reference: refs.get(c.jeton) || null, bloc })
    .catch((e) => ({ etat: 'NON_MESURE', pourquoi: String(e.message).slice(0, 100) }));
  lignes.push({ ...ligneMisable(c, cot), ajout: AJOUTS_20261025.has(c.symbole) });
}
const compte = (ls) => TAILLES_USDC.map((t, i) => ls.filter((l) => l.tailles && l.tailles[i] && l.tailles[i].misable).length);
const avant = listeMisables(lignes.filter((l) => !l.ajout));
const apres = listeMisables(lignes);
/* 2026-10-25 (revue) : + la regle de l aller-retour (pools-actions-aerodrome.js ALLER_RETOUR_REFUSES), que misables.js doit appliquer a
 *   la fusion — mesuree ici sur les memes lignes */
const sansAllerRetour = listeMisables(lignes.filter((l) => !ALLER_RETOUR_REFUSES.has(String(l.jeton || '').toLowerCase())));
const res = { bloc, rpc: RPC, rpcRequetes: n, candidatsAvant: lignes.filter((l) => !l.ajout).length, candidatsApres: lignes.length,
  tailles: TAILLES_USDC.map(String), misablesAvant: compte(avant), misablesApres: compte(apres),
  candidatsAllerRetour: lignes.filter((l) => !ALLER_RETOUR_REFUSES.has(String(l.jeton || '').toLowerCase())).length, misablesAllerRetour: compte(sansAllerRetour),
  misablesRefusesParAllerRetour: lignes.filter((l) => ALLER_RETOUR_REFUSES.has(String(l.jeton || '').toLowerCase()) && l.tailles && l.tailles.some((t) => t && t.misable)).map((l) => l.symbole),
  nonMesures: lignes.filter((l) => !l.tailles).map((l) => l.symbole),
  ajouts: lignes.filter((l) => l.ajout).map((l) => ({ sym: l.symbole, misable: l.misable, tailles: (l.tailles || []).map((t) => [t.misable, t.ecartBps ?? null, t.code || t.raison || null]) })) };
writeFileSync(process.argv[2] || 'misables-20261025.json', JSON.stringify(res, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 1));
console.log(JSON.stringify({ ...res, ajouts: undefined }));
for (const a of res.ajouts) console.log(a.sym, a.misable, JSON.stringify(a.tailles));
