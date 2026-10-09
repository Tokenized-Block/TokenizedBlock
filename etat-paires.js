/* etat-paires.js — L ETAT DES DEVISES DE PAIRE DE L ECRAN CREATE, LU UNE FOIS PAR LE SERVEUR, A TROIS ETATS (2026-10-04).
 *
 * ⛔⛔ D OU IL VIENT. La sim fork des 62 devises du hook 7030 (Phil, 2026-10-04) : des devises SANS UNE SEULE UNITE EN CIRCULATION
 *   restaient choisissables a Create ; le refus n arrivait qu apres le choix (majPaire relit la supply). Le patch de Grok Bot
 *   (0001-paires-mortes-prix-cbbtc-b274c78.patch) les grisait DANS LE NAVIGATEUR, et il n a PAS ete repris, pour deux raisons
 *   mesurees (en-tete de test-prix-depuis-sqrt-exact-20261004.mjs) :
 *     1. FAIL-CLOSED SUR UNE AFFORDANCE : une lecture ratee = « pas nee ». Un noeud en 429 grisait TOUTES les devises sauf ETH,
 *        en disant « market not born yet » alors que c etait NOTRE lecture qui avait echoue. Ce depot a deja paye ce motif :
 *        les puces de paire sont passees de 13 a 2 en production le 2026-09-29.
 *     2. 62 lectures de prix + 62 `totalSupply` A CHAQUE CHARGEMENT de page, sur des noeuds publics deja en 429.
 *   ⇒ ICI : le verdict est calcule UNE fois par le serveur (une passe au plus par 5 minutes, quel que soit le trafic), et il
 *     a TROIS etats. L ecran ne grise QUE sur le deuxieme.
 *
 * ⛔⛔ LES TROIS ETATS, ET CE QUE CHACUN A MESURE :
 *     born     `totalSupply()` LU sur la chaine, > 0 : des unites circulent.
 *     not_born `totalSupply()` LU a ZERO, DEUX FOIS dans la meme passe, et cette passe a aussi lu une devise DU MEME GENRE
 *              (B20 natif `0xb2…`, ou contrat ordinaire) AVEC des unites — le temoin : un lecteur qui rend zero a tout le
 *              monde ne prouve rien (c est exactement ce que rend le faux noeud de test-rails-api, et ce que rendrait un
 *              relais casse), et un noeud qui lit USDC ne prouve pas qu il sait lire un B20.
 *     not_read tout le reste : noeud muet, 429, reponse qui n est pas un mot de 32 octets (`0x` compris), delai depasse,
 *              zero non confirme, zero sans temoin, deux lectures qui se contredisent, verdict trop vieux.
 *   ⛔ UN ECHEC DE LECTURE NE DEVIENT JAMAIS « not_born ». Il laisse le dernier verdict MESURE en place (avec SON heure), et
 *     ce verdict lui-meme retombe a `not_read` passe AGE_MAX_MS : une mesure a un age, au-dela elle n en est plus une.
 *
 * ⛔ CE QUE CE VERDICT NE DIT PAS (a lire avant de s en servir ailleurs) :
 *   · `born` ne dit PAS qu un marche liquide existe ni qu un prix est lisible : il dit que des unites circulent. Le patch
 *     d origine exigeait AUSSI un prix lu (/api/prix-usd). Ce n est PAS repris ici : ce prix vient d un index tiers
 *     (DexScreener), son absence y est rendue par l app comme « could not be read », et rien dans ce depot ne mesure ce que
 *     cet index repond quand il limite — en faire un « pas nee » serait decider que notre source de prix vaut la chaine.
 *     Une devise avec des unites et sans prix reste donc choisissable, et refusee AVANT paiement comme aujourd hui
 *     (« the starting price of this pair could not be read »). C est une decision produit laissee a Phil.
 *   · ETH (natif) n a pas de `totalSupply` : il n est pas dans la liste, et l ecran ne le grise jamais.
 *   · le verdict porte sur la devise, pas sur le hook qui l admet : « soon » (hookDeLancementPour) reste une autre regle.
 *
 * ⛔ BORNES DE LECTURE (comptees par test-etat-paires-20261004.mjs avec un faux noeud) : EN_VOL_MAX lectures a la fois ;
 *   une passe saine = une lecture par devise + une relecture par zero ; ECHECS_DE_SUITE_MAX echecs d affilee COUPENT la passe
 *   (le reste est `not_read`, pas d acharnement sur un noeud qui refuse) ; pas de nouvelle passe avant REPRISE_MS apres une
 *   passe incomplete, TTL_MS apres une passe complete ; une seule passe a la fois, partagee par tous les appelants.
 * ⛔ PUR : `rpc`, la liste et l horloge sont injectes — aucun reseau ici. Importe par le serveur ET par app.html (la regle de
 *   l ecran, `estPasNeeMesuree`, vit ici pour etre testee par un vrai import, pas par une copie). */
