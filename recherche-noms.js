// recherche-noms.js - TROUVER UN BLOCK PAR SON NOM OU SON SYMBOLE, COTE SERVEUR, EN LECTURE SEULE.
// 2026-10-10 re-QA (Grok Super, prod 20261010-p1-panneau-live) : 'No block named "IB022" among the 241 read here' - le navigateur ne
//   cherche que ce qu IL a lu. Le serveur connait toutes les creations (index `blocksConnus`) : il lit name()/symbol() une fois par
//   block (eth_call 'latest', jamais l archive), les garde, et repond. Egalite exacte sans casse ; plusieurs blocks = AMBIGU (refus,
//   on ne choisit pas a la place) ; rien = ABSENT avec la couverture DITE (combien de noms lus sur combien connus).
// ? Un nom lu sur la chaine est celui que le createur a ecrit : il ne prouve rien. L adresse entiere est toujours rendue.
import { symboleDepuisReponse } from './texte-onchain.js';

export const SEL_NOM = '0x06fdde03', SEL_SYM = '0x95d89b41';
const ADR = /^0x[0-9a-f]{40}$/;
const norm = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toUpperCase();

/** entrees : [{ adr, sym, nom }]. Rend { etat: 'TROUVE', adr, sym, nom } | { etat: 'AMBIGU', n, adresses } | { etat: 'ABSENT' } | { etat: 'REFUSE', pourquoi }. */
export function chercherNom(q, entrees) {
  const cle = norm(q);
  if (!cle || cle.length > 48) return { etat: 'REFUSE', pourquoi: 'a name or symbol of 1 to 48 characters' };
  const par = new Map();
  for (const e of entrees || []) {
    const a = String((e && e.adr) || '').toLowerCase();
    if (!ADR.test(a)) continue;
    if (norm(e.sym) === cle || norm(e.nom) === cle) par.set(a, { adr: a, sym: e.sym || null, nom: e.nom || null });
  }
  if (par.size === 1) return { etat: 'TROUVE', ...[...par.values()][0] };
  if (par.size > 1) return { etat: 'AMBIGU', n: par.size, adresses: [...par.keys()].slice(0, 20) };
  return { etat: 'ABSENT' };
}

/** Index des noms LUS. `lire(adr, selecteur)` -> hex. Un echec n est pas retenu (relu plus tard) ; un nom lu l est pour toujours. */
export function creerIndexNoms({ lire }) {
  const noms = new Map();
  const echecs = new Map();
  return {
    async remplir(adresses, max = 40, maintenant = Date.now()) {
      let n = 0;
      for (const brut of adresses || []) {
        const a = String(brut || '').toLowerCase();
        if (!ADR.test(a) || noms.has(a) || (echecs.has(a) && echecs.get(a) > maintenant - 10 * 60 * 1000)) continue;
        if (n++ >= max) break;
        let nom = null, sym = null;
        try { nom = symboleDepuisReponse(await lire(a, SEL_NOM), 48); } catch (_) { nom = null; }
        try { sym = symboleDepuisReponse(await lire(a, SEL_SYM)); } catch (_) { sym = null; }
        if (nom || sym) noms.set(a, { adr: a, nom, sym }); else echecs.set(a, maintenant);
      }
      return n;
    },
    entrees() { return [...noms.values()]; },
    taille() { return noms.size; },
  };
}