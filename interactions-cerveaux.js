// interactions-cerveaux.js — parler a un cerveau, et faire se rencontrer deux cerveaux. Deterministe, rejouable, sans modele de langage.
// ================================================================================================
// ⛔ DEMANDE DE PHIL (2026-10-09) : « des boutons d interaction en direct entre humain et Brain AI, et les Brain AI peuvent s envoyer
//    entre eux de meilleures interactions… creer une communaute avec ses blocks et tokenized blocks B20 ».
// ⛔⛔ CE QUE CE MODULE NE FAIT PAS, ET C EST LA REGLE DU DEPOT :
//    · aucun LLM : chaque phrase sort d une table fermee, indexee par la PHASE que `cerveau.js` calcule ;
//    · aucun faux stimulus : une rencontre REJOUE les deux cerveaux depuis leur adresse et leurs faits LUS (`pas` de cerveau.js,
//      `etatInitial` = cablage keccak de l adresse). Rien n entre dans `nouveau` : parler a un cerveau ne l excite pas, et l ecran ne
//      peut donc pas annoncer une agitation qui n a pas eu lieu (meme frontiere que le reveil des dormeurs) ;
//    · rien ne se signe ici : un geste reel (GM, message paye) passe par les chemins existants et le wallet de la personne.
// ⛔ LA SYNCHRONIE EST UNE MESURE, PAS UNE AFFINITE INVENTEE : les deux reseaux ont la MEME taille (128 neurones, indices 0..127). On
//    rejoue N battements et on compte, battement par battement, les neurones qui ont tire DANS LES DEUX (intersection) sur ceux qui ont
//    tire dans l un OU l autre (union). Personne ne choisit ce chiffre : il se rejoue a l identique chez tout le monde.
// ⚠️ SA BORNE : elle depend des faits fournis (vie, etatVie). Deux personnes qui lisent un marche different a deux instants obtiennent
//    deux chiffres differents — l ecran donne donc les faits a cote (« same wiring and same facts replay the same beat »).
import { etatInitial, pas, nomHumeur } from './cerveau.js';

/** Battements rejoues pour une rencontre : assez pour qu un reseau parte de zero et tire (7 a 10 battements a froid, mesure du
 *  2026-09-25), assez peu pour rester instantane dans le navigateur (24 x 2 reseaux de 128 neurones). */
export const BATTEMENTS_RENCONTRE = 24;
/** Combien de voisins le cercle d un block montre. Choix d affichage, pas une mesure. */
export const TAILLE_CERCLE = 5;

const ADR = /^0x[0-9a-fA-F]{40}$/;

/** Les faits qu un cerveau voisin recoit : SEULEMENT ce que l app a lu (vie et son etat). Rien de lu = `null`, jamais 0. */
export function faitsLus(x) {
  const vie = x && typeof x.vie === 'number' && Number.isFinite(x.vie) ? x.vie : null;
  /* ⛔ un etat absent ET une vie absente = « pas lu » (NON_LU, « market unread »), jamais « endormi » : le cerveau ne dit pas
   *   qu un marche est calme quand personne ne l a regarde. */
  const etatVie = x && typeof x.etatVie === 'string' ? x.etatVie : (vie !== null ? 'LUE' : 'NON_LUE');
  return { vie, etatVie };
}

/** Rejoue un cerveau depuis son adresse : `n` battements avec les memes faits. Pur. `null` pour une adresse illisible. */
export function rejouer(adresse, faits = {}, n = BATTEMENTS_RENCONTRE) {
  if (!ADR.test(String(adresse || ''))) return null;
  let etat = etatInitial(String(adresse).toLowerCase());
  const traces = [];
  let vu = null;
  for (let i = 0; i < n; i++) {
    const r = pas(etat, faits);
    etat = r.etat; vu = r.vu;
    traces.push(r.vu.indices.slice());
  }
  return { phase: vu ? vu.phase : 'NON_LU', traces, spikes: traces.reduce((s, t) => s + t.length, 0), cablage: vu ? vu.cablage : null };
}

/** La synchronie de deux traces : somme des intersections / somme des unions. `null` si aucun des deux n a tire (rien a comparer). */
export function synchronie(tracesA, tracesB) {
  let inter = 0, union = 0;
  const n = Math.min(tracesA.length, tracesB.length);
  for (let i = 0; i < n; i++) {
    const a = new Set(tracesA[i]);
    const b = tracesB[i];
    let commun = 0;
    for (const x of b) if (a.has(x)) commun++;
    inter += commun;
    union += a.size + new Set(b).size - commun;
  }
  return union > 0 ? inter / union : null;
}

