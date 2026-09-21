// test-veille-frais.mjs — la veille des frais, gardee par les cas qui font mal.
//
// ⛔⛔ LE DEFAUT QUE CE FICHIER EMPECHE DE REVENIR : `/api/frais-hook` ne lisait que V2 et V3 et
//    rendait `lignes: []`. Or c est le V1 qui encaisse tout — 39 encaissements sur 14 jours. Un vide
//    qui vient d une liste de hooks incomplete se lit exactement comme « rien n arrive ».
// ⛔ ET LE SECOND DEFAUT : croire un EVENEMENT. Un hook emet ce qu il veut ; seul un delta de solde
//    prouve un encaissement. Ici le delta est verifie, avec ses trois etats.
// RPC simule : rien ne part sur un reseau.
import assert from 'node:assert/strict';
import { decoderFrais, scanFrais, verifierArrivee, resumerFrais, topicDe, HOOKS, payeurDe, ETATS_ARRIVEE,
  TOPIC_PAYE, TOPIC_MIS_EN_ATTENTE, TOPIC_MISE_EN_VIE, TOPIC_FRAIS_V1, ETH_NATIF } from './veille-frais.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const A6CF = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const OK = '0xb2000000000000000000006d6f9102e9e4b221e0';
const m32 = (v) => BigInt(v).toString(16).padStart(64, '0');
const motAdr = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');

// ══ 1. LES TOPICS SONT CALCULES, PAS RECOPIES ═══════════════════════════════════════════════════
// ⛔ Un topic ecrit de memoire rend ZERO evenement — et un zero se lit comme « rien n arrive ».
{
  eq(TOPIC_PAYE, topicDe('Paye(address,address,uint256)'), 'le topic Paye se recalcule');
  eq(TOPIC_MISE_EN_VIE, topicDe('MiseEnViePayee(bytes32,address,uint256)'), 'celui de la mise en vie aussi');
  ok(TOPIC_PAYE !== TOPIC_MIS_EN_ATTENTE, 'Paye et MisEnAttente ne sont pas le meme evenement');
  ok(/^0x[0-9a-f]{64}$/.test(TOPIC_FRAIS_V1), 'le topic du V1 a la forme d un topic');
}

