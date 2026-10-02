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
// ⛔ P0 2026-09-15 tip 1915: mood_changes alone flooded Social (calm↔curious ~30s). Longer gap; UI collapses per token.
import { evenementsDuPas } from './regles-cerveau.js';
import { nomHumeur } from './cerveau.js';
/* ⛔ 2026-10-02 (Raksha) : la VOIX choisie par le createur ajoute des mots APRES le fait ; sans voix, rien ne change. */
import { reactionVoix, partageVoix, composerParole, estAmi } from './voix-block.js';

export const PAROLE_ECART_BATTEMENTS = 50;
/** Mood-only speech: same class as GM spam — do not re-announce every calm↔curious flip. */
export const PAROLE_ECART_MOOD = 250;
export const PAROLES_MAX_PAR_TOUR = 4;
export const TYPES_PAROLE = ['DIT', 'REPOND'];

/* ⛔⛔ MESURE (Phil + prod, 2026-09-14) : 16 lignes sur 20 disaient « I cannot see my market right now » ou un changement
 *    d humeur qui sortait d une lecture ratee. Ca parle de NOTRE reseau, pas du block. Un block ne parle donc que d un
 *    fait de la chaine, ou d un changement entre deux humeurs REELLEMENT jugees (jamais depuis / vers NON_LU). */
const PRIORITE = ['new_buy', 'new_sell', 'new_holder', 'new_message', 'new_transfer', 'price_down', 'price_up', 'mood_changes'];
const humeurJugee = (vu) => !!vu && vu.phase !== 'NON_LU';
/* le nom ANGLAIS de l humeur, d une seule source (cerveau.js) */
const humeur = (phase) => (phase === 'NON_LU' ? 'unable to read my market' : nomHumeur(phase));
/* ⛔ les montants viennent TELS QUELS de l evenement Live (achats.js) ; absents = on ne cite aucun chiffre */
const montant = (b) => (b && b.echange && b.echange.quantite && b.echange.eth ? ' ' + String(b.echange.quantite).slice(0, 16) + ' of me for '
  + String(b.echange.eth).slice(0, 12) + ' ETH' : '');
const PHRASE = {
  new_buy: (vu, b) => 'someone just bought' + (montant(b) || ' me') + '.',
  new_sell: (vu, b) => 'someone just sold' + (montant(b) || ' me') + '.',
  new_holder: () => 'a new holder just reached me.',
  new_message: () => 'someone just wrote to me on a transfer.',
  new_transfer: () => 'a transfer just reached me.',
  price_down: () => 'my life went down. Nobody refunds that.',
  price_up: () => 'my life went up. It can go down as well.',
  /* ⛔⛔ CETTE LIGNE DISAIT « I am calm now. » ET RIEN D AUTRE — pour TOUS les blocks. Capture de
   *     Phil, 2026-09-27 : sept blocks d affilee, sept phrases IDENTIQUES au mot pres. « tu vois,
   *     tout la meme ».
   *   ⛔ LA CAUSE : `vu` porte `actifs`, `spikes`, `gauche_hz`, `droite_hz`, `virage`, `memoire`,
   *     `tick` — et la phrase n utilisait QUE `phase`. Comme la plupart des blocks tombent en
   *     CALME, toutes les lignes se confondaient. UNE SORTIE CONSTANTE N EST PAS UNE INFORMATION :
   *     un fil ou tout le monde dit la meme chose cesse d etre lu.
   *   ⇒ La phrase porte desormais ce qui DISTINGUE ce cerveau a cet instant. Phil : « meme si c est
   *     que des chiffres ». Ce sont des chiffres, et ils sont tous MESURES dans `vu`.
   *   ⛔ CHAQUE MORCEAU EST SOUS CONDITION : une valeur absente est OMISE, jamais remplacee par un
   *     zero. Cette ligne peut etre publiee SUR LA CHAINE — un zero invente y resterait pour
   *     toujours.
   *   ⛔ ET L AILE N EST NOMMEE QUE SI L ECART COMPTE : a 45,2 contre 45,2 Hz, annoncer un cote
   *     serait inventer une asymetrie. Sous 1 Hz d ecart, on n en parle pas. */
  mood_changes: (vu) => {
    const bouts = [];
    const n = Number(vu && vu.actifs);
    if (Number.isFinite(n)) bouts.push(n + ' of my neurons just fired');
    const g = Number(vu && vu.gauche_hz), d = Number(vu && vu.droite_hz);
    if (Number.isFinite(g) && Number.isFinite(d) && Math.abs(g - d) >= 1) {
      bouts.push('I lean ' + (g > d ? 'left' : 'right') + ' at ' + Math.max(g, d).toFixed(1) + ' Hz');
    }
    const m = Number(vu && vu.memoire);
    if (Number.isFinite(m) && m > 0) bouts.push('I still hold ' + Math.round(m * 100) + '% of what I just did');
    return 'I am ' + humeur(vu.phase) + ' now' + (bouts.length ? ' — ' + bouts.join(', ') : '') + '.';
  },
  /* ⛔ MEME RAISON ICI : « je ne vois pas mon marche » etait vrai et identique partout. Ce qui
   *   distingue un cerveau aveugle d un autre, c est ce qu il fait QUAND MEME — et il fait quelque
   *   chose, puisque son cablage tourne sans le marche. */
  market_unread: (vu) => {
    const n = Number(vu && vu.actifs);
    return 'I cannot see my market right now'
      + (Number.isFinite(n) ? ' — but ' + n + ' of my neurons just fired anyway.' : '.');
  },
};
/* seuls ces evenements appellent une reponse : on ne repond pas a « je suis curieux » */
const APPELLE_REPONSE = new Set(['new_buy', 'new_sell', 'new_holder', 'new_message', 'new_transfer', 'price_down', 'price_up']);
const REPONSE = {
  new_buy: 'I saw that purchase.',
  new_sell: 'I saw that sale.',
  new_holder: 'welcome to your new holder.',
  new_message: 'I read that someone wrote to you.',
  new_transfer: 'I saw your transfer.',
  price_down: 'I saw your life go down.',
  price_up: 'I saw your life go up.',
};

