// mes-blocks.js — les blocks FRAPPES VERS un wallet, lus au-dela de la fenetre de la map.
// ================================================================================================
// ⛔⛔ BUG SIGNALE PAR PHIL LE 2026-09-13 : « je me suis connecte avec le wallet qui a cree TTB, je ne le vois
//    plus dans My blocks ». Mesure : « My block » ne lisait que les creations des 9 000 derniers blocs (~5 h),
//    et TTB a ete cree ~35 000 blocs plus tot. Mesure du meme jour : scanner les frappes (Transfer depuis 0x0)
//    VERS le wallet, tous jetons, sur 60 000 blocs = 33 appels, 8 s, et TTB est retrouve.
// ⛔ LE NOEUD PUBLIC REFUSE PLUS DE 2 000 BLOCS PAR REQUETE SANS ADRESSE (mesure : 10 000 refuse, 2 000 accepte).
// ⛔ LE PREFIXE 0xb2 NE PROUVE RIEN : n importe qui peut miner une adresse qui commence ainsi. Chaque jeton
//    candidat est verifie par son CODE — le marqueur B20 0xef — avant d etre montre comme un block.
// ⚠️ « FRAPPE VERS TOI » N EST PAS « CREE PAR TOI » : un block cree par quelqu un d autre et frappe vers ce
//    wallet apparait aussi. L ecran le dit avec ces mots-la.
import { TOPIC_TRANSFER, topicAdresse } from './index-blocks.js';

export const FENETRE_FRAPPES = 2000;
const ZERO = '0x0000000000000000000000000000000000000000';
export const ETATS_B20 = ['B20', 'PAS_B20', 'NON_LU'];

/** Le jeton est-il un vrai B20 ? Lu sur son code, jamais deduit de son adresse. */
export async function estB20({ rpc, jeton }) {
  try {
    const code = String(await rpc('eth_getCode', [jeton, 'latest']) || '').toLowerCase();
    if (code === '0x' || code === '') return 'PAS_B20';
    return code.startsWith('0xef') ? 'B20' : 'PAS_B20';
  } catch { return 'NON_LU'; }
}

/**
 * Les B20 frappes vers `compte` entre `deBloc` et `aBloc` (inclus), par fenetres de 2 000 blocs.
 * @returns {Promise<{blocks:{jeton:string,bloc:number,tx:string}[], fenetresRatees:{de:number,a:number,cause:string}[], nonVerifies:string[]}>}
 * ⛔ Une fenetre ratee est NOMMEE, jamais comptee comme vide. Un jeton dont le code n a pas pu etre lu est
 *    rendu dans `nonVerifies`, ni montre ni cache.
 */
export async function frappesVers({ rpc, compte, deBloc, aBloc, surProgres = null }) {
  const cible = topicAdresse(compte);
  if (!cible) return { blocks: [], fenetresRatees: [{ de: deBloc, a: aBloc, cause: 'invalid account' }], nonVerifies: [] };
  const vus = new Map();
  const fenetresRatees = [];
  for (let haut = aBloc; haut >= deBloc; haut -= FENETRE_FRAPPES) {
    const bas = Math.max(deBloc, haut - FENETRE_FRAPPES + 1);
    try {
      const logs = await rpc('eth_getLogs', [{ fromBlock: '0x' + bas.toString(16), toBlock: '0x' + haut.toString(16),
        topics: [TOPIC_TRANSFER, topicAdresse(ZERO), cible] }]);
      for (const l of logs || []) {
        const a = String(l.address || '').toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(a) || vus.has(a)) continue;
        vus.set(a, { jeton: a, bloc: l.blockNumber ? parseInt(l.blockNumber, 16) : null, tx: l.transactionHash || null });
      }
    } catch (e) {
      fenetresRatees.push({ de: bas, a: haut, cause: String((e && e.message) || e) });
    }
    if (surProgres) surProgres({ parcouru: aBloc - bas + 1, total: aBloc - deBloc + 1, trouves: vus.size });
  }
  const blocks = [], nonVerifies = [];
  for (const c of vus.values()) {
    const e = await estB20({ rpc, jeton: c.jeton });
    if (e === 'B20') blocks.push(c);
    else if (e === 'NON_LU') nonVerifies.push(c.jeton);
  }
  blocks.sort((x, y) => (y.bloc ?? 0) - (x.bloc ?? 0));
  return { blocks, fenetresRatees, nonVerifies };
}

/**
 * Fusionne un cache (deja trouve, jusqu au bloc `jusqua`) et un nouveau scan, sans doublon.
 * ⛔ Le cache n avance QUE si le scan n a rate aucune fenetre : sinon on rescannerait jamais le trou.
 */
export function fusionnerCache(cache, scan, aBloc) {
  const avant = cache && Array.isArray(cache.blocks) ? cache.blocks : [];
  const tous = new Map(avant.map((b) => [b.jeton, b]));
  for (const b of scan.blocks) if (!tous.has(b.jeton)) tous.set(b.jeton, b);
  const blocks = [...tous.values()].sort((x, y) => (y.bloc ?? 0) - (x.bloc ?? 0));
  const jusqua = scan.fenetresRatees.length ? (cache && cache.jusqua) || null : aBloc;
  return { blocks, jusqua, profondeur: cache && cache.profondeur };
}
