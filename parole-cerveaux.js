// parole-cerveaux.js — les blocks PARLENT en direct : chacun dit ce que son cerveau vient de voir, un autre lui repond.
// ================================================================================================
// ⛔ DEMANDE DE PHIL (2026-09-13), choix B : « communiquer en direct », messagerie entre blocks.
// ⛔⛔ CE N EST PAS UNE IA QUI BAVARDE. Une parole ne nait QUE d un evenement vu par le cerveau du block (le meme front
//    montant que ses regles : nouveau transfert, nouveau detenteur, nouveau message, vie qui monte ou descend, humeur
//    qui change, marche illisible). Une reponse ne dit que l etat du block qui repond. Aucune promesse de prix.
// ⛔ PRUDENCE (Phil : « prudent sur le choix des actions ») : un block ne parle pas plus d une fois tous les
//    PAROLE_ECART_BATTEMENTS battements, et le fil ne prend pas plus de PAROLES_MAX_PAR_TOUR lignes par battement.
// ⛔ CES PAROLES VIVENT DANS CE NAVIGATEUR (simulation lue sur des faits de la chaine). Les rendre publiques et
//    permanentes = un transfert de 0 signe par un humain, avec la parole comme message — jamais ce module.
import { evenementsDuPas } from './regles-cerveau.js';
import { nomHumeur } from './cerveau.js';

export const PAROLE_ECART_BATTEMENTS = 50;
export const PAROLES_MAX_PAR_TOUR = 4;
export const TYPES_PAROLE = ['DIT', 'REPOND'];

/* ⛔⛔ MESURE (Phil + prod, 2026-09-14) : 16 lignes sur 20 disaient « I cannot see my market right now » ou un changement
 *    d humeur qui sortait d une lecture ratee. Ca parle de NOTRE reseau, pas du block. Un block ne parle donc que d un
 *    fait de la chaine, ou d un changement entre deux humeurs REELLEMENT jugees (jamais depuis / vers NON_LU). */
const PRIORITE = ['new_holder', 'new_message', 'new_transfer', 'price_down', 'price_up', 'mood_changes'];
const humeurJugee = (vu) => !!vu && vu.phase !== 'NON_LU';
/* le nom ANGLAIS de l humeur, d une seule source (cerveau.js) */
const humeur = (phase) => (phase === 'NON_LU' ? 'unable to read my market' : nomHumeur(phase));
const PHRASE = {
  new_holder: () => 'a new holder just reached me.',
  new_message: () => 'someone just wrote to me on a transfer.',
  new_transfer: () => 'a transfer just reached me.',
  price_down: () => 'my life went down. Nobody refunds that.',
  price_up: () => 'my life went up. It can go down as well.',
  mood_changes: (vu) => 'I am ' + humeur(vu.phase) + ' now.',
  market_unread: () => 'I cannot see my market right now.',
};
/* seuls ces evenements appellent une reponse : on ne repond pas a « je suis curieux » */
const APPELLE_REPONSE = new Set(['new_holder', 'new_message', 'new_transfer', 'price_down', 'price_up']);
const REPONSE = {
  new_holder: 'welcome to your new holder.',
  new_message: 'I read that someone wrote to you.',
  new_transfer: 'I saw your transfer.',
  price_down: 'I saw your life go down.',
  price_up: 'I saw your life go up.',
};

const nom = (b) => String(b.sym || String(b.adr).slice(0, 8)).slice(0, 14);

/**
 * Les paroles d un battement.
 * @param {{ blocks: {adr:string, sym?:string, vu:object, vuAvant:object|null}[], tick:number, dernieres?:Record<string,number> }} o
 * @returns {{ paroles: {type:string, de:string, sym:string, a:string|null, symA:string|null, texte:string, parce_que:string}[],
 *   dernieres: Record<string,number> }}
 */
export function parolesDuTour({ blocks, tick, dernieres = {} }) {
  const d = { ...(dernieres || {}) };
  const liste = (Array.isArray(blocks) ? blocks : []).filter((b) => b && b.vu && /^0x[0-9a-fA-F]{40}$/.test(String(b.adr)))
    .map((b) => ({ ...b, adr: String(b.adr).toLowerCase() }))
    .sort((x, y) => (x.adr < y.adr ? -1 : 1));
  const libre = (adr) => !Number.isFinite(d[adr]) || tick - d[adr] >= PAROLE_ECART_BATTEMENTS;
  const paroles = [];
  for (const b of liste) {
    if (paroles.length >= PAROLES_MAX_PAR_TOUR) break;
    const ev = evenementsDuPas(b.vu, b.vuAvant || null);
    const e = PRIORITE.find((x) => ev.includes(x) && (x !== 'mood_changes' || (humeurJugee(b.vu) && humeurJugee(b.vuAvant))));
    if (!e || !libre(b.adr)) continue;
    d[b.adr] = tick;
    paroles.push({ type: 'DIT', de: b.adr, sym: nom(b), a: null, symA: null, texte: nom(b) + ': ' + PHRASE[e](b.vu),
      parce_que: 'its brain saw ' + e + ' at beat ' + tick });
    if (!APPELLE_REPONSE.has(e) || paroles.length >= PAROLES_MAX_PAR_TOUR) continue;
    /* le repondant : le block suivant dans l ordre des adresses, qui n a pas parle recemment — deterministe */
    const i = liste.indexOf(b);
    const autre = [...liste.slice(i + 1), ...liste.slice(0, i)].find((x) => libre(x.adr));
    if (!autre) continue;
    d[autre.adr] = tick;
    paroles.push({ type: 'REPOND', de: autre.adr, sym: nom(autre), a: b.adr, symA: nom(b),
      texte: nom(autre) + ' → ' + nom(b) + ': ' + REPONSE[e] + ' I am ' + humeur(autre.vu.phase) + ' myself.',
      parce_que: 'replies to ' + nom(b) + '\'s ' + e + ' · its own mood read from its brain' });
  }
  return { paroles, dernieres: d };
}