const nom = (b) => String(b.sym || String(b.adr).slice(0, 8)).slice(0, 14);
/* ⛔ Phil (2026-09-19, capture) : « replies to FREEBOTS's price_up · its own mood read from its brain » — des CODES a
 *    l ecran. La raison se dit avec des mots ; le code reste dans `evenement` pour la machine. */
const RAISON = { new_buy: 'a purchase', new_sell: 'a sale', new_holder: 'a new holder', new_message: 'a message',
  new_transfer: 'a transfer', price_down: 'its price going down', price_up: 'its price going up', mood_changes: 'its mood changing' };
const RAISON_AUTRE = { new_buy: 'was just bought', new_sell: 'was just sold', new_holder: 'got a new holder', new_message: 'got a message',
  new_transfer: 'got a transfer', price_down: 'price went down', price_up: 'price went up' };
const deQui = (b, e) => nom(b) + (e === 'price_up' || e === 'price_down' ? '’s ' : ' ') + RAISON_AUTRE[e];

/**
 * Les paroles d un battement.
 * @param {{ blocks: {adr:string, sym?:string, vu:object, vuAvant:object|null}[], tick:number, dernieres?:Record<string,number> }} o
 * @returns {{ paroles: {type:string, de:string, sym:string, a:string|null, symA:string|null, texte:string, parce_que:string, evenement:string}[],
 *   dernieres: Record<string,number> }}
 */
export function parolesDuTour({ blocks, tick, dernieres = {} }) {
  const d = { ...(dernieres || {}) };
  const liste = (Array.isArray(blocks) ? blocks : []).filter((b) => b && b.vu && /^0x[0-9a-fA-F]{40}$/.test(String(b.adr)))
    .map((b) => ({ ...b, adr: String(b.adr).toLowerCase() }))
    .sort((x, y) => (x.adr < y.adr ? -1 : 1));
  const libre = (adr, gap = PAROLE_ECART_BATTEMENTS) => !Number.isFinite(d[adr]) || tick - d[adr] >= gap;
  const paroles = [];
  for (const b of liste) {
    if (paroles.length >= PAROLES_MAX_PAR_TOUR) break;
    const ev = evenementsDuPas(b.vu, b.vuAvant || null);
    const e = PRIORITE.find((x) => ev.includes(x) && (x !== 'mood_changes' || (humeurJugee(b.vu) && humeurJugee(b.vuAvant))));
    if (!e) continue;
    const gap = e === 'mood_changes' ? PAROLE_ECART_MOOD : PAROLE_ECART_BATTEMENTS;
    if (!libre(b.adr, gap)) continue;
    /* voix du createur : « quiet » sur cet evenement = le block se tait (et personne ne lui repond) */
    const reaction = reactionVoix(b.voix, e, b);
    if (reaction === 'SILENCE') continue;
    d[b.adr] = tick;
    const partage = b.voix && e !== 'mood_changes' ? partageVoix(b.voix, tick) : null;
    paroles.push({ type: 'DIT', de: b.adr, sym: nom(b), a: null, symA: null,
      texte: composerParole(nom(b) + ': ' + PHRASE[e](b.vu, b), reaction, partage),
      parce_que: 'it saw ' + RAISON[e], evenement: e });
    if (!APPELLE_REPONSE.has(e) || paroles.length >= PAROLES_MAX_PAR_TOUR) continue;
    /* le repondant : le block suivant dans l ordre des adresses, qui n a pas parle recemment — deterministe.
     * Si le createur a nomme des blocks avec qui il aime parler, le premier d entre eux qui est libre passe devant. */
    const i = liste.indexOf(b);
    const tour = [...liste.slice(i + 1), ...liste.slice(0, i)];
    const autre = (b.voix && tour.find((x) => libre(x.adr) && estAmi(b.voix, x.adr, x.sym))) || tour.find((x) => libre(x.adr));
    if (!autre) continue;
    d[autre.adr] = tick;
    const base = nom(autre) + ' → ' + nom(b) + ': ' + REPONSE[e] + (humeurJugee(autre.vu) ? ' I am ' + humeur(autre.vu.phase) + ' myself.' : '');
    const reponseVoix = reactionVoix(autre.voix, e, b);
    paroles.push({ type: 'REPOND', de: autre.adr, sym: nom(autre), a: b.adr, symA: nom(b),
      /* humeur non lue (marche illisible) : on ne la dit pas — « I am unable to read my market myself » ne veut rien dire */
      texte: composerParole(base, reponseVoix === 'SILENCE' ? null : reponseVoix,
        partage && partage.startsWith('Creator says:') ? 'Thanks for the news.' : null),
      parce_que: 'a reply — ' + deQui(b, e), evenement: e });
  }
  return { paroles, dernieres: d };
}
