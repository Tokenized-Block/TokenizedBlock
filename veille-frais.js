/* veille-frais.js — LES FRAIS ARRIVENT-ILS VRAIMENT AU WALLET, MAINTENANT, SUR TOUS NOS HOOKS ?
 *
 * ⛔⛔ CE QUE CE MODULE CORRIGE. `/api/frais-hook` ne regardait que le V2 et le V3. Or la mesure du
 *     2026-09-21 dit que c est le V1 qui encaisse TOUT : 39 encaissements sur 14 jours, 19 en ETH et
 *     20 en jetons. L endpoint rendait donc `lignes: []` — « rien en attente » et « on n a pas
 *     regarde la ou est l argent » produisent exactement le meme vide.
 *
 * ⛔ UN EVENEMENT N EST PAS UN ENCAISSEMENT. Le hook emet ce qu il veut ; ce qui compte, c est que le
 *    SOLDE du beneficiaire ait bouge. Chaque evenement est donc confronte a un delta de solde lu au
 *    bloc precedent et au bloc meme. Si les deux ne concordent pas, on le DIT au lieu de choisir.
 *
 * ⛔ ET LE DELTA A SA PROPRE BORNE : d autres transactions du MEME bloc peuvent bouger le solde. Un
 *    delta plus grand que le montant n est donc pas une anomalie ; un delta PLUS PETIT en est une.
 *    C est cette asymetrie qui est testee, pas une egalite qu on ne peut pas garantir.
 *
 * ⛔ AUCUNE ECRITURE, AUCUNE SIGNATURE : lecture seule.
 */
import { keccak256 } from './keccak.js';

const enHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
/** ⛔ Les topics sont CALCULES. Un topic recopie de memoire est un topic invente, et il rend zero. */
export const topicDe = (signature) => '0x' + enHex(keccak256(new TextEncoder().encode(signature)));

export const TOPIC_PAYE = topicDe('Paye(address,address,uint256)');
export const TOPIC_MIS_EN_ATTENTE = topicDe('MisEnAttente(address,address,uint256)');
export const TOPIC_MISE_EN_VIE = topicDe('MiseEnViePayee(bytes32,address,uint256)');
/** ⛔ Le V1 n a AUCUNE source dans le depot : son evenement de frais est identifie par sa FORME
 *  (2 arguments indexes — poolId puis devise — et 3 mots de donnees dont le second vaut la moitie
 *  du premier). Ce topic vient d une lecture de la chaine, pas d une signature qu on aurait devinee. */
export const TOPIC_FRAIS_V1 = '0x2c9f5d6d35737ca7ac4f06b6cfe73dce0ce7f6a99d38bc128a4e2a7986736c88';

export const ETH_NATIF = '0x0000000000000000000000000000000000000000';

/** Nos hooks, NOMMES un par un. ⛔ En oublier un rend un zero qui se lit comme « rien n arrive ». */
export const HOOKS = Object.freeze({
  V1: '0xaa6d7bd9fc7d394bc717137936f2939834382044',
  V2: '0x8e1eb57ad2a87a4f7bc89ce94efd5cd77aec2044',
  V3: '0x7a7cebb2ccb84c9fbfa2730e6cb23bb192166044',
  V4: '0x11fcd588c96b1781cc88b8b9f349b6067d9be4c4',
  V5: '0x799136c3f5f572f1597b5b7e067d3ee45fe4a4c4',
  V6: '0xd71af554b5b3dcb6bb17946cfa3c41860a50a4cc',
});

export const PAS_LOGS = 2000; /* mesure : la limite de getLogs sur mainnet.base.org */
export const ETATS_ARRIVEE = Object.freeze(['ARRIVE', 'PAS_ARRIVE', 'NON_CONCLUANT', 'NON_LU']);

/** Topic de l evenement des comptes intelligents ERC-4337. ⛔ En ERC-4337 le `from` d une
 *  transaction est le BUNDLER, pas le payeur : c est le `sender` de la UserOperation qu il faut lire.
 *  Les confondre accuserait un innocent — ou blanchirait un coupable. */
export const TOPIC_USER_OP = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';

/**
 * Qui a REELLEMENT paye cette transaction ?
 * ⛔ Rend null si on ne peut pas le lire — « je ne sais pas » n est pas « ce n est pas lui ».
 */
export async function payeurDe({ rpc, tx }) {
  let recu, t;
  try {
    recu = await rpc('eth_getTransactionReceipt', [tx]);
    t = await rpc('eth_getTransactionByHash', [tx]);
  } catch { return null; }
  if (!recu || !t) return null;
  const uo = (recu.logs || []).find((l) => String((l.topics || [])[0]).toLowerCase() === TOPIC_USER_OP);
  if (uo && uo.topics && uo.topics[2]) return ('0x' + String(uo.topics[2]).slice(26)).toLowerCase();
  return t.from ? String(t.from).toLowerCase() : null;
}