import { selecteur } from './keccak.js';

export const NEE = 'born';
export const PAS_NEE = 'not_born';
export const NON_LUE = 'not_read';
/** Une passe COMPLETE est resservie telle quelle pendant 5 minutes. */
export const TTL_MS = 5 * 60 * 1000;
/** Apres une passe INCOMPLETE (au moins une devise non lue) : pas de nouvelle passe avant 2 minutes. */
export const REPRISE_MS = 2 * 60 * 1000;
/** Un verdict mesure qui n a pas pu etre relu depuis 30 minutes redevient « non lu » (serveur ET ecran). */
export const AGE_MAX_MS = 30 * 60 * 1000;
export const EN_VOL_MAX = 4;
export const ECHECS_DE_SUITE_MAX = 3;
export const DELAI_LECTURE_MS = 10000;
/** Au tout premier appel (rien en memoire), la reponse attend la passe au plus 8 s, puis part avec ce qui est lu. */
export const ATTENTE_FROIDE_MS = 8000;
/** Ce que l option grisee dit. ⛔ LE FAIT MESURE, dans les mots que majPaire emploie deja pour ce meme etat (« no units in
 *  circulation yet »). Le patch d origine ecrivait « market not born yet in block space » : une phrase sur le MARCHE, que
 *  `totalSupply` seul ne mesure pas. Changer de libelle = cette constante, rien d autre. */
export const LIBELLE_PAS_NEE = 'no units in circulation yet';
export const BORNE_ETAT_PAIRES = 'born = totalSupply() read on chain and above zero (units circulate). '
  + 'not_born = totalSupply() read as zero twice in a pass that also read a currency of the same kind with units. '
  + 'not_read = anything else (node silent, rate limit, malformed answer, unconfirmed zero, reading too old): never a verdict. '
  + 'born does NOT say that a liquid market or a readable price exists. ETH (native) is not listed.';

/* ⛔ CALCULE, JAMAIS RECOPIE (keccak.js) : un selecteur ecrit de memoire appelle une autre fonction, et l appel rend un
 *   silence qu on lirait comme un zero — le defaut exact que ce module interdit. */
const SEL_TOTAL_SUPPLY = selecteur('totalSupply()');
const MOT_32 = /^0x[0-9a-fA-F]{64}$/;
const ADRESSE = /^0x[0-9a-f]{40}$/;
const ZERO = '0x0000000000000000000000000000000000000000';
const court = (e) => String((e && e.message) || e || 'no answer').replace(/\s+/g, ' ').slice(0, 80);
/* La famille d une devise, pour choisir son temoin : `0xb2…` = B20 natif (la convention de ce depot : paires.js ecarte TOSHI des
 *   B20 sur ce meme prefixe), le reste = contrat ordinaire. ⛔ Ce n est PAS une preuve de nature (un prefixe s imite) : cela sert
 *   seulement a exiger qu un zero soit cautionne par une lecture reussie du MEME genre. */
const famille = (adr) => (adr.startsWith('0xb2') ? 'b20' : 'autre');

/** Les devises a lire : tout ce que Create propose, sauf le natif. Adresses en minuscules, sans doublon. */
export function ciblesEtatPaires(liste) {
  const vues = new Set(), out = [];
  for (const p of Array.isArray(liste) ? liste : []) {
    const adr = String((p && p.adr) || '').toLowerCase();
    if (!ADRESSE.test(adr) || adr === ZERO || (p && p.type === 'NATIF') || vues.has(adr)) continue;
    vues.add(adr);
    out.push({ adr, symbole: p && typeof p.symbole === 'string' ? p.symbole : null });
  }
  return out;
}

