/* soldes-jeton.js — reconstruire QUI detient un block, et COMBIEN, en rejouant ses Transfer.
 *
 * ⛔⛔ LA REGLE DE CE FICHIER : UNE RECONSTRUCTION TROUEE N EST PAS UNE RECONSTRUCTION. Si une seule
 *    fenetre est refusee par le noeud, les soldes obtenus sont FAUX -- pas « approximatifs », faux :
 *    un Transfer manquant laisse des jetons chez quelqu un qui ne les a plus. On le DIT (`complet:
 *    false`) et on n avance pas le curseur. Rien ne doit pouvoir lire ce resultat comme definitif.
 *
 * ⛔ INCREMENTAL : les soldes se cumulent. Un second appel ne rejoue que les blocs neufs, et le
 *    curseur `jusqua` n avance QUE sur un balayage propre -- sinon un trou serait recouvert par un
 *    « deja lu », exactement le defaut corrige pour mesFrappes et pour nos-blocks.
 *
 * ⛔ VERIFIE PAR `totalSupply`, PAS PAR LA FOI : `verifierSomme` compare la somme reconstruite au
 *    total lu sur la chaine. C est le premier juge ; le second (balanceOf adresse par adresse) vit
 *    dans les tests, parce qu il coute un appel par detenteur.
 */

export const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const ADRESSE_ZERO = '0x0000000000000000000000000000000000000000';
export const PAS_LOGS = 2000;
/* ══ 2026-10-26 (game57) — LA PASSE DES HOLDERS RELIT AU LIEU DE TOUT JETER ═════════════════════════════════════════════════════════
 * ⛔ MESURE PROD (game56) : /api/holders/<UNIT> NON_LU en boucle — le noeud refuse au-dela de ~138 fenetres eth_getLogs ; la passe est
 *   ATOMIQUE (une fenetre ratee la jette), donc elle repartait de la naissance (52 694 118) a chaque tour et ne finissait jamais.
 * ⇒ passeIncrementale (seule appelee par /api/holders) lit par PAS_HOLDERS blocs, et RELIT une fenetre refusee (REPRISE_HOLDERS) :
 *   attente exponentielle ; « range too large » ou limite de debit = fenetre divisee par deux (une limite de debit la laisse regrandir
 *   apres un succes, un « too large » plafonne la suite de la passe) ; refus de budget d archive (certain jusqu a 00:00 UTC) : arret net.
 * ⛔ L ATOMICITE NE CHANGE PAS : une fenetre n est appliquee que LUE en entier, le curseur n avance que sur elle (ni trou, ni double
 *   comptage) ; une fenetre qui epuise ses essais ARRETE la passe, ratees > 0, rien n est publie -> la route dit NON_LU.
 * ⛔ rejouerTransferts SANS `reprise` (soldesAuBloc, boucle-pot) : exactement le comportement d avant. */
export const PAS_HOLDERS = 1000;
export const REPRISE_HOLDERS = Object.freeze({ essais: 7, attenteMs: 500, attenteMaxMs: 10000, pasMin: 10 });
const RE_BUDGET = /archive node daily budget reached/i;
const RE_DEBIT = /429|rate.?limit|too many requests|request limit|throttl|capacity|-3200[5]/i;
const RE_TROP_LARGE = /413|too large|block range|range (is )?too|exceed|more than \d+|response size|too many (logs|results)|ranges over/i;
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

const hex = (n) => '0x' + Number(n).toString(16);
/* ⛔ 2026-10-25 : un topic eth_getLogs est un mot 0x-prefixe. Sans « 0x », publicnode le tolerait et l archive Coinbase
 *    le refusait (« hex string without 0x prefix », 176 refus sur /api/holders). Banc : test-topic-0x-20261025.mjs. */
const mot = (a) => '0x' + String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const adrDeTopic = (t) => '0x' + String(t).slice(26).toLowerCase();

