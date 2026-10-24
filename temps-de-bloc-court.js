/* temps-de-bloc-court.js — LA MESURE COURTE DU SERVEUR (revue BlockDuelsV2 2026-10-24, n°2). LECTURE SEULE : deux en-tetes (la tete et
 *   RECUL_COURT_BLOCS plus bas), au plus une lecture a la fois, pas plus d une toutes les `ttlMs`. `rpc(method, params)` est DONNE
 *   (rpcServeur, ou une fausse chaine dans les bancs). La valeur est une borne BASSE (temps-de-bloc.js sParBlocBorneBasse) ; elle ne sert
 *   qu a DIRE une fenetre plus courte quand les blocs accelerent (sParBlocPrudent) — les reculs du serveur gardent la mesure longue.
 * Une lecture ratee garde la derniere valeur (avec son `lu`) et dit l erreur ; jamais une valeur inventee. */
import { sParBlocBorneBasse, enteteVersMesure, RECUL_COURT_BLOCS } from './temps-de-bloc.js';

export function creerMesureCourte({ rpc, horloge = () => Date.now(), ttlMs = 15000, recul = RECUL_COURT_BLOCS }) {
  const s = { sParBloc: null, de: null, a: null, lu: null, mesureLe: null, enVol: null, erreur: null };
  async function lire(force = false) {
    if (!force && s.lu !== null && horloge() - s.lu < ttlMs) return s.sParBloc;
    if (s.enVol) return s.enVol;
    s.enVol = (async () => {
      try {
        const haut = enteteVersMesure(await rpc('eth_getBlockByNumber', ['latest', false]));
        if (!haut || haut.bloc <= recul) throw new Error('head header unreadable');
        const bas = enteteVersMesure(await rpc('eth_getBlockByNumber', ['0x' + (haut.bloc - recul).toString(16), false]));
        const v = sParBlocBorneBasse({ haut, bas });
        if (v === null) throw new Error('short block time not measurable from these headers');
        Object.assign(s, { sParBloc: v, de: bas.bloc, a: haut.bloc, lu: horloge(), mesureLe: horloge(), erreur: null });
        return v;
      } catch (e) {
        /* l essai rate compte comme une lecture (pas de rafale de relectures) ; la derniere valeur reste, l erreur est dite */
        s.erreur = String((e && e.message) || e).slice(0, 120);
        s.lu = horloge();
        return s.sParBloc;
      } finally { s.enVol = null; }
    })();
    return s.enVol;
  }
  return { lire, etat: () => s };
}