/**
 * @param {{ rpc:(methode:string, params:any[])=>Promise<any>, paires:()=>Array<{adr:string,symbole?:string,type?:string}>,
 *   maintenant?:()=>number, ttlMs?:number, repriseMs?:number, ageMaxMs?:number, enVolMax?:number, echecsDeSuiteMax?:number,
 *   delaiLectureMs?:number, attenteFroideMs?:number }} deps
 * @returns {{ lire:()=>Promise<object>, instantane:()=>object, resume:()=>object }}
 *   `lire` declenche une passe si elle est due et rend l etat ; `instantane` et `resume` ne lisent JAMAIS la chaine.
 */
export function creerEtatPaires(deps) {
  const rpc = deps && deps.rpc, paires = deps && deps.paires;
  if (typeof rpc !== 'function' || typeof paires !== 'function') throw new Error('creerEtatPaires: rpc and paires are required');
  const maintenant = typeof deps.maintenant === 'function' ? deps.maintenant : () => Date.now();
  const nombre = (v, defaut) => (Number.isFinite(v) && v > 0 ? v : defaut);
  const ttlMs = nombre(deps.ttlMs, TTL_MS), repriseMs = nombre(deps.repriseMs, REPRISE_MS), ageMaxMs = nombre(deps.ageMaxMs, AGE_MAX_MS);
  const enVolMax = Math.floor(nombre(deps.enVolMax, EN_VOL_MAX)), echecsDeSuiteMax = Math.floor(nombre(deps.echecsDeSuiteMax, ECHECS_DE_SUITE_MAX));
  const delaiLectureMs = nombre(deps.delaiLectureMs, DELAI_LECTURE_MS), attenteFroideMs = nombre(deps.attenteFroideMs, ATTENTE_FROIDE_MS);

  /* adresse -> { etat: born | not_born, supply: bigint, t } : le dernier verdict MESURE. Un echec n y ecrit jamais. */
  const verdicts = new Map();
  /* adresse -> { pourquoi, t } : la derniere lecture ratee, pour DIRE pourquoi une devise est « non lue ». */
  const echecs = new Map();
  let dernierePasse = null;   /* { fin, complete } */
  let enCours = null;
  const compteurs = { passes: 0, lectures: 0, lecturesRatees: 0, passesCoupees: 0 };

  const cibles = () => { try { return ciblesEtatPaires(paires()); } catch (_) { return []; } };

  /** UNE lecture de `totalSupply()`. Rend { lu: true, supply } ou { lu: false, pourquoi } — jamais un zero par defaut. */
  async function lireSupply(adr) {
    compteurs.lectures += 1;
    let minuteur = null;
    try {
      const r = await Promise.race([
        Promise.resolve().then(() => rpc('eth_call', [{ to: adr, data: SEL_TOTAL_SUPPLY }, 'latest'])),
        new Promise((_, non) => { minuteur = setTimeout(() => non(new Error('no answer within ' + delaiLectureMs + ' ms')), delaiLectureMs); }),
      ]);
      /* ⛔ UN MOT DE 32 OCTETS, EXACTEMENT. `0x` (un noeud qui ne sait pas lire un B20), une reponse tronquee ou un objet
       *   d erreur ne sont PAS des zeros : `BigInt('0x00')` vaut 0, et c est par la qu une non-reponse deviendrait un verdict. */
      if (typeof r !== 'string' || !MOT_32.test(r)) { compteurs.lecturesRatees += 1; return { lu: false, pourquoi: 'the node did not return a 32-byte word' }; }
      return { lu: true, supply: BigInt(r) };
    } catch (e) {
      compteurs.lecturesRatees += 1;
      return { lu: false, pourquoi: court(e) };
    } finally { if (minuteur) clearTimeout(minuteur); }
  }

  /** `enVolMax` lectures a la fois ; `echecsDeSuiteMax` echecs d affilee coupent la passe (le reste n est PAS lu). */
  async function lireEnLots(liste, garde) {
    const resultats = new Map();
    let i = 0;
    const ouvrier = async () => {
      while (i < liste.length) {
        const c = liste[i++];
        if (garde.coupee) { resultats.set(c.adr, { lu: false, pourquoi: 'not tried: the pass stopped after ' + echecsDeSuiteMax + ' failed reads in a row' }); continue; }
        const r = await lireSupply(c.adr);
        if (r.lu) garde.deSuite = 0;
        else { garde.deSuite += 1; if (garde.deSuite >= echecsDeSuiteMax) garde.coupee = true; }
        resultats.set(c.adr, r);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(enVolMax, liste.length)) }, ouvrier));
    return resultats;
  }

  async function passe() {
    const liste = cibles();
    const garde = { deSuite: 0, coupee: false };
    const premieres = await lireEnLots(liste, garde);
    /* les positifs s ecrivent tout de suite : une lecture > 0 n a besoin de rien d autre */
    for (const c of liste) {
      const r = premieres.get(c.adr);
      if (r && r.lu && r.supply > 0n) { verdicts.set(c.adr, { etat: NEE, supply: r.supply, t: maintenant() }); echecs.delete(c.adr); }
    }
    /* ⛔ LE TEMOIN, DE LA MEME FAMILLE : la passe a-t-elle lu AU MOINS UNE devise du meme genre AVEC des unites ? Sans lui,
     *   aucun zero de cette famille ne compte. Un temoin doit emprunter le chemin de ce qu il cautionne : 59 des 62 devises sont
     *   des B20 natifs (pas de bytecode ordinaire), et lire USDC ne prouve pas qu un noeud sait lire un B20. */
    const temoins = new Set();
    for (const c of liste) { const r = premieres.get(c.adr); if (r && r.lu && r.supply > 0n) temoins.add(famille(c.adr)); }
    const aTemoin = (c) => temoins.has(famille(c.adr));
    const zeros = liste.filter((c) => { const r = premieres.get(c.adr); return !!r && r.lu && r.supply === 0n; });
    /* ⛔ CHAQUE ZERO EST RELU. Sans temoin on ne relit meme pas : ce zero ne comptera pas, autant ne pas payer la lecture. */
    const aRelire = zeros.filter(aTemoin);
    const secondes = aRelire.length ? await lireEnLots(aRelire, garde) : new Map();
    const t = maintenant();
    let complete = liste.length > 0;
    for (const c of liste) {
      const r = premieres.get(c.adr);
      if (r && r.lu && r.supply > 0n) continue;
      let pourquoi = null;
      if (!r || !r.lu) pourquoi = (r && r.pourquoi) || 'not read';
      else if (!aTemoin(c)) pourquoi = 'zero read, but no currency of the same kind was read with units in this pass: the reader is not trusted';
      else {
        const r2 = secondes.get(c.adr);
        if (!r2 || !r2.lu) pourquoi = 'zero read once, not confirmed: ' + ((r2 && r2.pourquoi) || 'second read missing');
        else if (r2.supply !== 0n) pourquoi = 'two reads disagree (zero, then units)';
      }
      if (pourquoi === null) { verdicts.set(c.adr, { etat: PAS_NEE, supply: 0n, t }); echecs.delete(c.adr); continue; }
      /* ⛔ ICI ON N ECRIT PAS DANS `verdicts` : le dernier verdict mesure reste, avec son heure. */
      echecs.set(c.adr, { pourquoi, t });
      complete = false;
    }
    /* une devise sortie de la liste ne garde rien en memoire */
    const gardees = new Set(liste.map((c) => c.adr));
    for (const k of [...verdicts.keys()]) if (!gardees.has(k)) verdicts.delete(k);
    for (const k of [...echecs.keys()]) if (!gardees.has(k)) echecs.delete(k);
    if (garde.coupee) compteurs.passesCoupees += 1;
    dernierePasse = { fin: t, complete };
  }

  function instantane() {
    const t = maintenant();
    const compte = { [NEE]: 0, [PAS_NEE]: 0, [NON_LUE]: 0 };
    const lignes = cibles().map((c) => {
      const v = verdicts.get(c.adr), e = echecs.get(c.adr);
      if (v && t - v.t <= ageMaxMs) {
        compte[v.etat] += 1;
        return { adresse: c.adr, symbole: c.symbole, etat: v.etat, lu: new Date(v.t).toISOString(), supply: v.supply.toString(),
          /* la relecture a echoue DEPUIS : le verdict est celui de `lu`, et on dit pourquoi il n a pas ete rafraichi */
          pourquoi: e && e.t >= v.t ? 'kept from the reading at lu; the latest re-read failed: ' + e.pourquoi : null };
      }
      compte[NON_LUE] += 1;
      return { adresse: c.adr, symbole: c.symbole, etat: NON_LUE, lu: null, supply: null,
        pourquoi: e ? e.pourquoi : v ? 'the last reading is older than ' + Math.round(ageMaxMs / 60000) + ' min' : 'not read yet' };
    });
    return { ok: true, lu: dernierePasse ? new Date(dernierePasse.fin).toISOString() : null, enCours: enCours !== null,
      complet: lignes.length > 0 && compte[NON_LUE] === 0, ttlMs, ageMaxMs, compte, paires: lignes, borne: BORNE_ETAT_PAIRES };
  }

  async function lire() {
    const t = maintenant();
    const due = dernierePasse === null || t - dernierePasse.fin >= (dernierePasse.complete ? ttlMs : repriseMs);
    if (due && enCours === null) {
      compteurs.passes += 1;
      enCours = passe()
        .catch(() => { dernierePasse = { fin: maintenant(), complete: false }; })
        .finally(() => { enCours = null; });
    }
    /* ⛔ ON N ATTEND QU AU TOUT PREMIER APPEL, ET PAS LONGTEMPS. Ensuite : l etat en memoire part tout de suite et la passe
     *   tourne derriere — une requete HTTP ne reste jamais pendue a un noeud lent. */
    if (enCours !== null && dernierePasse === null) {
      let minuteur = null;
      await Promise.race([enCours, new Promise((oui) => { minuteur = setTimeout(oui, attenteFroideMs); })]);
      if (minuteur) clearTimeout(minuteur);
    }
    return instantane();
  }

  /** Pour /sante : des compteurs, lus en memoire. ⛔ Ne declenche aucune lecture (une sonde de sante ne doit rien couter). */
  function resume() {
    const s = instantane();
    return { lu: s.lu, enCours: s.enCours, complet: s.complet, ...s.compte, ...compteurs };
  }

  return { lire, instantane, resume };
}

