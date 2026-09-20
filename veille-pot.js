/* veille-pot.js — le veilleur du pot. Il crie sur ce que le contrat, lui, accepte.
 *
 * ⛔⛔ CE FICHIER EXISTE A CAUSE D UNE TROUVAILLE D AUDIT CRITIQUE (2026-09-20), confirmee par un
 *    sceptique qui a echoue a la refuter et l a reproduite sous forge, sur le contrat DEPLOYE :
 *
 *    `TBlockPot.ancrer` n ecrit `p.ancreeLe` que sous `if (p.ancreeLe == 0)`. Le delai de
 *    contestation de 6 h est donc porte par la PERIODE, alors que la racine et le pot sont par
 *    JETON. Consequence : tout jeton ancre plus de 6 h apres le PREMIER ancrage de sa periode est
 *    reclamable DANS LE MEME BLOC que sa racine. Zero seconde pour que quiconque recalcule.
 *    Pire : un ancrage bidon avec `total = 0` sur un jeton inexistant coute le gas et rien d autre
 *    (la garde ne refuse que `total > depose`, et `0 > 0` est faux) — il suffit a armer l horloge.
 *
 * ⛔ LE CONTRAT N EST PAS MODIFIABLE. La garde devient donc OPERATIONNELLE : une periode = UN seul
 *    jeton, pour toujours. Ce fichier ne peut rien empecher ; il peut RENDRE VISIBLE, et c est la
 *    seule chose qui reste quand la protection on-chain n existe pas.
 *
 * ⛔ IL NE CRIE QUE SUR CE QU IL A LU. Une fenetre de logs refusee rend l analyse INCOMPLETE et le
 *    dit — un veilleur qui rend « rien a signaler » sur une lecture ratee est pire que pas de
 *    veilleur : il endort.
 */

/** Topics MESURES avec `cast sig-event` le 2026-09-20, jamais ecrits de memoire. */
export const TOPICS = Object.freeze({
  Ancree: '0xcff47b89d2e3ff39894d698035c348df26674a39090cdaddd410662eef759491',
  PeriodeOuverte: '0x3117a2a215863631c87e5ab60915614daad7e543f520d95d57dbe579c6f20392',
  Reclame: '0x04682a60ed6f7644725f20ba2b6510cb049215ecda556adc78ce2f6a2c9795af',
  Alimente: '0x84beac4e0714ab11006ee64dbaf24f22874f1f12b76a4ed1d17ea1ecf50f2645',
});

export const DELAI_CONTESTATION = 6 * 3600;
export const GRAVITES = Object.freeze(['CRITIQUE', 'AVERTISSEMENT']);

/** Decode un evenement Ancree : id et jeton indexes, puis graine, cible, racine, total. */
export function decoderAncree(log) {
  if (!log || !Array.isArray(log.topics) || log.topics[0] !== TOPICS.Ancree) return null;
  const m = String(log.data || '').replace(/^0x/, '').match(/.{64}/g);
  if (!m || m.length < 4) return null;
  return {
    id: Number(BigInt(log.topics[1])),
    jeton: '0x' + String(log.topics[2]).slice(26).toLowerCase(),
    graine: '0x' + m[0],
    cible: Number(BigInt('0x' + m[1])),
    racine: '0x' + m[2],
    total: BigInt('0x' + m[3]),
    bloc: log.blockNumber ? Number(BigInt(log.blockNumber)) : null,
    tx: log.transactionHash || null,
  };
}

/**
 * Analyse une suite d ancrages et rend les alertes.
 *
 * @param {Array<{id:number, jeton:string, total:bigint, horodatage:number, tx?:string}>} ancrages
 *        dans l ordre de la chaine. `horodatage` en secondes.
 * @param {object} [opts] {delai}
 */