/**
 * Cherche le bloc de naissance d un jeton : son premier Transfer depuis l adresse zero. TROIS etats :
 *   LUE      { bloc }                          le premier mint, et chaque fenetre AVANT lui a ete lue ;
 *   ABSENTE  { luJusqua }                      chaque fenetre de [depuis, jusqua] lue, aucun mint ;
 *   NON_LUE  { luJusqua, refusee, pourquoi }   une fenetre refusee : le balayage S ARRETE sur elle.
 * ⛔⛔ AUDIT DU 2026-10-09 (budget du noeud d archive) : la version precedente faisait `continue` sur une
 *    fenetre refusee et rendait le premier mint trouve APRES elle. Si la fenetre sautee portait la vraie
 *    naissance, un mint POSTERIEUR devenait la naissance : serveur-web.js rejouait depuis la, l ecrivait
 *    dans holders-cache.json, et ne la cherchait plus jamais (elle ne se cherche que tant qu elle vaut null).
 *    Une fenetre refusee n est pas une fenetre vide : on ne sait pas qu elle ne portait pas la naissance.
 * ⛔ `luJusqua` : fin du prefixe CONTIGU lu sans mint (depuis - 1 si rien n a ete lu).
 * ⛔ Un resultat qui n est pas une liste est NON_LUE, comme dans rejouerTransferts -- pas une fenetre vide.
 */
export async function lireNaissance({ rpc, jeton, depuis, jusqua, pas = PAS_LOGS }) {
  let lu = depuis - 1;
  for (let d = depuis; d <= jusqua; d += pas) {
    const a = Math.min(d + pas - 1, jusqua);
    let logs = null;
    try {
      logs = await rpc('eth_getLogs', [{ address: jeton, topics: [TOPIC_TRANSFER, mot(ADRESSE_ZERO)],
        fromBlock: hex(d), toBlock: hex(a) }]);
    } catch (e) {
      return { etat: 'NON_LUE', bloc: null, luJusqua: lu, refusee: { de: d, a },
        pourquoi: String((e && e.message) || e).slice(0, 120) };
    }
    if (!Array.isArray(logs)) {
      return { etat: 'NON_LUE', bloc: null, luJusqua: lu, refusee: { de: d, a }, pourquoi: 'not a list' };
    }
    if (logs.length) return { etat: 'LUE', bloc: parseInt(logs[0].blockNumber, 16) };
    lu = a;
  }
  return { etat: 'ABSENTE', bloc: null, luJusqua: lu };
}

/**
 * Le bloc de naissance, ou `null`.
 * ⛔ Rend `null` si rien n est trouve OU si une fenetre a ete refusee avant le premier mint, JAMAIS une
 *    valeur par defaut ni un mint posterieur a une fenetre non lue : deviner une naissance ferait manquer
 *    tous les mouvements anterieurs et donnerait des soldes faux sans aucun signe.
 * ⛔ Ce `null` CONFOND « absente » et « pas lue ». Qui doit les distinguer appelle `lireNaissance`
 *    (serveur-web.js le fait). boucle-pot.js garde ce `null` : il y vaut un refus d ancrer.
 */
export async function naissanceDuJeton(args) {
  const r = await lireNaissance(args);
  return r.etat === 'LUE' ? r.bloc : null;
}

/**
 * Rejoue les Transfer de [deBloc, aBloc] et cumule dans `soldes` (Map adresse -> bigint).
 * @returns {{nLogs:number, ratees:number}}
 */
export async function rejouerTransferts({ rpc, jeton, deBloc, aBloc, soldes, pas = PAS_LOGS, reprise = null, attendre = dormir }) {
  if (reprise) return rejouerAvecReprise({ rpc, jeton, deBloc, aBloc, soldes, pas, reprise, attendre });
  let nLogs = 0, ratees = 0;
  for (let d = deBloc; d <= aBloc; d += pas) {
    const a = Math.min(d + pas - 1, aBloc);
    let logs = null;
    try {
      logs = await rpc('eth_getLogs', [{ address: jeton, topics: [TOPIC_TRANSFER], fromBlock: hex(d), toBlock: hex(a) }]);
    } catch (e) { ratees++; continue; }
    if (!Array.isArray(logs)) { ratees++; continue; }
    for (const l of logs) {
      nLogs++;
      const de = adrDeTopic(l.topics[1]), vers = adrDeTopic(l.topics[2]);
      const v = BigInt(l.data);
      if (de !== ADRESSE_ZERO) soldes.set(de, (soldes.get(de) || 0n) - v);
      if (vers !== ADRESSE_ZERO) soldes.set(vers, (soldes.get(vers) || 0n) + v);
    }
  }
  return { nLogs, ratees };
}

/** Applique les Transfer d une fenetre LUE EN ENTIER a `soldes`. */
function appliquer(logs, soldes) {
  for (const l of logs) {
    const de = adrDeTopic(l.topics[1]), vers = adrDeTopic(l.topics[2]);
    const v = BigInt(l.data);
    if (de !== ADRESSE_ZERO) soldes.set(de, (soldes.get(de) || 0n) - v);
    if (vers !== ADRESSE_ZERO) soldes.set(vers, (soldes.get(vers) || 0n) + v);
  }
  return logs.length;
}