/* ══ COTE ECRAN ═══════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** La reponse de /api/paires/etat -> Map adresse -> { etat, t }. `null` si ce n est pas la bonne forme : l appelant garde alors
 *  ce qu il avait, il ne grise rien de plus. */
export function etatsDepuisReponse(d) {
  if (!d || d.ok !== true || !Array.isArray(d.paires)) return null;
  const m = new Map();
  for (const p of d.paires) {
    const adr = String((p && p.adresse) || '').toLowerCase();
    if (!ADRESSE.test(adr)) continue;
    const t = p && typeof p.lu === 'string' ? Date.parse(p.lu) : NaN;
    m.set(adr, { etat: p ? String(p.etat) : NON_LUE, t: Number.isFinite(t) ? t : null });
  }
  return m;
}

/** LA REGLE DE L ECRAN, ET LA SEULE : griser une devise SEULEMENT sur un « not_born » MESURE et encore frais.
 *  ⛔ `not_read`, une entree absente, une heure illisible, un verdict trop vieux : `false` — la devise reste choisissable,
 *    exactement comme avant ce module. Fermer sur l inconnu ne protegerait personne : ca effacerait le choix.
 *  ⚠️ L AGE SE CALCULE AVEC L HORLOGE DE L APPELANT contre l heure de lecture du SERVEUR : un navigateur en avance de plus de
 *    30 min ne grise jamais rien (le sens sur) ; en retard, il garde un verdict d autant plus longtemps. Non corrige : le
 *    serveur applique deja sa propre limite d age avant de rendre « not_born ». */
export function estPasNeeMesuree(e, maintenant = Date.now(), ageMaxMs = AGE_MAX_MS) {
  if (!e || e.etat !== PAS_NEE) return false;
  if (typeof e.t !== 'number' || !Number.isFinite(e.t) || !Number.isFinite(maintenant)) return false;
  return maintenant - e.t <= ageMaxMs;
}
