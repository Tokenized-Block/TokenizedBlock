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
  { cle: 'NON_LU', titre: 'Market unread — node/RPC lag, not a broken block' },
  { cle: 'MORT', titre: 'Dead — its creator held it and holds none now' },
]);
/* ⛔⛔ UN EMOJI QUI NE S AFFICHE PAS N EST PAS UN EMOJI (Phil, 2026-09-17 : capture d un carre vide a la
 * place de 🪵 devant « ARC · Trunk »). 🪵 (Emoji 12.0, 2019) et 🏞 manquent dans les polices de
 * plusieurs systemes Windows : ils sortent en tofu. Ici, uniquement des caracteres d Emoji 1.0 (2015),
 * presents partout — et la progression reste lisible : bosquet, arbre, palmier, feuille, herbe, pousse. */
export const EMOJI_STADE = Object.freeze({ MONUMENT: '🏛', FORET: '🌲', CANOPEE: '🌳', TRONC: '🌴', BRANCHE: '🍃', POUSSE: '🌿',
  GRAINE: '🌱', PRIX_NON_LU: '⏳', NOURRI: '✨', SANS_MARCHE: '💤', NON_LU: '⏳', MORT: '⚫' });

/**
 * ⛔ DEUXIEME SOURCE DE CAP (2026-09-17) : notre noeud ne lit la vie que des premiers blocks — en prod
 *    251 blocks tombaient dans « market unread » alors que le marche public en cote plus de 200. Un
 *    `capUsdMarche` (FDV lue par le serveur chez DexScreener) juge alors le palier, et le block porte
 *    `source:'MARCHE'`. Ce n est PAS une lecture on-chain : l appelant doit le dire a l ecran.
 * ⛔ PRIORITE INCHANGEE : une vie LUE on-chain gagne toujours ; le marche ne sert qu a ce qu on n a
 *    pas lu. Sans aucune des deux, le block reste dans NON_LU — jamais range en Seed.
 * @param {{ blocks: {adr:string, sym?:string|null, vie?:number|null, devise?:string|null, etatVie?:string|null,
 *   capUsdMarche?:number|null,
 *   nourriture?:{etat:string, gm:number, messages:number, detenteurs:number, mort:boolean|null}|null}[], ethUsd: number|null }} o
 * @returns {{ groupes: {cle:string, titre:string, blocks:{adr:string, sym:string|null, capUsd:number|null, pct:number|null,
 *   prochain:string|null, source:string}[]}[], total:number, parMarche:number }}
 */
export function stadesDesBlocks({ blocks, ethUsd = null }) {
  const prixOk = typeof ethUsd === 'number' && Number.isFinite(ethUsd) && ethUsd > 0;
  const par = new Map();
  const mettre = (cle, b) => { if (!par.has(cle)) par.set(cle, []); par.get(cle).push(b); };
  let total = 0, parMarche = 0;
  for (const x of Array.isArray(blocks) ? blocks : []) {
    if (!x || !/^0x[0-9a-fA-F]{40}$/.test(String(x.adr))) continue;
    total++;
    const n = x.nourriture && x.nourriture.etat === 'LUE' ? x.nourriture : null;
    /* ⛔ PHIL (2026-09-14) : « ne donne pas les noms, on a deja trop de monde — nos blocks du launcher en priorite » */
    const base = { adr: String(x.adr).toLowerCase(), sym: x.sym || null, nous: x.nous === true, capUsd: null, pct: null, prochain: null, source: 'RIEN' };
    if (n && n.mort === true) { mettre('MORT', base); continue; }
    const vieLue = x.etatVie === 'LUE' && typeof x.vie === 'number' && Number.isFinite(x.vie) && x.vie > 0;
    if (vieLue) {
      if (x.devise !== 'ETH' || !prixOk) { mettre('PRIX_NON_LU', base); continue; }
      const capUsd = x.vie * ethUsd;
      const p = progressionPalier(capUsd);
      if (p.etat !== 'LU') { mettre('PRIX_NON_LU', base); continue; }
      mettre(p.palier.cle, { ...base, capUsd, pct: p.prochain ? p.pct : null, prochain: p.prochain ? p.prochain.titre : null, source: 'CHAINE' });
      continue;
    }
    /* seconde source : la FDV du marche public, quand notre noeud n a pas lu ce block */
    const capMarche = typeof x.capUsdMarche === 'number' && Number.isFinite(x.capUsdMarche) && x.capUsdMarche > 0
      ? x.capUsdMarche : null;
    if (capMarche !== null) {
      const p = progressionPalier(capMarche);
      if (p.etat === 'LU') {
        parMarche++;
        mettre(p.palier.cle, { ...base, capUsd: capMarche, pct: p.prochain ? p.pct : null,
          prochain: p.prochain ? p.prochain.titre : null, source: 'MARCHE' });
        continue;
      }
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
    l.sort((a, b) => Number(b.nous) - Number(a.nous) || (b.capUsd ?? -1) - (a.capUsd ?? -1) || String(a.sym || '').localeCompare(String(b.sym || '')));
    groupes.push({ cle: g.cle, titre: g.titre, blocks: l, nous: l.filter((b) => b.nous).length, autres: l.filter((b) => !b.nous).length });
  }
  return { groupes, total, parMarche };
}