/**
 * rejouerTransferts AVEC RELECTURE (REPRISE_HOLDERS) — voir l en-tete PAS_HOLDERS.
 * ⛔ Le curseur `d` n avance que sur une fenetre lue en entier (une liste) : aucune fenetre sautee, aucune lue deux fois.
 * ⛔ Une fenetre qui epuise `essais` echecs CONSECUTIFS (ou un refus de budget) ARRETE le rejeu : { ratees: 1, refusee, pourquoi }.
 *   Continuer ne servirait a rien — la passe est jetee de toute facon — et couterait une requete par fenetre restante.
 * @returns {{nLogs:number, ratees:number, refusee?:{de:number,a:number}, pourquoi?:string}}
 */
async function rejouerAvecReprise({ rpc, jeton, deBloc, aBloc, soldes, pas, reprise, attendre }) {
  const { essais, attenteMs, attenteMaxMs, pasMin } = { ...REPRISE_HOLDERS, ...reprise };
  let nLogs = 0, plafond = Math.max(pasMin, pas), courant = plafond, echecs = 0;
  for (let d = deBloc; d <= aBloc;) {
    const a = Math.min(d + courant - 1, aBloc);
    let logs = null, err = null;
    try {
      logs = await rpc('eth_getLogs', [{ address: jeton, topics: [TOPIC_TRANSFER], fromBlock: hex(d), toBlock: hex(a) }]);
      if (!Array.isArray(logs)) err = new Error('not a list');
    } catch (e) { err = e; }
    if (!err) {
      nLogs += appliquer(logs, soldes);
      d = a + 1; echecs = 0;
      courant = Math.min(plafond, courant * 2);
      continue;
    }
    const msg = String((err && err.message) || err);
    const refus = () => ({ nLogs, ratees: 1, refusee: { de: d, a }, pourquoi: msg.slice(0, 120) });
    if (RE_BUDGET.test(msg)) return refus();
    const debit = RE_DEBIT.test(msg), large = !debit && RE_TROP_LARGE.test(msg);
    if (large && courant > pasMin) { plafond = Math.max(pasMin, Math.floor(courant / 2)); courant = plafond; continue; }
    if (debit) courant = Math.max(pasMin, Math.floor(courant / 2));
    echecs += 1;
    if (echecs >= essais) return refus();
    await attendre(Math.min(attenteMaxMs, attenteMs * 2 ** (echecs - 1)));
  }
  return { nLogs, ratees: 0 };
}

/**
 * Une passe incrementale ATOMIQUE sur un etat { soldes, jusqua, ratees }.
 *
 * ⛔⛔ CETTE FONCTION EXISTE A CAUSE D UNE TROUVAILLE D AUDIT (2026-09-20), reproduite a
 *    l execution contre le vrai serveur : la version precedente passait la Map du cache
 *    DIRECTEMENT a rejouerTransferts, qui MUTE EN PLACE. Une passe a moitie echouee laissait ses
 *    mutations dedans pendant que le curseur, lui, n avancait pas — et la passe suivante
 *    REAPPLIQUAIT les memes Transfer. Un detenteur ressortait credite de 25 000 au lieu de 15 000.
 * ⛔ ET LES TROIS GARDES PASSAIENT. Un transfert entre deux adresses non nulles CONSERVE la somme,
 *    donc verifierSomme rendait JUSTE ; aucun solde ne devenait negatif ; et ratees etait ECRASE a
 *    zero par la passe suivante. Le faux sortait sans la moindre erreur.
 *
 * LA REGLE : on rejoue dans une Map NEUVE, et soldes + curseur + compteur changent ENSEMBLE ou pas
 * du tout. Une passe sale est JETEE EN ENTIER — garder ses mutations « en attendant » est
 * exactement ce qui produisait le double comptage.
 *
 * @param {object} e
 * @param {{soldes:Map, jusqua:number|null, ratees:number}} e.etat  muté en place, atomiquement
 * @returns {{publie:boolean, ratees:number, deBloc:number|null}}
 */