const estAdresse = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x || ''));
const mot = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');

/**
 * Decode un evenement de frais, quel que soit le hook qui l a emis.
 *
 * ⛔ REND null PLUTOT QU UN EVENEMENT A MOITIE LU. Un montant absent compte pour zero et ferait
 *    croire a un encaissement nul la ou il y a eu un encaissement reel.
 *
 * @returns {{hook:string, type:string, bloc:number, tx:string, devise:string,
 *            beneficiaire:string|null, montant:bigint}|null}
 */
export function decoderFrais(log, nomHook) {
  if (!log || !Array.isArray(log.topics) || !log.topics.length) return null;
  const bloc = Number.parseInt(log.blockNumber, 16);
  if (!Number.isInteger(bloc)) return null;
  const mots = String(log.data || '').replace(/^0x/, '').match(/.{64}/g) || [];
  const t0 = String(log.topics[0]).toLowerCase();
  const commun = { hook: nomHook, bloc, tx: log.transactionHash };

  if (t0 === TOPIC_PAYE.toLowerCase() || t0 === TOPIC_MIS_EN_ATTENTE.toLowerCase()) {
    if (log.topics.length < 3 || !mots.length) return null;
    return {
      ...commun,
      type: t0 === TOPIC_PAYE.toLowerCase() ? 'PAYE' : 'MIS_EN_ATTENTE',
      beneficiaire: '0x' + String(log.topics[1]).slice(26).toLowerCase(),
      devise: '0x' + String(log.topics[2]).slice(26).toLowerCase(),
      montant: BigInt('0x' + mots[0]),
    };
  }
  if (t0 === TOPIC_MISE_EN_VIE.toLowerCase()) {
    if (log.topics.length < 3 || !mots.length) return null;
    return {
      ...commun, type: 'MISE_EN_VIE',
      beneficiaire: null, /* ⛔ l evenement ne porte pas le destinataire : c est le wallet de frais */
      devise: ETH_NATIF,
      montant: BigInt('0x' + mots[0]),
    };
  }
  if (t0 === TOPIC_FRAIS_V1.toLowerCase()) {
    /* ⛔ FORME MESUREE : indexe[1] = la devise, data[0] = le frais total, data[1] = la moitie.
     *    Si la forme ne tient pas, on rend null plutot que d inventer une lecture. */
    if (log.topics.length < 3 || mots.length < 2) return null;
    const total = BigInt('0x' + mots[0]);
    const moitie = BigInt('0x' + mots[1]);
    if (moitie * 2n !== total && moitie * 2n + 1n !== total) return null;
    return {
      ...commun, type: 'FRAIS_V1',
      beneficiaire: null,
      devise: '0x' + String(log.topics[2]).slice(26).toLowerCase(),
      montant: total,
    };
  }
  return null;
}

/**
 * Tous les encaissements de frais sur une fenetre, hook par hook.
 *
 * ⛔ `complet` DIT SI ON PEUT CONCLURE. Une seule fenetre refusee et le total devient un PLANCHER :
 *    « zero encaissement » et « on n a pas pu lire » ne doivent jamais se ressembler.
 */
export async function scanFrais({ rpc, deBloc, aBloc, hooks = HOOKS, pas = PAS_LOGS }) {
  if (!Number.isInteger(deBloc) || !Number.isInteger(aBloc) || deBloc > aBloc) {
    return { complet: false, evenements: [], fenetresRatees: 0, fenetres: 0,
      pourquoi: 'fenetre invalide : ' + deBloc + ' -> ' + aBloc };
  }
  const topics = [[TOPIC_PAYE, TOPIC_MIS_EN_ATTENTE, TOPIC_MISE_EN_VIE, TOPIC_FRAIS_V1]];
  const evenements = [];
  let fenetres = 0, fenetresRatees = 0, indecodables = 0;
  for (const [nom, adresse] of Object.entries(hooks)) {
    for (let de = deBloc; de <= aBloc; de += pas) {
      const a = Math.min(de + pas - 1, aBloc);
      fenetres++;
      let logs;
      try {
        logs = await rpc('eth_getLogs', [{ address: adresse, topics,
          fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }]);
      } catch { fenetresRatees++; continue; }
      if (!Array.isArray(logs)) { fenetresRatees++; continue; }
      for (const l of logs) {
        const e = decoderFrais(l, nom);
        if (e) evenements.push(e); else indecodables++;
      }
    }
  }
  evenements.sort((x, y) => x.bloc - y.bloc);
  return {
    complet: fenetresRatees === 0,
    evenements, fenetres, fenetresRatees, indecodables,
    borne: fenetresRatees
      ? fenetresRatees + ' window(s) were refused by the node, so this list is a FLOOR, not a count'
      : 'every window in this range was read',
  };
}

