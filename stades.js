// stades.js — ranger les blocks par STADE, pour voir qui en est ou : la progression et l evolution d un block.
// ================================================================================================
// ⛔ DEMANDE DE PHIL (2026-09-14) : « classe bien les blocks pour qu on voie qui est a quel stade — ca donne une
//    impression de progression et d evolution du block ».
// ⛔ UN SEUL BAREME : les paliers de `pointsdevie.js` (en dollars), convertis depuis la vie en ETH par un prix ETH/USD
//    MESURE. Sans ce prix, aucun palier n est juge — le block va dans « tier not judged », jamais dans Seed.
// ⛔⛔ « PAS LU » N EST PAS LE PLUS BAS STADE. Un block dont la vie n a pas ete lue n est pas range en Seed ni en
//    « sans marche » : il a son propre groupe, dit comme un fait sur NOTRE lecture. Meme regle pour la mort : elle
//    n est dite que sur `mort === true` (le createur a detenu puis tombe a zero).
// ⚠️ Un palier suit le prix, dans les deux sens : c est un etat, pas une recompense acquise.
import { progressionPalier, PALIERS } from './pointsdevie.js';

export const STADES_HORS_PALIER = Object.freeze([
  { cle: 'PRIX_NON_LU', titre: 'Tier not judged — the ETH/USD price is not read yet' },
  { cle: 'NOURRI', titre: 'Awake — no market yet, fed by its community' },
  { cle: 'SANS_MARCHE', titre: 'No market yet — never traded, not worthless' },
  { cle: 'NON_LU', titre: 'Not read yet — about our reading, not about the block' },
  { cle: 'MORT', titre: 'Dead — its creator held it and holds none now' },
]);
export const EMOJI_STADE = Object.freeze({ MONUMENT: '🏛', FORET: '🏞', CANOPEE: '🌲', TRONC: '🪵', BRANCHE: '🌳', POUSSE: '🌿',
  GRAINE: '🌱', PRIX_NON_LU: '⏳', NOURRI: '✨', SANS_MARCHE: '💤', NON_LU: '⏳', MORT: '⚫' });

/**
 * @param {{ blocks: {adr:string, sym?:string|null, vie?:number|null, devise?:string|null, etatVie?:string|null,
 *   nourriture?:{etat:string, gm:number, messages:number, detenteurs:number, mort:boolean|null}|null}[], ethUsd: number|null }} o
 * @returns {{ groupes: {cle:string, titre:string, blocks:{adr:string, sym:string|null, capUsd:number|null, pct:number|null,
 *   prochain:string|null}[]}[], total:number }}
 */
export function stadesDesBlocks({ blocks, ethUsd = null }) {
  const prixOk = typeof ethUsd === 'number' && Number.isFinite(ethUsd) && ethUsd > 0;
  const par = new Map();
  const mettre = (cle, b) => { if (!par.has(cle)) par.set(cle, []); par.get(cle).push(b); };
  let total = 0;
  for (const x of Array.isArray(blocks) ? blocks : []) {
    if (!x || !/^0x[0-9a-fA-F]{40}$/.test(String(x.adr))) continue;
    total++;
    const n = x.nourriture && x.nourriture.etat === 'LUE' ? x.nourriture : null;
    const base = { adr: String(x.adr).toLowerCase(), sym: x.sym || null, capUsd: null, pct: null, prochain: null };
    if (n && n.mort === true) { mettre('MORT', base); continue; }
    const vieLue = x.etatVie === 'LUE' && typeof x.vie === 'number' && Number.isFinite(x.vie) && x.vie > 0;
    if (vieLue) {
      if (x.devise !== 'ETH' || !prixOk) { mettre('PRIX_NON_LU', base); continue; }
      const capUsd = x.vie * ethUsd;
      const p = progressionPalier(capUsd);
      if (p.etat !== 'LU') { mettre('PRIX_NON_LU', base); continue; }
      mettre(p.palier.cle, { ...base, capUsd, pct: p.prochain ? p.pct : null, prochain: p.prochain ? p.prochain.titre : null });
      continue;
    }
    if (x.etatVie === 'NON_TROUVEE') {
      mettre(n && n.gm + n.messages + n.detenteurs > 0 ? 'NOURRI' : 'SANS_MARCHE', base);
      continue;
    }
    mettre('NON_LU', base);
  }
  const ordre = [...PALIERS].reverse().map((p) => ({ cle: p.cle, titre: p.titre }))
    .concat(STADES_HORS_PALIER.map((s) => ({ cle: s.cle, titre: s.titre })));
  const groupes = [];
  for (const g of ordre) {
    const l = par.get(g.cle);
    if (!l || !l.length) continue;
    l.sort((a, b) => (b.capUsd ?? -1) - (a.capUsd ?? -1) || String(a.sym || '').localeCompare(String(b.sym || '')));
    groupes.push({ cle: g.cle, titre: g.titre, blocks: l });
  }
  return { groupes, total };
}
