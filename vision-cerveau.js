/* vision-cerveau.js — « CE QUE LE CERVEAU VOIT » (Phil, 2026-10-26 : « un bouton, un pop-up qui retranscrit visuellement ce que le
 *   brain voit sur la map ; une simulation pour etre dans le brain, interagir, et apprendre a mieux communiquer avec lui »).
 *
 * ⛔⛔ RIEN N EST INVENTE ICI. Chaque element rendu vient d un argument que l appelant a REELLEMENT tenu :
 *     · `faits`  = l objet EXACT passe a `pas()` au dernier battement (l app le garde a cote de l etat) ;
 *     · `vu`     = la sortie EXACTE de ce battement ;
 *     · `voisins`, `marche`, `echange` = ce que la page a deja en memoire (la map, /api/trending, le fil Live).
 *     Un argument absent rend `null` et le texte « not read » — jamais un zero, jamais une valeur par defaut.
 * ⛔⛔ CE QUE LES NEURONES LISENT ET CE QU ILS NE LISENT PAS SONT SEPARES. `cerveau.js#courant` ne lit ni ses voisins, ni les
 *     rolls, ni les duels, ni la profondeur d une pool. Les voisins et la pool sont montres comme CONTEXTE (« not read by its
 *     neurons ») ; les faire passer pour des entrees serait la pensee inventee que cet ecran existe pour ne pas montrer.
 * ⛔ LE « WHAT IF » EST LE MEME CERVEAU, PAS UN MODELE DU CERVEAU : `simuler()` appelle `pas()` de cerveau.js, depuis la graine
 *     (keccak256 de l adresse), tick 0. Rien n est envoye, rien n est signe, aucun reseau : meme graine + memes faits = meme
 *     sortie, et l empreinte du rejeu le prouve a quiconque relance.
 * ⛔ PUR : aucun reseau, aucune horloge, aucun `Math.random`, aucun stockage, aucun DOM. */
import { etatInitial, pas, forces, nomHumeur, empreinte, VERSION_CERVEAU, NEURONES, CAPTEURS } from './cerveau.js';
import { METIERS } from './metiers.js';

export const VERSION_VISION = 'tblock-brain-vision/1';
/* 24 battements = 14,4 s a 600 ms : la fenetre d une « rencontre » (interactions-cerveaux.js), plus courte que la relecture de
 * la nourriture (90 s) — un fait nourricier edite TIENT donc toute la fenetre, comme dans l app. */
export const BATTEMENTS_SIM = 24;
const ADR = /^0x[0-9a-fA-F]{40}$/;
/* ⛔ l humeur en quelques mots pour un dessin : NON_LU s ecrit « mood not judged » (nomHumeur le dit en une phrase entiere) */
export const humeurCourte = (phase) => (phase === 'NON_LU' ? 'mood not judged' : nomHumeur(phase));
const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** Chaque cle que `courant()` lit, avec D OU l app la tire. `source: null` = l app ne la fournit pas (toujours absente). */
export const ENTREES = Object.freeze([
  { cle: 'vie', libelle: 'Life (price × supply)', source: 'its market, read on chain by this page in its pair currency — or the server market index, in dollars, when that read fails' },
  { cle: 'vieAvant', libelle: 'Previous life', source: 'the previous successful market read of this page' },
  { cle: 'gm', libelle: 'Transfers', source: 'chain: transfers of this block between two non-zero addresses, recent window' },
  { cle: 'messages', libelle: 'Messages', source: 'chain: those transfers that carry a readable message' },
  { cle: 'detenteurs', libelle: 'Holders reached', source: 'chain: addresses receiving this block for the first time in the window' },
  { cle: 'achats', libelle: 'Buys seen', source: 'the Live feed: verified swaps on its pool since this page opened' },
  { cle: 'ventes', libelle: 'Sells seen', source: 'the Live feed: verified swaps on its pool since this page opened' },
  { cle: 'mort', libelle: 'Creator holds none', source: 'chain: the creator balance, read' },
  { cle: 'role', libelle: 'Role', source: 'derived from its address' },
  { cle: 'reveil', libelle: 'Daily wake-up', source: 'this browser: once per local day, sleepers only' },
  { cle: 'bloc', libelle: 'Read at block', source: 'the chain head this page knew when the facts were put together' },
  { cle: 'part', libelle: 'Share', source: null },
  { cle: 'scelle', libelle: 'Sealed', source: null },
]);