/** Ce qu un cerveau REPOND quand on lui demande comment il va : une phrase par phase, rien d autre. */
const REPLIQUES = Object.freeze({
  DORMANT: 'Zzz… my market is quiet. A GM would wake me up.',
  EVEILLE: 'I am awake — someone fed me.',
  CALME: 'All quiet here. Nothing new since I last looked.',
  CURIEUX: 'Lots of neurons firing — I am curious about what comes next.',
  EXCITE: 'Something new just happened on my market — I am excited!',
  INQUIET: 'More selling than buying lately — I am worried.',
  MORT: '…',
  NON_LU: 'My market was not read, so I will not guess how I feel.',
});
export function repliqueDe(phase) { return REPLIQUES[phase] || REPLIQUES.NON_LU; }
/** L humeur en un mot pour une LISTE : `nomHumeur` dit « Mood not judged — our read failed » pour NON_LU, trop long pour une ligne
 *  du cercle (mesure dans le navigateur, 2026-10-09 : 4 lignes sur 5). Meme sens, le libelle court que l app emploie deja. */
export function humeurCourte(phase) { return phase === 'NON_LU' ? 'market unread' : nomHumeur(phase); }

/** Ce qu il FERAIT : le meme vocabulaire que le mode S.I (achete quand il s excite, vend un quart quand il s inquiete).
 *  `geste` est un CODE ; l app le transforme en commande PRE-REMPLIE que la personne ajuste et envoie — rien ne part seul.
 *  ⛔ Aucun montant n est invente ici : c est la personne qui l ecrit. */
export function conseilDe(phase) {
  if (phase === 'EXCITE') return { geste: 'buy', texte: 'I would buy a little — you pick the amount.' };
  if (phase === 'INQUIET') return { geste: 'sell_quarter', texte: 'I would sell a quarter of what you hold.' };
  if (phase === 'DORMANT' || phase === 'EVEILLE') return { geste: 'gm', texte: 'I would say GM to wake my market up.' };
  if (phase === 'MORT') return { geste: 'rien', texte: 'Nothing: this block is dead.' };
  if (phase === 'NON_LU') return { geste: 'rien', texte: 'Nothing until my market is read.' };
  return { geste: 'attendre', texte: 'I would wait and watch.' };
}

/** Une rencontre entre deux cerveaux : les deux rejoues, leur synchronie, et ce que chacun dit. Pur et rejouable. */
export function rencontre({ a, faitsA = {}, b, faitsB = {}, n = BATTEMENTS_RENCONTRE }) {
  if (!ADR.test(String(a || '')) || !ADR.test(String(b || ''))) return { etat: 'REFUSE', pourquoi: 'both blocks need a whole address' };
  if (String(a).toLowerCase() === String(b).toLowerCase()) return { etat: 'REFUSE', pourquoi: 'a brain meets another brain, not itself' };
  const ra = rejouer(a, faitsA, n), rb = rejouer(b, faitsB, n);
  const s = synchronie(ra.traces, rb.traces);
  return {
    etat: 'LU', battements: n,
    phaseA: ra.phase, phaseB: rb.phase, humeurA: humeurCourte(ra.phase), humeurB: humeurCourte(rb.phase),
    synchronie: s, spikesA: ra.spikes, spikesB: rb.spikes,
    repliqueA: repliqueDe(ra.phase), repliqueB: repliqueDe(rb.phase),
  };
}

/** La synchronie en mots, pour l ecran. `null` -> « nothing fired », jamais « 0 % ». */
export function pourcentSynchro(s) {
  return s === null || s === undefined || !Number.isFinite(s) ? null : Math.round(s * 100);
}

/** Le texte d un message paye qui raconte la rencontre (tbx1, 256 octets EN-TETE COMPRIS : l en-tete prend ~96 octets).
 *  Ecrit par la table, jamais par un modele ; la personne peut le modifier avant de preparer. */
export function texteRencontre({ symA, symB, r }) {
  const pc = pourcentSynchro(r && r.synchronie);
  const nomA = String(symA || 'block').slice(0, 16), nomB = String(symB || 'block').slice(0, 16);
  const synchro = pc === null ? 'no neuron fired in common' : pc + '% in sync over ' + r.battements + ' beats';
  return ('gm ' + nomB + ' — ' + nomA + ' (' + r.humeurA + ') met you (' + r.humeurB + '): ' + synchro).slice(0, 150);
}

/** Le CERCLE d un block : ses voisins les plus synchrones parmi ceux fournis (la Map). Tri par synchronie puis par adresse
 *  (deterministe), sans lui-meme, sans les voisins avec lesquels rien n a tire. */
export function cercle({ a, faitsA = {}, voisins = [], n = BATTEMENTS_RENCONTRE, max = TAILLE_CERCLE }) {
  if (!ADR.test(String(a || ''))) return [];
  const ra = rejouer(a, faitsA, n);
  const vus = new Set([String(a).toLowerCase()]);
  const out = [];
  for (const v of voisins) {
    const adr = String((v && v.adr) || '').toLowerCase();
    if (!ADR.test(adr) || vus.has(adr)) continue;
    vus.add(adr);
    const rv = rejouer(adr, faitsLus(v), n);
    const s = synchronie(ra.traces, rv.traces);
    if (s === null) continue;
    out.push({ adr, sym: v.sym || null, synchronie: s, phase: rv.phase, humeur: humeurCourte(rv.phase) });
  }
  out.sort((x, y) => (y.synchronie - x.synchronie) || (x.adr < y.adr ? -1 : x.adr > y.adr ? 1 : 0));
  return out.slice(0, Math.max(0, max));
}