// ══ 2. LES SIX HOOKS SONT LA — C EST LE COEUR DU CORRECTIF ═════════════════════════════════════
// ⛔⛔ EN OUBLIER UN REND UN ZERO QUI MENT. La version precedente en listait DEUX sur cinq, et le
//    seul qui encaissait vraiment n y etait pas.
{
  eq(Object.keys(HOOKS).length, 6, 'six hooks surveilles, pas deux');
  for (const v of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']) ok(HOOKS[v], v + ' est surveille');
  eq(HOOKS.V1, '0xaa6d7bd9fc7d394bc717137936f2939834382044', 'le V1 — celui qui encaisse tout');
  eq(HOOKS.V6, '0xd71af554b5b3dcb6bb17946cfa3c41860a50a4cc', 'le V6, deploye le 2026-09-21');
  const adr = Object.values(HOOKS);
  eq(new Set(adr).size, 6, 'six adresses DISTINCTES — pas deux fois la meme');
}

// ══ 3. LE DECODAGE, ET SON REFUS ════════════════════════════════════════════════════════════════
{
  const paye = { blockNumber: '0x64', transactionHash: '0xaa',
    topics: [TOPIC_PAYE, '0x' + motAdr(A6CF), '0x' + motAdr(ETH_NATIF)], data: '0x' + m32(500) };
  const d = decoderFrais(paye, 'V5');
  eq(d.type, 'PAYE', 'un versement est reconnu');
  eq(d.hook, 'V5', 'le hook qui l a emis est porte');
  eq(d.beneficiaire, A6CF, 'le beneficiaire est decode');
  eq(d.devise, ETH_NATIF, 'la devise aussi');
  eq(d.montant, 500n, 'et le montant');
  eq(d.bloc, 100, 'le bloc est decode en decimal');

  // ⛔ TEMOIN : un evenement tronque rend null, JAMAIS un montant de zero.
  eq(decoderFrais({ blockNumber: '0x64', topics: [TOPIC_PAYE], data: '0x' }, 'V5'), null,
    'topics incomplets -> null');
  eq(decoderFrais({ blockNumber: '0x64', topics: [TOPIC_PAYE, '0x' + motAdr(A6CF), '0x' + motAdr(ETH_NATIF)], data: '0x' }, 'V5'),
    null, 'donnees vides -> null');
  eq(decoderFrais({ topics: [TOPIC_PAYE] }, 'V5'), null, 'sans bloc -> null');
  eq(decoderFrais(null, 'V5'), null, 'rien -> null');
  eq(decoderFrais({ blockNumber: '0x1', topics: ['0x' + 'ff'.repeat(32)], data: '0x' }, 'V5'), null,
    'un topic inconnu -> null, pas une invention');
}

// ══ 4. LA FORME DU V1, ET LE SENS DE SES DEUX MOTS ══════════════════════════════════════════════
// ⛔⛔ ERREUR CORRIGEE LE 2026-09-21. J avais lu « data[0] = frais total, data[1] = la moitie ».
//    Le rapport data[0] == 2 x data[1] tient sur 39/39 — mais il est vrai dans les DEUX lectures,
//    donc il ne prouve rien. Les SOLDES ont tranche, au wei pres : sur RNG, somme(data[0]) egale
//    le solde du wallet de frais et somme(data[1]) celui de l adresse creatrice.
//    => data[0] = part du WALLET (2/3), data[1] = part du CREATEUR (1/3).
//    Consequence : j avais annonce la part du createur en croyant annoncer celle du wallet, et
//    sous-estime de moitie ce que a6cf recoit.
{
  const bon = { blockNumber: '0x10', transactionHash: '0xbb',
    topics: [TOPIC_FRAIS_V1, '0x' + m32(1), '0x' + motAdr(OK)],
    data: '0x' + m32(1000) + m32(500) + m32(0) };
  const d = decoderFrais(bon, 'V1');
  eq(d.type, 'FRAIS_V1', 'la forme du V1 est reconnue');
  eq(d.montant, 1000n, 'le montant est la part du WALLET — c est elle qu un delta de solde confirme');
  eq(d.partCreateur, 500n, 'la part du createur est rendue A PART, pas fondue dans le montant');
  eq(d.fraisTotal, 1500n, 'et le frais TOTAL est la somme des deux — jamais data[0] seul');
  ok(d.fraisTotal > d.montant, 'le total est strictement superieur a la part du wallet');
  eq(Number(d.montant * 1000n / d.fraisTotal), 666, 'le wallet touche 66,6 % — pas 50 %');
  eq(d.devise, OK, 'la devise est le deuxieme argument indexe');
  // ⛔ TEMOIN : une forme qui ne tient pas rend null.
  const faux = { ...bon, data: '0x' + m32(1000) + m32(777) + m32(0) };
  eq(decoderFrais(faux, 'V1'), null, 'data[1] n est pas la moitie -> null, on n invente pas');
  // et l arrondi d un wei est accepte, parce qu il existe vraiment
  const impair = { ...bon, data: '0x' + m32(1001) + m32(500) + m32(0) };
  ok(decoderFrais(impair, 'V1') !== null, 'un wei d arrondi reste accepte');
}

// ══ 5. UNE FENETRE RATEE REND LE TOTAL « PLANCHER » ═════════════════════════════════════════════
// ⛔⛔ C EST LA GARDE LA PLUS IMPORTANTE DU FICHIER. Sans elle, un noeud qui tousse rend « aucun
//    encaissement » — et on conclut que le produit ne gagne rien.
{
  const logPaye = { blockNumber: '0x64', transactionHash: '0xaa',
    topics: [TOPIC_PAYE, '0x' + motAdr(A6CF), '0x' + motAdr(ETH_NATIF)], data: '0x' + m32(7) };
  const bon = await scanFrais({ rpc: async () => [logPaye], deBloc: 1, aBloc: 10, pas: 10 });
  eq(bon.complet, true, 'aucune fenetre ratee -> complet');
  eq(bon.evenements.length, 6, 'un evenement par hook surveille');
  ok(/every window/.test(bon.borne), 'et la borne le dit : ' + bon.borne);

  const boiteux = await scanFrais({ rpc: async () => { throw new Error('rate limit'); },
    deBloc: 1, aBloc: 10, pas: 10 });
  eq(boiteux.complet, false, 'une lecture qui echoue -> PAS complet');
  eq(boiteux.evenements.length, 0, 'et aucun evenement');
  ok(/FLOOR/.test(boiteux.borne), 'la borne dit PLANCHER, pas zero : ' + boiteux.borne);
  eq(boiteux.fenetresRatees, 6, 'les six fenetres ratees sont COMPTEES');

  // ⛔ une reponse qui n est pas un tableau est une fenetre ratee, pas une fenetre vide
  const pasTableau = await scanFrais({ rpc: async () => null, deBloc: 1, aBloc: 10, pas: 10 });
  eq(pasTableau.complet, false, 'une reponse non-tableau compte comme ratee');

  // ⛔ une fenetre a l envers est refusee, pas parcourue a vide
  const envers = await scanFrais({ rpc: async () => [], deBloc: 10, aBloc: 1 });
  eq(envers.complet, false, 'une fenetre a l envers est refusee');
  ok(/invalide/.test(envers.pourquoi), 'avec sa raison');
}

// ══ 6. UN EVENEMENT N EST PAS UN ENCAISSEMENT ═══════════════════════════════════════════════════
// ⛔ Le hook emet ce qu il veut. Seul le SOLDE tranche.
{
  const ev = { hook: 'V5', bloc: 100, tx: '0xaa', type: 'PAYE',
    beneficiaire: A6CF, devise: ETH_NATIF, montant: 1000n };
  const soldes = { '0x63': 5000n, '0x64': 6000n };
  const arrive = await verifierArrivee({ rpc: async (m, p) => '0x' + m32(soldes[p[1]]), evenement: ev });
  eq(arrive.etat, 'ARRIVE', 'le solde a bien monte de 1000');

  const pasBouge = await verifierArrivee({ rpc: async () => '0x' + m32(5000), evenement: ev });
  eq(pasBouge.etat, 'PAS_ARRIVE', 'un solde immobile -> PAS_ARRIVE');
  ok(/le solde a bouge de 0/.test(pasBouge.pourquoi), 'et le chiffre est dit : ' + pasBouge.pourquoi);

  // ⛔ TROIS ETATS : une lecture impossible n est NI l un NI l autre.
  const illisible = await verifierArrivee({ rpc: async () => { throw new Error('noeud KO'); }, evenement: ev });
  eq(illisible.etat, 'NON_LU', 'solde illisible -> NON_LU');
  ok(/c est nous, pas le hook/.test(illisible.pourquoi), 'et on s accuse nous, pas le contrat');

  // ⛔ ASYMETRIE VOULUE : un delta PLUS GRAND est normal (d autres tx dans le meme bloc).
  const plusGrand = { '0x63': 5000n, '0x64': 9999n };
  const large = await verifierArrivee({ rpc: async (m, p) => '0x' + m32(plusGrand[p[1]]), evenement: ev });
  eq(large.etat, 'ARRIVE', 'un delta superieur au montant reste ARRIVE — le bloc porte d autres tx');

  // ⛔ MIS_EN_ATTENTE NE DOIT PAS ATTENDRE DE DELTA : le montant reste dans le hook.
  const attente = await verifierArrivee({
    rpc: async () => '0x' + m32(5000),
    evenement: { ...ev, type: 'MIS_EN_ATTENTE' } });
  eq(attente.etat, 'ARRIVE', 'un montant mis en claims n est pas un defaut');
  ok(/claims/.test(attente.pourquoi), 'et la raison le dit : ' + attente.pourquoi);
}

// ══ 7. LE RESUME NE CACHE PAS SON INCOMPLETUDE ══════════════════════════════════════════════════
{
  const r = resumerFrais({ complet: false, evenements: [
    { devise: ETH_NATIF, montant: 10n }, { devise: ETH_NATIF, montant: 5n }, { devise: OK, montant: 3n }] });
  eq(r.evenements, 3, 'trois evenements');
  eq(r.devises.length, 2, 'deux devises');
  eq(r.devises.find((d) => d.devise === ETH_NATIF).total, 15n, 'les montants s additionnent par devise');
  eq(r.complet, false, 'et l incompletude voyage avec le resume');
  ok(/FLOOR/.test(r.borne), 'la borne aussi : ' + r.borne);
}

// ══ 8. QUAND LE BENEFICIAIRE PAIE LUI-MEME, LE SOLDE NE PEUT RIEN DIRE ═════════════════════════
// ⛔⛔ MESURE SUR LA CHAINE (2026-09-21, bloc 51527429) : une mise en vie de 379 133 982 157 954 wei
//    annoncee, et le solde du wallet qui BAISSE de 55 248 742 656 000. Lecture de la transaction :
//    le sender de la UserOperation etait le wallet de frais LUI-MEME. L argent a fait un
//    aller-retour, moins le gas. Aucun delta ne pourra jamais confirmer ce cas.
// ⛔ UNE FAUSSE ALERTE COUTE PLUS CHER QU UN TROU : on apprend a ignorer le rouge. Ce cas a donc
//    son etat a lui, et surtout PAS celui des vrais defauts.
{
  const AUTRE = '0x' + 'cc'.repeat(20);
  const ev = { hook: 'V2', bloc: 100, tx: '0xdead', type: 'MISE_EN_VIE',
    beneficiaire: null, devise: ETH_NATIF, montant: 1000n };

  /* une chaine ou le solde BAISSE, et ou le payeur est configurable */
  const chaine = (payeur, viaUserOp) => async (m, p2) => {
    if (m === 'eth_getBalance') return '0x' + m32(p2[1] === '0x63' ? 5000 : 4000);
    if (m === 'eth_getTransactionReceipt') {
      return viaUserOp
        ? { logs: [{ topics: ['0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f',
            '0x' + m32(1), '0x' + motAdr(payeur)], data: '0x' }] }
        : { logs: [] };
    }
    if (m === 'eth_getTransactionByHash') return { from: viaUserOp ? AUTRE : payeur };
    throw new Error('appel non simule : ' + m);
  };

  /* ⛔ LE CAS MESURE : ERC-4337, le `from` est le bundler, le VRAI payeur est le sender. */
  const parUserOp = await verifierArrivee({ rpc: chaine(A6CF, true), evenement: ev, wallet: A6CF });
  eq(parUserOp.etat, 'NON_CONCLUANT', 'ERC-4337 : le beneficiaire a paye lui-meme -> NON_CONCLUANT');
  eq(parUserOp.payeur, A6CF, 'et le payeur lu est bien le sender de la UserOperation');
  ok(/aller-retour/.test(parUserOp.pourquoi), 'avec sa raison : ' + parUserOp.pourquoi);

  /* le meme cas sans ERC-4337, en transaction ordinaire */
  const ordinaire = await verifierArrivee({ rpc: chaine(A6CF, false), evenement: ev, wallet: A6CF });
  eq(ordinaire.etat, 'NON_CONCLUANT', 'tx ordinaire : payeur = beneficiaire -> NON_CONCLUANT');

  /* ⛔⛔ LE TEMOIN QUI DONNE SA VALEUR AUX DEUX PRECEDENTS : si QUELQU UN D AUTRE a paye et que le
     solde n a pas bouge, c est un VRAI defaut et il doit rester rouge. Sans ce cas, une branche
     qui rendrait toujours NON_CONCLUANT eteindrait toutes les alertes. */
  const tiers = await verifierArrivee({ rpc: chaine(AUTRE, true), evenement: ev, wallet: A6CF });
  eq(tiers.etat, 'PAS_ARRIVE', 'un tiers a paye et rien n est arrive -> le defaut reste rouge');

  /* ⛔ ET « JE NE SAIS PAS QUI A PAYE » N EXCUSE RIEN : on n eteint pas une alerte sur une ignorance. */
  const payeurInconnu = async (m, p2) => {
    if (m === 'eth_getBalance') return '0x' + m32(p2[1] === '0x63' ? 5000 : 4000);
    throw new Error('transaction illisible');
  };
  const inconnu = await verifierArrivee({ rpc: payeurInconnu, evenement: ev, wallet: A6CF });
  eq(inconnu.etat, 'PAS_ARRIVE', 'payeur illisible -> on N EXCUSE PAS, l alerte reste');

  eq(ETATS_ARRIVEE.length, 4, 'quatre etats, pas trois');
  for (const e of ['ARRIVE', 'PAS_ARRIVE', 'NON_CONCLUANT', 'NON_LU']) {
    ok(ETATS_ARRIVEE.includes(e), e + ' est un etat declare');
  }

  /* ⛔ payeurDe rend null quand il ne peut pas lire — « je ne sais pas » n est pas « pas lui ». */
  eq(await payeurDe({ rpc: async () => { throw new Error('KO'); }, tx: '0x1' }), null,
    'lecture impossible -> null');
  eq(await payeurDe({ rpc: async () => null, tx: '0x1' }), null, 'reponse vide -> null');
}

console.log('test-veille-frais : ' + n + ' assertions, OK');