/** Les termes que `pas()` ajoute aux capteurs, nommes pour l ecran. L ordre est celui de l addition dans `pas()`. */
export const TERMES = Object.freeze([
  { cle: 'reveil', libelle: 'daily wake-up' },
  { cle: 'base', libelle: 'resting current (market size, or rest without a market)' },
  { cle: 'delta', libelle: 'life change since the previous read' },
  { cle: 'nourriture', libelle: 'food: transfers, messages, holders' },
  { cle: 'nouveau', libelle: 'something new: buys, sells, holders, transfers, messages since the last read' },
]);

/** Une valeur lisible, ou `null`. ⛔ Un booleen faux et un zero LU s affichent ; un absent ne s affiche jamais comme zero. */
function lisible(cle, v) {
  if (v === null || v === undefined) return null;
  if (cle === 'mort') return v === true ? 'yes' : v === false ? 'no' : null;
  if (cle === 'reveil') return v === true ? 'this beat' : 'no';
  /* ⛔ le role s affiche par son titre anglais (METIERS), jamais par sa cle interne */
  if (cle === 'role') { const m = METIERS.find((x) => x.cle === v); return m ? m.titre : null; }
  if (cle === 'vie' || cle === 'vieAvant') return fini(v) ? (v >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 1e4) / 1e4)) : null;
  if (cle === 'bloc') return Number.isInteger(v) && v > 0 ? '#' + v : null;
  if (typeof v === 'number') return fini(v) ? String(v) : null;
  if (typeof v === 'string') return v || null;
  return null;
}

/**
 * Le champ de vision d un block : ce qu il a lu (entrees), ce que ca a fait a ses capteurs (forces), ce qu il a rendu (sortie),
 * et autour, ce que la page sait sans que ses neurones le lisent (contexte).
 * @param {object} a
 * @param {string} a.adr        l adresse du block
 * @param {object|null} a.faits l objet EXACT passe a `pas()` au dernier battement, ou null s il n a pas encore battu
 * @param {object|null} a.vu    la sortie EXACTE de ce battement
 * @param {Array} [a.voisins]   [{ adr, sym, phase, distance }] — les plus proches sur la map, par position monde
 * @param {object|null} [a.marche]  la ligne de l index serveur (/api/trending) pour ce block
 * @param {object|null} [a.echange] le dernier echange VERIFIE vu par le fil Live pour ce block
 */
/* ⛔⛔ `entreesCerveau` (app.html) PASSE 0 POUR LA NOURRITURE QUAND ELLE N A PAS ETE LUE, et `false` pour la mort. Le cerveau
 *     recoit bien ce 0 — mais l afficher « 0, lu sur la chaine » serait faux. Ces cles disent donc « default, not read »
 *     tant que l appelant ne prouve pas la lecture (`nourritureLue === true`). */