/**
 * Le solde du beneficiaire a-t-il VRAIMENT bouge a ce bloc ?
 *
 * ⛔ TROIS ETATS. « pas arrive » et « pas pu lire » appellent deux enquetes differentes : la premiere
 *    accuse le contrat, la seconde nous accuse nous.
 * ⛔ ET LA COMPARAISON EST ASYMETRIQUE, EXPRES : d autres transactions du meme bloc peuvent AUGMENTER
 *    le solde, donc un delta superieur au montant est normal. Un delta INFERIEUR ne l est pas.
 *    Exiger l egalite ferait crier au loup a chaque bloc un peu charge.
 */
export async function verifierArrivee({ rpc, evenement, wallet }) {
  const qui = evenement.beneficiaire || wallet;
  if (!estAdresse(qui)) return { etat: 'NON_LU', pourquoi: 'aucun beneficiaire a verifier' };
  const avantBloc = '0x' + (evenement.bloc - 1).toString(16);
  const apresBloc = '0x' + evenement.bloc.toString(16);
  const estEth = String(evenement.devise).toLowerCase() === ETH_NATIF;
  const lire = async (b) => {
    if (estEth) return BigInt(await rpc('eth_getBalance', [qui, b]));
    const r = await rpc('eth_call', [{ to: evenement.devise, data: '0x70a08231' + mot(qui) }, b]);
    if (!r || r === '0x') throw new Error('balanceOf vide');
    return BigInt(r);
  };
  let avant, apres;
  try { avant = await lire(avantBloc); apres = await lire(apresBloc); }
  catch (e) {
    return { etat: 'NON_LU', qui,
      pourquoi: 'solde illisible a ce bloc (' + String(e.message || e) + ') — c est nous, pas le hook' };
  }
  const delta = apres - avant;
  /* ⛔ MIS_EN_ATTENTE N EST PAS UN VERSEMENT : le montant reste dans le hook, en claims. Attendre un
   *    delta de solde le ferait passer pour un defaut alors que c est le comportement voulu. */
  if (evenement.type === 'MIS_EN_ATTENTE') {
    return { etat: 'ARRIVE', qui, delta, montant: evenement.montant,
      pourquoi: 'mis en claims dans le hook, pas verse — aucun delta de solde attendu' };
  }
  if (delta >= evenement.montant) return { etat: 'ARRIVE', qui, delta, montant: evenement.montant };
  /* ⛔⛔ AVANT D ACCUSER, ON REGARDE QUI A PAYE. Mesure du 2026-09-21, bloc 51527429 : une mise en
   *    vie annoncee a 379 133 982 157 954 wei avec un solde qui BAISSE de 55 248 742 656 000 — parce
   *    que le payeur etait le wallet de frais LUI-MEME. L argent a fait aller-retour, moins le gas,
   *    et aucun delta ne pourra jamais le confirmer. Une fausse alerte sur un ecran de surveillance
   *    coute plus cher qu un trou : on apprend a ignorer le rouge. */
  const payeur = await payeurDe({ rpc, tx: evenement.tx });
  if (payeur && payeur === String(qui).toLowerCase()) {
    return { etat: 'NON_CONCLUANT', qui, delta, montant: evenement.montant, payeur,
      pourquoi: 'le beneficiaire a paye lui-meme cette transaction : l argent fait un aller-retour '
        + 'et le gas rend le delta negatif — le solde ne peut rien confirmer ici' };
  }
  return { etat: 'PAS_ARRIVE', qui, delta, montant: evenement.montant, payeur,
    pourquoi: 'le solde a bouge de ' + delta + ' alors que l evenement annonce ' + evenement.montant };
}

/** Resume chiffre d un scan. ⛔ Ne rend JAMAIS un total quand le scan est incomplet sans le dire. */
export function resumerFrais(scan) {
  const parDevise = new Map();
  for (const e of scan.evenements || []) {
    const cle = e.devise;
    const v = parDevise.get(cle) || { n: 0, total: 0n };
    v.n++; v.total += e.montant;
    parDevise.set(cle, v);
  }
  return {
    complet: !!scan.complet,
    evenements: (scan.evenements || []).length,
    devises: [...parDevise.entries()].map(([devise, v]) => ({ devise, n: v.n, total: v.total })),
    borne: scan.complet ? 'complete count' : 'FLOOR — some windows were not read',
  };
}
