// ref-vitrine.js — un block est une VITRINE : un acheteur arrive par ?block=B&ref=B, et le createur de B touche 30 % de NOTRE frais
// sur ses achats VERIFIES (2026-10-17, etape 2 du levier). PUR : aucune lecture reseau, aucune signature. Partage app + serveur.
// Repris de Grok (ref-bloc.js 7de34c7) : parseur strict (une seule ref, 40 hex, jamais l adresse nulle, chaine coherente) et
//   premier contact garde 30 jours. AJOUTE apres revue (workflow 2026-10-17) :
//   ⛔ la ref ne compte QUE si elle est le block de la page (ref == block) : sinon n importe qui colle sa ref sur la vitrine d un autre ;
//   ⛔ une visite n est JAMAIS de l argent : la part n existe que sur un frais VERIFIE par le serveur (revenu-externe.js, /api/paye),
//      le createur est LU sur la chaine (stockage du hook), jamais pris dans la requete ; createur == payeur -> rien (auto-parrainage) ;
//   ⛔ la part se calcule sur les montants RECUS par le wallet de frais, devise par devise : TB garde floor(70 %), le createur le reste —
//      la meme regle que BlockMissions.split (Grok, part-createur-tx.js) ; on ne doit jamais plus que ce qu on a recu.
export const DUREE_MS = 30 * 86400000;
const ADR = /^0x[0-9a-fA-F]{40}$/;
const NULLE = '0x' + '0'.repeat(40);

/** search = location.search -> la ref (minuscule) SEULEMENT si elle est le block de la page ; sinon null. */
export function lireRefVitrine(search, { chain } = {}) {
  let q;
  try { q = new URLSearchParams(String(search || '')); } catch (_) { return null; }
  const refs = q.getAll('ref'), blocks = q.getAll('block');
  if (refs.length !== 1 || blocks.length !== 1 || !ADR.test(refs[0])) return null;
  const r = refs[0].toLowerCase();
  if (r === NULLE || r !== String(blocks[0]).toLowerCase()) return null;
  const c = q.get('chain');
  if (c != null && chain != null && String(c) !== String(chain)) return null;
  return r;
}

/** le lien de partage d un block : ouvre sa vitrine ET l attribue. */
export function lienVitrine(origine, block, chain) {
  if (!ADR.test(String(block || '')) || String(block).toLowerCase() === NULLE) throw new Error('ref-vitrine: block address not read');
  const b = String(block).toLowerCase();
  return `${String(origine).replace(/\/+$/, '')}/?block=${b}&chain=${Number(chain)}&ref=${b}`;
}

/** premier contact, 30 jours : un second lien n ecrase pas le premier. existant = {ref, depuis} | null. */
export function attribuer(existant, ref, maintenant) {
  if (existant && ADR.test(String(existant.ref || '')) && Number.isFinite(existant.depuis) && maintenant - existant.depuis < DUREE_MS) return existant;
  if (!ref) return null;
  return { ref, depuis: maintenant };
}
export const refActive = (a, maintenant) => (a && ADR.test(String(a.ref || '')) && Number.isFinite(a.depuis) && maintenant - a.depuis < DUREE_MS ? String(a.ref).toLowerCase() : null);

/** la part du createur sur un montant recu (unites brutes, chaine decimale) : montant - floor(montant * 7000 / 10000). */
export function partCreateur(montant) {
  const m = BigInt(montant);
  if (m <= 0n) return '0';
  return (m - (m * 7000n) / 10000n).toString();
}

/** une ligne du registre public, a partir d un frais VERIFIE. createur = lu sur la chaine (null = non lu). Pur. */
export function ligneRegistre({ hash, jour, ligne, bloc, verif, createur }) {
  const frais = Object.fromEntries(verif.recus.map((r) => [r.devise, r.montant]));
  const base = { hash, jour, ligne, bloc, payeur: verif.payeur, createur: createur || null, frais };
  if (!createur) return { ...base, etat: 'CREATEUR_NON_LU', du: {} };
  if (String(createur).toLowerCase() === String(verif.payeur).toLowerCase()) return { ...base, etat: 'AUTO_PARRAINAGE', du: {} };
  return { ...base, etat: 'DU', du: Object.fromEntries(verif.recus.map((r) => [r.devise, partCreateur(r.montant)])) };
}

/** totaux dus par createur et par devise (lignes etat DU seulement). Pur. */
export function totauxParCreateur(lignes) {
  const t = {};
  for (const l of lignes) {
    if (l.etat !== 'DU') continue;
    const c = (t[l.createur] = t[l.createur] || {});
    for (const [d, m] of Object.entries(l.du)) c[d] = (BigInt(c[d] || '0') + BigInt(m)).toString();
  }
  return t;
}