const CLES_NOURRITURE = new Set(['gm', 'messages', 'detenteurs', 'mort']);
export function champ({ adr, faits = null, vu = null, voisins = [], marche = null, echange = null, nourritureLue = null } = {}) {
  if (!ADR.test(String(adr || ''))) return null;
  const aFaits = !!faits && typeof faits === 'object';
  const entrees = ENTREES.map((d) => {
    if (d.source === null) return { cle: d.cle, libelle: d.libelle, valeur: null, brut: null, source: null, lu: false, texte: 'not fed by this app' };
    /* ⛔ un reveil non passe EST un reveil faux pour `courant()` (defaut) : c est ce que le cerveau a recu, on le dit */
    const brut = aFaits && Object.prototype.hasOwnProperty.call(faits, d.cle) ? faits[d.cle]
      : aFaits && d.cle === 'reveil' ? false : undefined;
    const valeur = lisible(d.cle, brut);
    const parDefaut = CLES_NOURRITURE.has(d.cle) && nourritureLue !== true && valeur !== null;
    return { cle: d.cle, libelle: d.libelle, valeur, brut: brut === undefined ? null : brut, source: d.source,
      lu: valeur !== null && !parDefaut, parDefaut,
      texte: valeur === null ? 'not read' : parDefaut ? valeur + ' (default: food not read yet)' : valeur };
  });
  let sensations = null;
  if (aFaits) {
    const { f, miam, termes } = forces(faits);
    sensations = {
      morte: termes === null,
      termes: termes === null ? [] : TERMES.map((t) => ({ cle: t.cle, libelle: t.libelle, valeur: Math.round(termes[t.cle] * 1e4) / 1e4 })),
      total: termes === null ? 0 : Math.round(TERMES.reduce((s, t) => s + termes[t.cle], 0) * 1e4) / 1e4,
      nourriture: Math.round(miam * 1000) / 1000,
      nouveaux: { ...f.nouveaux },
      aMarche: f.aMarche,
      nonLu: f.nonLu,
    };
  }
  const sortie = vu && typeof vu === 'object' ? {
    tick: vu.tick, phase: vu.phase, humeur: humeurCourte(vu.phase), spikes: vu.spikes, actifs: vu.actifs,
    indices: Array.isArray(vu.indices) ? vu.indices.slice() : [], virage: vu.virage, vitesse: vu.vitesse,
    gauche_hz: vu.gauche_hz, droite_hz: vu.droite_hz, memoire: vu.memoire, entree: vu.entree || null, cablage: vu.cablage || null,
    bloc: vu.bloc ?? null,
  } : null;
  /* ⛔ LE CONTEXTE NE GARDE QUE CE QUI A ETE TENU : un voisin sans phase est « not judged yet », jamais « calm ». */
  const ctxVoisins = (Array.isArray(voisins) ? voisins : []).filter((v) => v && ADR.test(String(v.adr || '')))
    .map((v) => ({ adr: String(v.adr).toLowerCase(), sym: v.sym ? String(v.sym) : null,
      phase: typeof v.phase === 'string' && v.phase ? v.phase : null,
      humeur: typeof v.phase === 'string' && v.phase ? humeurCourte(v.phase) : 'not judged yet',
      distance: fini(v.distance) ? Math.round(v.distance) : null, angle: fini(v.angle) ? v.angle : null }));
  const m = marche && typeof marche === 'object' ? marche : null;
  const champM = (k) => (m && fini(Number(m[k])) && m[k] !== null && m[k] !== '' ? Number(m[k]) : null);
  const ctxMarche = m ? {
    dex: m.dex ? String(m.dex) : null, quote: m.quoteSym ? String(m.quoteSym) : null,
    prixUsd: champM('prixUsd'), liquiditeUsd: champM('liquiditeUsd'), fdvUsd: champM('fdvUsd'),
    volume24hUsd: champM('volume24hUsd'), trades24h: champM('trades24h'), change24h: champM('change24h'),
    /* ⛔ la seule part de cette ligne que le cerveau peut lire : sa taille quand NOTRE lecture de chaine a echoue */
    luParLeCerveau: aFaits && fini(faits.vie) && (faits.vie === champM('fdvUsd') || faits.vie === champM('liquiditeUsd')),
  } : null;
  const ctxEchange = echange && (echange.type === 'ACHAT' || echange.type === 'VENTE') ? {
    type: echange.type === 'ACHAT' ? 'buy' : 'sell', quantite: echange.quantite ?? null, devise: echange.devise || null,
    tx: typeof echange.tx === 'string' && /^0x[0-9a-fA-F]{64}$/.test(echange.tx) ? echange.tx : null,
  } : null;
  return {
    version: VERSION_VISION, cerveau: VERSION_CERVEAU, adr: String(adr).toLowerCase(), neurones: NEURONES, capteurs: CAPTEURS,
    aBattu: aFaits && !!sortie, entrees, sensations, sortie,
    contexte: { voisins: ctxVoisins, marche: ctxMarche, echange: ctxEchange,
      nonLus: ['its neighbours on the map', 'rolls and duels', 'pool depth and price'] },
  };
}

/* ══ LE « WHAT IF » ══════════════════════════════════════════════════════════════════════════════════════════════════ */
export const EDITS = Object.freeze({
  vieDeltaPct: { min: -90, max: 200, pas: 5, libelle: 'Life change' },
  achats: { min: 0, max: 10, pas: 1, libelle: 'New buys' },
  ventes: { min: 0, max: 10, pas: 1, libelle: 'New sells' },
  detenteurs: { min: 0, max: 10, pas: 1, libelle: 'New holders' },
  gm: { min: 0, max: 20, pas: 1, libelle: 'New transfers' },
  messages: { min: 0, max: 10, pas: 1, libelle: 'New messages' },
});
const borne = (k, v) => { const d = EDITS[k]; const n = Number(v); if (!d || !fini(n)) return 0; return Math.max(d.min, Math.min(d.max, Math.round(n))); };

