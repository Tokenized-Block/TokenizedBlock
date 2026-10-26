/* cerveaux-page.js — UN cerveau par adresse sur la page (game57 #5/#6, Grok Super QA game56 : UNIT « no beat yet » dans Live alors que
 *   la Map le montrait a beat 92 ; des compteurs de battement a des echelles differentes d une vue a l autre).
 * ⛔⛔ AVANT : la map (h.cerveau), le profil (profilCerveau.etat) et Brain / le Control panel (brainEtat) recreaient CHACUN leur copie
 *     du meme block depuis la memoire de ce navigateur, a des moments differents, et chacune comptait ses battements : trois numeros
 *     pour un block, et Live ne voyait que la copie de la map. MAINTENANT : une seule instance par adresse, creee une fois, et UN pas
 *     par battement de page (`cycle`) quel que soit le nombre de vues qui la regardent. Son `vu.tick` est LE numero de battement.
 * ⛔ PUR : aucun reseau, aucune horloge, aucun DOM. `creer(adr)` (la memoire du navigateur) est fourni par l appelant. */
const ADR = /^0x[0-9a-f]{40}$/;
export const HISTO_PARTAGE = 64;
export function creerCerveauxPage({ creer }) {
  const m = new Map();
  const cle = (a) => String(a || '').toLowerCase();
  const entree = (adr) => {
    const a = cle(adr);
    if (!ADR.test(a)) return null;
    let e = m.get(a);
    if (!e) {
      let etat = null;
      try { etat = creer(a); } catch (_) { etat = null; }
      if (!etat) return null;
      e = { adr: a, etat, vu: null, faits: null, nourritureLue: null, source: null, cycle: null, r: null, histo: [], origine: null };
      m.set(a, e);
    }
    return e;
  };
  return {
    /** L instance de cette adresse (creee au premier appel, jamais une seconde fois). */
    etat(adr) { const e = entree(adr); return e ? e.etat : null; },
    /** Un pas de CETTE instance ; deja fait dans ce cycle = le meme resultat, sans second pas. */
    battre(adr, faits, pasFn, cycle, { source = null, nourritureLue = null } = {}) {
      const e = entree(adr);
      if (!e) return null;
      if (cycle !== null && cycle !== undefined && e.cycle === cycle && e.r) return { etat: e.r.etat, vu: e.r.vu, deja: true };
      const r = pasFn(e.etat, faits);
      e.etat = r.etat; e.vu = r.vu; e.faits = faits; e.nourritureLue = nourritureLue; e.source = source; e.cycle = cycle;
      e.r = { etat: r.etat, vu: r.vu };
      e.histo.push(r.vu);
      if (e.histo.length > HISTO_PARTAGE) e.histo.splice(0, e.histo.length - HISTO_PARTAGE);
      return { etat: r.etat, vu: r.vu, deja: false };
    },
    /** Une memoire relue (chaine, fragments) REMPLACE l instance : toutes les vues sautent ensemble, et l origine est dite. */
    remplacer(adr, etat, origine = null) {
      const e = entree(adr);
      if (!e || !etat) return false;
      e.etat = etat; e.vu = null; e.r = null; e.cycle = null; e.histo = []; e.origine = origine;
      return true;
    },
    /** Ce que l instance a rendu a son dernier pas, ou null. ⛔ Ne cree jamais de cerveau. */
    lire(adr) {
      const e = m.get(cle(adr));
      return e ? { adr: e.adr, etat: e.etat, vu: e.vu, faits: e.faits, nourritureLue: e.nourritureLue, source: e.source, histo: e.histo, cycle: e.cycle, origine: e.origine } : null;
    },
    /** LE numero de battement de cette adresse : le tick de son dernier pas, ou null. */
    battement(adr) { const e = m.get(cle(adr)); return e && e.vu && Number.isSafeInteger(e.vu.tick) ? e.vu.tick : null; },
    taille() { return m.size; },
  };
}

/* ⛔⛔ game57 #6 : UN numero de battement. C est le `tick` de L instance de la page pour cette adresse (vu.tick : les battements
 *     que CE cerveau a vecus, repris de la memoire du navigateur ou de la chaine) — jamais celui d une copie, ni une hauteur de
 *     bloc, ni un nombre d evenements on-chain, ni le rang d un pas de rejeu. Sans instance sur la page : le repli (instantane). */
export function battementAffiche(registre, adr, repli = null) {
  const n = registre && typeof registre.battement === 'function' ? registre.battement(adr) : null;
  if (Number.isSafeInteger(n)) return n;
  return repli && Number.isSafeInteger(repli.tick) ? repli.tick : null;
}
/** UN format pour ce numero, partout (panneau, Brain, fenetre Brain, Live). */
export const texteBattement = (n) => (Number.isSafeInteger(n) ? n.toLocaleString('en-US') : '—');