export function analyserAncrages(ancrages, opts = {}) {
  const delai = Number.isFinite(opts.delai) ? opts.delai : DELAI_CONTESTATION;
  const alertes = [];
  /* id de periode -> horodatage du PREMIER ancrage, celui qui arme l horloge */
  const premier = new Map();
  for (const a of ancrages || []) {
    if (!a || !Number.isInteger(a.id)) continue;
    if (!premier.has(a.id)) { premier.set(a.id, a.horodatage); continue; }

    const t0 = premier.get(a.id);
    const ecart = a.horodatage - t0;
    /* ⛔ LE CAS DE L AUDIT : un second jeton sur la meme periode. Le contrat l accepte ; nous non. */
    alertes.push({
      gravite: ecart >= delai ? 'CRITIQUE' : 'AVERTISSEMENT',
      periode: a.id,
      jeton: a.jeton,
      tx: a.tx || null,
      ecartSecondes: ecart,
      /* ⛔ CE QUI RESTE DE FENETRE, CHIFFRE. « Plus de delai » et « il en reste 20 minutes » sont
       *    deux situations differentes, et un veilleur qui les confond ne sert a rien. */
      contestationRestanteSecondes: Math.max(0, delai - ecart),
      pourquoi: ecart >= delai
        ? 'this token was anchored ' + ecart + ' s after the round was first anchored, and the 6 h '
          + 'challenge window is counted from that FIRST anchor — so this root had NO window at all'
        : 'a second token was anchored on the same round; its challenge window is shortened to '
          + Math.max(0, delai - ecart) + ' s instead of ' + delai,
      regle: 'ONE ROUND, ONE TOKEN. The contract cannot enforce it; this watcher makes it visible.',
    });
  }
  return { alertes, periodesAncrees: premier.size, ancragesLus: (ancrages || []).length };
}

/**
 * Lit les ancrages du pot sur la chaine et les analyse.
 * ⛔ Rend `complet: false` des qu une fenetre est refusee. Un veilleur qui rend « rien a signaler »
 *    sur une lecture ratee endort au lieu de garder.
 */
export async function veiller({ rpc, pot, depuis, pas = 2000 }) {
  const teteHex = await rpc('eth_blockNumber', []);
  const tete = Number(BigInt(teteHex));
  const logs = [];
  let ratees = 0;
  for (let d = depuis; d <= tete; d += pas) {
    const a = Math.min(d + pas - 1, tete);
    try {
      const l = await rpc('eth_getLogs', [{ address: pot, topics: [TOPICS.Ancree],
        fromBlock: '0x' + d.toString(16), toBlock: '0x' + a.toString(16) }]);
      if (Array.isArray(l)) logs.push(...l); else ratees++;
    } catch (e) { ratees++; }
  }
  /* horodatage : on lit le bloc de chaque ancrage. ⛔ Sans lui on ne peut pas mesurer l ecart, et
   *    une alerte sans son ecart ne dit pas si la fenetre existait encore. */
  const ancrages = [];
  const blocsLus = new Map();
  for (const l of logs) {
    const a = decoderAncree(l);
    if (!a) { ratees++; continue; }
    if (!blocsLus.has(a.bloc)) {
      try {
        const b = await rpc('eth_getBlockByNumber', ['0x' + a.bloc.toString(16), false]);
        blocsLus.set(a.bloc, b && b.timestamp ? Number(BigInt(b.timestamp)) : null);
      } catch (e) { blocsLus.set(a.bloc, null); }
    }
    const ts = blocsLus.get(a.bloc);
    if (ts === null) { ratees++; continue; }
    ancrages.push({ ...a, horodatage: ts });
  }
  const r = analyserAncrages(ancrages);
  return {
    ...r,
    complet: ratees === 0,
    ratees,
    tete,
    /* ⛔ LA BORNE VOYAGE AVEC LE RESULTAT : « 0 alerte » sur une lecture trouee ne vaut rien. */
    borne: ratees === 0
      ? 'Every Ancree event between block ' + depuis + ' and ' + tete + ' was read.'
      : ratees + ' read(s) failed — this is a FLOOR, not a verdict. Do not read "no alert" as "all clear".',
  };
}