/**
 * Les faits edites, et ce qui a ete refuse. ⛔ On n invente pas de marche : sans vie lue, un changement de vie est refuse.
 * Un echange (achat / vente) dure UN battement dans l app (front montant, `echAvant`) : il n est applique qu au battement `a`.
 * Un fait nourricier (transferts, messages, detenteurs) et la vie tiennent jusqu a la relecture suivante (90 s) : toute la fenetre.
 */
export function faitsEdites(faits, edits = {}, { echangeAuBattement = false } = {}) {
  const base = { ...(faits || {}) };
  const refus = [];
  const e = {};
  for (const k of Object.keys(EDITS)) e[k] = borne(k, edits[k]);
  if (e.vieDeltaPct !== 0) {
    if (fini(base.vie) && base.vie > 0) { base.vieAvant = base.vie; base.vie = base.vie * (1 + e.vieDeltaPct / 100); }
    else refus.push('Life change needs a market that was read — this block has none, so it was not applied.');
  }
  for (const k of ['gm', 'messages', 'detenteurs']) {
    if (!e[k]) continue;
    const x = fini(base[k]) ? base[k] : 0;
    const av = fini(base[k + 'Avant']) ? base[k + 'Avant'] : x;
    base[k + 'Avant'] = av; base[k] = x + e[k];
  }
  if (echangeAuBattement) {
    for (const k of ['achats', 'ventes']) {
      if (!e[k]) continue;
      const x = fini(base[k]) ? base[k] : 0;
      const av = fini(base[k + 'Avant']) ? base[k + 'Avant'] : x;
      base[k + 'Avant'] = av; base[k] = x + e[k];
    }
  }
  return { faits: base, refus, edits: e };
}

function derouler(adr, faitsDuPas, n) {
  let etat = etatInitial(String(adr).toLowerCase());
  const pasVus = [];
  for (let i = 0; i < n; i++) {
    const r = pas(etat, faitsDuPas(i));
    etat = r.etat;
    pasVus.push({ tick: r.vu.tick, phase: r.vu.phase, spikes: r.vu.spikes, indices: r.vu.indices.slice(), virage: r.vu.virage,
      vitesse: r.vu.vitesse, entree: r.vu.entree });
  }
  return pasVus;
}
function resume(pasVus) {
  const phases = {};
  for (const p of pasVus) phases[p.phase] = (phases[p.phase] || 0) + 1;
  const dernier = pasVus[pasVus.length - 1] || null;
  return { phases, finale: dernier ? dernier.phase : null, humeurFinale: dernier ? humeurCourte(dernier.phase) : null,
    spikes: pasVus.reduce((s, p) => s + p.spikes, 0), virageFinal: dernier ? dernier.virage : null,
    empreinte: empreinte(JSON.stringify([VERSION_VISION, VERSION_CERVEAU, pasVus])) };
}

/**
 * Rejoue le MEME cerveau deux fois depuis sa graine (tick 0) : avec les faits tels que lus, puis avec les faits edites.
 * ⛔ Aucun reseau, aucune signature : `pas()` et rien d autre. Meme adresse + memes faits + memes edits = meme empreinte.
 * @returns {{ lu: object, siEtAlors: object, refus: string[], premierEcart: number|null, edits: object } | null}
 */
export function simuler(adr, faits, edits = {}, n = BATTEMENTS_SIM, a = 1) {
  if (!ADR.test(String(adr || '')) || !faits || typeof faits !== 'object') return null;
  const N = Math.max(1, Math.min(120, Math.round(Number(n)) || BATTEMENTS_SIM));
  const A = Math.max(0, Math.min(N - 1, Math.round(Number(a)) || 0));
  const lu = derouler(adr, () => faits, N);
  const sans = faitsEdites(faits, edits, { echangeAuBattement: false });
  const avec = faitsEdites(faits, edits, { echangeAuBattement: true });
  const si = derouler(adr, (i) => (i === A ? avec.faits : sans.faits), N);
  let premierEcart = null;
  for (let i = 0; i < N; i++) {
    if (lu[i].phase !== si[i].phase || lu[i].indices.join(',') !== si[i].indices.join(',')) { premierEcart = i; break; }
  }
  return { n: N, a: A, lu: { pas: lu, ...resume(lu) }, siEtAlors: { pas: si, ...resume(si) }, refus: sans.refus, premierEcart, edits: sans.edits };
}
