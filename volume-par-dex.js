/* OU VIT LE VOLUME, ET QUEL PLAFOND NOTRE FRAIS Y ATTEINDRAIT.
 *
 * Pourquoi ce module existe : en mesurant a la main, j ai compte sur deux champs qui
 * N EXISTENT PAS dans la charge /api/trending (`origine`, `vol24`). Le resultat etait
 * un tableau PARFAITEMENT NET et entierement faux — 186 lignes dans une seule case,
 * volume total 0 $. Un champ absent ne leve pas : il fait converger tout le monde.
 * ⇒ La garde de forme est donc le coeur de ce module, pas un ornement.
 *
 * ⛔ CE MODULE NE PREDIT RIEN. `plafondFrais` rend un PLAFOND ARITHMETIQUE qui suppose
 *   100 % du volume route par nous. Le taux de capture reel n est pas ici, et un
 *   plafond presente comme un revenu serait une sur-vente.
 */

/** Champs REELS lus dans la charge servie le 2026-09-30 (pas devines). */
export const CHAMPS_TRENDING_ATTENDUS = Object.freeze([
  'adr', 'sym', 'volume24hUsd', 'liquiditeUsd', 'trades24h', 'dex', 'quoteSym',
]);

/** Le libelle porte par une ligne sans `dex` lisible. Jamais reparti au hasard. */
export const DEX_ABSENT = 'ABSENT';

/** Taux d interface in-app, en points de base. Source unique : echange.js FRAIS_INTERFACE_BPS. */
export const BPS_INTERFACE = 50;

/**
 * La charge a-t-elle la forme attendue ?
 * Rend { ok, manquants, vus } — et `ok` est FAUX des qu un champ manque, pour qu un
 * comptage sur un champ absent ne puisse pas se produire.
 * ⛔ Une liste VIDE n est pas une forme valide : on ne peut rien verifier dessus.
 */
export function verifierForme(lignes, attendus = CHAMPS_TRENDING_ATTENDUS) {
  if (!Array.isArray(lignes) || !lignes.length) {
    return { ok: false, manquants: [...attendus], vus: [], raison: 'LISTE_VIDE' };
  }
  const premiere = lignes[0];
  if (!premiere || typeof premiere !== 'object') {
    return { ok: false, manquants: [...attendus], vus: [], raison: 'LIGNE_NON_OBJET' };
  }
  const vus = Object.keys(premiere);
  const manquants = attendus.filter((k) => !vus.includes(k));
  return { ok: !manquants.length, manquants, vus, raison: manquants.length ? 'CHAMPS_MANQUANTS' : null };
}

/** Un nombre, ou 0 — jamais NaN. ⛔ NaN traverse toutes les bornes sans les declencher. */
function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Agrege le volume par DEX. Rend null si la forme est refusee — un agregat sur une
 * charge non conforme serait un faux resultat, et un faux resultat NET est le pire.
 */
export function agregerParDex(lignes, attendus = CHAMPS_TRENDING_ATTENDUS) {
  const forme = verifierForme(lignes, attendus);
  if (!forme.ok) return null;
  const parDex = new Map();
  let volTotal = 0, tradesTotal = 0, sansDex = 0;
  for (const l of lignes) {
    const brut = String((l && l.dex) || '').trim();
    const d = brut || DEX_ABSENT;
    if (!brut) sansDex += 1;
    const vol = num(l && l.volume24hUsd);
    const tr = num(l && l.trades24h);
    volTotal += vol;
    tradesTotal += tr;
    const p = parDex.get(d) || { blocks: 0, vol: 0, liq: 0, trades: 0 };
    parDex.set(d, {
      blocks: p.blocks + 1,
      vol: p.vol + vol,
      liq: p.liq + num(l && l.liquiditeUsd),
      trades: p.trades + tr,
    });
  }
  const rangs = [...parDex.entries()]
    .map(([dex, p]) => ({ dex, ...p, partVol: volTotal ? p.vol / volTotal : 0 }))
    .sort((a, b) => b.vol - a.vol);
  return { rangs, volTotal, tradesTotal, sansDex, blocks: lignes.length };
}

/**
 * Plafond arithmetique du frais sur ce volume.
 * ⛔ `capture` est OBLIGATOIRE dans la phrase de sortie : sans elle, ce plafond se lit
 *   comme un revenu. On rend donc les DEUX, jamais le montant seul.
 */
export function plafondFrais(volTotal, bps = BPS_INTERFACE) {
  const v = num(volTotal);
  const b = num(bps);
  if (v <= 0 || b <= 0) return { plafond: 0, bps: b, estUnPlafond: true };
  return { plafond: v * b / 10000, bps: b, estUnPlafond: true };
}

/**
 * La phrase qui accompagne le plafond. Elle DOIT nommer l hypothese, sinon le chiffre
 * ment par omission. ⛔ Un null doit PARLER : seul un succes a le droit d etre muet.
 */
export function phrasePlafond(r) {
  if (!r || typeof r.plafond !== 'number') {
    return 'Fee ceiling: not measured.';
  }
  if (r.plafond <= 0) {
    return 'Fee ceiling: 0 — no readable volume in this window.';
  }
  return 'Arithmetic ceiling at ' + r.bps + ' bps, assuming ALL of this volume were routed '
    + 'through our Buy/Sell. Actual capture is not measured here.';
}