export async function passeIncrementale({ rpc, jeton, etat, naissance, fin, pas = PAS_HOLDERS, reprise = REPRISE_HOLDERS, attendre = dormir }) {
  const deBloc = etat.jusqua === null ? naissance : etat.jusqua + 1;
  if (!Number.isInteger(deBloc) || !Number.isInteger(fin) || deBloc > fin) {
    return { publie: false, ratees: etat.ratees || 0, deBloc: null };
  }
  /* ⛔ MAP NEUVE : rien de ce qui suit ne peut salir l etat publie si la passe echoue. */
  const neuf = new Map(etat.soldes);
  const passe = await rejouerTransferts({ rpc, jeton, deBloc, aBloc: fin, soldes: neuf, pas, reprise, attendre });
  if (passe.ratees) {
    etat.ratees = passe.ratees;
    return { publie: false, ratees: passe.ratees, deBloc };
  }
  etat.soldes = neuf;
  etat.jusqua = fin;
  etat.ratees = 0;
  return { publie: true, ratees: 0, deBloc };
}

/**
 * Reconstruit les soldes A UN BLOC DONNE, et lit `totalSupply` AU MEME BLOC.
 *
 * ⛔⛔ POUR UNE RECOMPENSE, LA TETE DE CHAINE EST LA MAUVAISE REPONSE. Le tirage designe un bloc
 *    precis ; payer d apres les soldes d aujourd hui paierait quelqu un qui a VENDU depuis, et
 *    oublierait quelqu un qui tenait au bon moment. C est exactement le comportement que la
 *    recompense est censee decourager.
 * ⛔ ET `totalSupply` EST LU AU MEME BLOC. Le comparer au total d aujourd hui confronterait deux
 *    instants differents : une reconstruction juste serait declaree FAUSSE, ou l inverse.
 * ⛔ AUCUN CACHE ICI, EXPRES : ce calcul sert a ancrer de l argent. Il repart des logs a chaque fois,
 *    et une seule fenetre refusee le rend INVALIDE.
 *
 * @returns {{etat:'COMPLET'|'INCOMPLET', soldes:Map, pourquoi?:string, somme?:bigint, total?:bigint}}
 */
export async function soldesAuBloc({ rpc, jeton, naissance, auBloc, pas = PAS_LOGS }) {
  if (!Number.isInteger(auBloc) || !Number.isInteger(naissance) || auBloc < naissance) {
    return { etat: 'INCOMPLET', soldes: new Map(),
      pourquoi: 'bornes absurdes : naissance ' + naissance + ', bloc vise ' + auBloc };
  }
  const soldes = new Map();
  const { ratees } = await rejouerTransferts({ rpc, jeton, deBloc: naissance, aBloc: auBloc, soldes, pas });
  if (ratees) {
    return { etat: 'INCOMPLET', soldes,
      pourquoi: ratees + ' window(s) refused by the node — a holed replay would pay the wrong addresses' };
  }
  const negatifs = soldesNegatifs(soldes);
  if (negatifs.length) {
    return { etat: 'INCOMPLET', soldes,
      pourquoi: negatifs.length + ' impossible negative balance(s) — logs are missing' };
  }
  /* ⛔ LE TOTAL EST LU AU BLOC VISE, avec le meme tag de bloc que le rejeu. */
  let total = null;
  try {
    const t = await rpc('eth_call', [{ to: jeton, data: '0x18160ddd' }, '0x' + auBloc.toString(16)]);
    if (typeof t === 'string' && t !== '0x') total = BigInt(t);
  } catch (e) { total = null; }
  const v = verifierSomme({ soldes, totalSupply: total });
  if (v.etat !== 'JUSTE') {
    return { etat: 'INCOMPLET', soldes, somme: v.somme, total,
      pourquoi: v.etat === 'NON_LU'
        ? 'totalSupply could not be read at block ' + auBloc
        : 'reconstructed sum differs from totalSupply at block ' + auBloc + ' by ' + v.ecart };
  }
  return { etat: 'COMPLET', soldes, somme: v.somme, total };
}

/**
 * La somme des soldes positifs doit egaler `totalSupply`. Trois etats, jamais un booleen : « pas lu »
 * n est ni « juste » ni « faux », et le confondre avec l un des deux publierait une fausse certitude.
 */
export function verifierSomme({ soldes, totalSupply }) {
  const somme = [...soldes.values()].reduce((s, v) => s + (v > 0n ? v : 0n), 0n);
  if (typeof totalSupply !== 'bigint') return { etat: 'NON_LU', somme, ecart: null };
  const ecart = somme - totalSupply;
  return { etat: ecart === 0n ? 'JUSTE' : 'FAUX', somme, ecart };
}

/**
 * ⛔ Un solde NEGATIF est impossible sur un ERC-20 : s il en sort un, la reconstruction est fausse et
 *    il faut le dire, pas le filtrer en silence.
 */
export function soldesNegatifs(soldes) {
  return [...soldes.entries()].filter(([, v]) => v < 0n).map(([adr, v]) => ({ adr, montant: v }));
}
