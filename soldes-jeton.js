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

const hex = (n) => '0x' + Number(n).toString(16);
const mot = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const adrDeTopic = (t) => '0x' + String(t).slice(26).toLowerCase();

/**
 * Trouve le bloc de naissance d un jeton : son premier Transfer depuis l adresse zero.
 * ⛔ Rend `null` si rien n est trouve, JAMAIS une valeur par defaut : deviner une naissance ferait
 *    manquer tous les mouvements anterieurs et donnerait des soldes faux sans aucun signe.
 */
export async function naissanceDuJeton({ rpc, jeton, depuis, jusqua, pas = PAS_LOGS }) {
  for (let d = depuis; d <= jusqua; d += pas) {
    const a = Math.min(d + pas - 1, jusqua);
    let logs = null;
    try {
      logs = await rpc('eth_getLogs', [{ address: jeton, topics: [TOPIC_TRANSFER, mot(ADRESSE_ZERO)],
        fromBlock: hex(d), toBlock: hex(a) }]);
    } catch (e) { continue; /* fenetre refusee : on continue, la naissance sera dite introuvable si besoin */ }
    if (Array.isArray(logs) && logs.length) return parseInt(logs[0].blockNumber, 16);
  }
  return null;
}

/**
 * Rejoue les Transfer de [deBloc, aBloc] et cumule dans `soldes` (Map adresse -> bigint).
 * @returns {{nLogs:number, ratees:number}}
 */
export async function rejouerTransferts({ rpc, jeton, deBloc, aBloc, soldes, pas = PAS_LOGS }) {
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
export async function passeIncrementale({ rpc, jeton, etat, naissance, fin, pas = PAS_LOGS }) {
  const deBloc = etat.jusqua === null ? naissance : etat.jusqua + 1;
  if (!Number.isInteger(deBloc) || !Number.isInteger(fin) || deBloc > fin) {
    return { publie: false, ratees: etat.ratees || 0, deBloc: null };
  }
  /* ⛔ MAP NEUVE : rien de ce qui suit ne peut salir l etat publie si la passe echoue. */
  const neuf = new Map(etat.soldes);
  const passe = await rejouerTransferts({ rpc, jeton, deBloc, aBloc: fin, soldes: neuf, pas });
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
