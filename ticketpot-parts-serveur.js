/* ticketpot-parts-serveur.js — deux pieces PURES de GET /api/ticketpot/parts (serveur-web.js), testees a sec (2026-10-23, revue adverse
 *   du pot des recompenses) :
 * (1) cacheTemporise : la boucle du brain de l owner relisait les parts toutes les 30 s (et &week=1 le dernier jour), 6 appels RPC par
 *     lecture (lireJour), sans fin. Un cache par cle (jour+mode, ou jour pour la lecture de chaine) : ttlMs pour un succes, ttlEchecMs pour
 *     un echec ou une exception (une chaine en panne ne se fait pas marteler), un vol PARTAGE (deux requetes = un calcul), une borne de cles,
 *     et invalider(cle) — avec une GENERATION : un calcul en vol au moment de l invalidation n est PAS garde (sinon 60 s de parts perimees).
 * (2) couvertureParts : des parts FINALES (signees par le verifier, reclamables pour toujours) ne doivent pas venir d un index qui a manque
 *     des blocs. Ce que le serveur PEUT prouver, source par source ; inconnu -> false, jamais suppose :
 *       registre : revenu.depuis (le registre des jours) existait avant le debut de la periode ;
 *       rolls    : le curseur de lecture des logs BlockRolls (revenu.rollsScan) a un horodatage >= la fin de la periode (null = pas de contrat) ;
 *       skins    : une lecture reussie des detenteurs de skins (revenu.skinsLus) chaque jour de la periode (null = pas de contrat).
 *     ⚠️ Le volume de trading est POSTE par les clients (/api/paye) : aucun curseur ne le couvre — c est DIT dans la reponse (volume),
 *     pas compte dans `complete`. */

export function cacheTemporise({ ttlMs = 60000, ttlEchecMs = 15000, max = 128, horloge = () => Date.now() } = {}) {
  const m = new Map(), gen = new Map();
  const borner = () => { while (m.size > max) m.delete(m.keys().next().value); };
  return {
    async obtenir(cle, calcul, estOk = (v) => !!(v && v.ok)) {
      const x = m.get(cle);
      if (x && x.enVol) return x.enVol;
      if (x && horloge() - x.t < (x.ok ? ttlMs : ttlEchecMs)) { if (x.erreur) throw x.erreur; return x.valeur; }
      const g = gen.get(cle) || 0;
      const p = (async () => calcul())();
      m.set(cle, { enVol: p }); borner();
      try {
        const v = await p;
        if ((gen.get(cle) || 0) === g) m.set(cle, { t: horloge(), valeur: v, ok: estOk(v) }); else if (m.get(cle) && m.get(cle).enVol === p) m.delete(cle);
        return v;
      } catch (e) {
        if ((gen.get(cle) || 0) === g) m.set(cle, { t: horloge(), erreur: e, ok: false }); else if (m.get(cle) && m.get(cle).enVol === p) m.delete(cle);
        throw e;
      }
    },
    invalider(cle) { gen.set(cle, (gen.get(cle) || 0) + 1); m.delete(cle); if (gen.size > max * 4) gen.delete(gen.keys().next().value); },
    taille() { return m.size; },
  };
}

/** { complete, registre, rolls (bool|null), skins (bool|null), volume, pourquoi: [..] } — complete seulement si chaque source connue couvre */
export function couvertureParts({ debutMs, finMs, joursIds, registreDepuis, rolls, skins } = {}) {
  const pourquoi = [];
  const bornes = Number.isFinite(debutMs) && Number.isFinite(finMs) && finMs > debutMs && Array.isArray(joursIds) && joursIds.length > 0;
  if (!bornes) pourquoi.push('the period is not known');
  const dep = Date.parse(String(registreDepuis || ''));
  const registre = bornes && Number.isFinite(dep) && dep <= debutMs;
  if (bornes && !registre) pourquoi.push('the day registry started after this period began (or its start is not known)');
  let r = null;
  if (rolls) {
    r = bornes && Number.isFinite(Number(rolls.curseurTs)) && rolls.curseurTs !== null && Number(rolls.curseurTs) * 1000 >= finMs;
    if (!r) pourquoi.push('the BlockRolls log reader has not passed the end of this period (or its block time was not read)');
  }
  let s = null;
  if (skins) {
    const lus = skins.joursLus && typeof skins.joursLus === 'object' ? skins.joursLus : {};
    const manque = bornes ? joursIds.filter((j) => !lus[j]) : [];
    s = bornes && manque.length === 0;
    if (!s) pourquoi.push('skin holders were not read on ' + (manque.length ? manque.join(', ') : 'this period'));
  }
  return { complete: bornes && registre && r !== false && s !== false, registre, rolls: r, skins: s,
    volume: 'POSTED_BY_CLIENTS (no cursor covers it)', pourquoi };
}
