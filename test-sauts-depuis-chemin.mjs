/* DU CHEMIN AUX SAUTS — et surtout ce qui doit REFUSER plutot que de bricoler.
 *
 * ⛔ LA PROPRIETE LA PLUS IMPORTANTE DU FICHIER : un saut non resolu refuse TOUTE la route, et dit
 *   LEQUEL. Une route partielle produirait un calldata qui s arrete au milieu — l utilisateur
 *   signerait un echange qui ne finit pas la ou il croit.
 */
import { sautsDepuisChemin, SAUTS_MAX, ETATS } from './sauts-depuis-chemin.js';

let ok = 0; const ko = [];
const t = (nom, cond) => { if (cond) ok += 1; else ko.push(nom); };

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const C = '0x00000000000000000000000000000000000000cc';
const D = '0x00000000000000000000000000000000000000dd';
const V4 = 'uniswap-v4';
const cleFictive = (de, vers) => ({ currency0: de < vers ? de : vers, currency1: de < vers ? vers : de,
  fee: 100, tickSpacing: 1, hooks: '0x0000000000000000000000000000000000000000' });

/** Un resolveur de laboratoire : il note ce qu on lui demande, et rend un devis x2 par saut. */
function resolveurQui({ echoueAu = null, etatEchec = 'NON_MESURE', sansDirection = false,
  devis = (m) => m * 2n } = {}) {
  const vus = [];
  const f = async ({ de, vers, montant }) => {
    vus.push({ de, vers, montant });
    if (echoueAu === vus.length) {
      return { etat: etatEchec, cle: null, zeroForOne: null, quote: null, pourquoi: 'rien a cet endroit' };
    }
    return { etat: 'OK', cle: cleFictive(de, vers),
      zeroForOne: sansDirection ? null : String(cleFictive(de, vers).currency0) === String(de),
      quote: devis(montant), pourquoi: null };
  };
  f.vus = vus;
  return f;
}

const chemin3 = [
  { de: A, vers: B, famille: V4 },
  { de: B, vers: C, famille: V4 },
  { de: C, vers: D, famille: V4 },
];

/* ══ 1. LE CAS QUI MARCHE ═════════════════════════════════════════════════════════════════════ */
const r = await sautsDepuisChemin({ chemin: chemin3, montant: 100n, resoudre: resolveurQui() });
t('trois sauts resolus', r.etat === 'OK' && r.sauts.length === 3);
t('chaque saut porte une cle et une direction',
  r.sauts.every((s) => s.cle && typeof s.zeroForOne === 'boolean'));
t('resolus compte les sauts', r.resolus === 3);
t('une sortie estimee est rendue', r.sortieEstimee === 800n);
t('l etat est connu', ETATS.includes(r.etat));

/* ⛔⛔ LE DEVIS D UN SAUT DIMENSIONNE LE SUIVANT. Sans ca, la pool du saut 2 serait choisie sur le
 *   montant du saut 1 — une taille qui n a rien a voir des que les decimales different. */
const suivi = resolveurQui();
await sautsDepuisChemin({ chemin: chemin3, montant: 100n, resoudre: suivi });
t('le saut 1 est resolu sur le montant d entree', suivi.vus[0].montant === 100n);
t('le saut 2 est resolu sur le DEVIS du saut 1', suivi.vus[1].montant === 200n);
t('le saut 3 sur le devis du saut 2', suivi.vus[2].montant === 400n);
t('les jetons demandes suivent le chemin',
  suivi.vus[0].de === A && suivi.vus[1].de === B && suivi.vus[2].vers === D);

/* ══ 2. UN SAUT MANQUANT REFUSE TOUT, ET DIT LEQUEL ═══════════════════════════════════════════ */
const r2 = await sautsDepuisChemin({ chemin: chemin3, montant: 100n,
  resoudre: resolveurQui({ echoueAu: 2 }) });
t('un saut non resolu refuse TOUTE la route', r2.sauts === null);
t('et l etat NON_MESURE du resolveur est PROPAGE, pas traduit', r2.etat === 'NON_MESURE');
t('et le NUMERO du saut est dit', /hop 2\b/.test(r2.pourquoi));
t('et la raison du resolveur est reprise', /rien a cet endroit/.test(r2.pourquoi));
t('et on sait combien avaient abouti', r2.resolus === 1);
/* ⛔ LES DEUX ETATS DU RESOLVEUR NE SE FONDENT PAS. */
const r3 = await sautsDepuisChemin({ chemin: chemin3, montant: 100n,
  resoudre: resolveurQui({ echoueAu: 2, etatEchec: 'REFUSE' }) });
t('un REFUSE du resolveur reste REFUSE', r3.etat === 'REFUSE');
t('REFUSE et NON_MESURE DIFFERENT', r2.etat !== r3.etat);
/* ⛔ ON N APPELLE PAS LES SAUTS SUIVANTS APRES UN ECHEC : du reseau depense pour rien. */
const apres = resolveurQui({ echoueAu: 2 });
await sautsDepuisChemin({ chemin: chemin3, montant: 100n, resoudre: apres });
t('aucun appel apres le saut qui echoue', apres.vus.length === 2);

/* ══ 3. UNE DIRECTION NE SE DEVINE JAMAIS ═════════════════════════════════════════════════════ */
const r4 = await sautsDepuisChemin({ chemin: chemin3, montant: 100n,
  resoudre: resolveurQui({ sansDirection: true }) });
t('pas de direction => REFUSE', r4.etat === 'REFUSE' && r4.sauts === null);
t('et la raison dit qu une direction ne se devine pas', /never guessed|direction/i.test(r4.pourquoi));

/* ══ 4. UN DEVIS NUL EN MILIEU DE ROUTE NE SE CONTOURNE PAS ═══════════════════════════════════ */
const r5 = await sautsDepuisChemin({ chemin: chemin3, montant: 100n,
  resoudre: resolveurQui({ devis: () => 0n }) });
t('devis nul au milieu => NON_MESURE', r5.etat === 'NON_MESURE');
t('et la raison dit que le saut suivant serait dimensionne sur rien',
  /made up|no usable quote/i.test(r5.pourquoi));
/* ⛔ MAIS UN DEVIS NUL AU DERNIER SAUT NE CASSE PAS LA ROUTE : plus rien n en depend ensuite, et
 *   c est `planEchangeMultiSauts` qui recote de toute facon. Refuser la serait une garde trop
 *   large — elle tuerait une route franchissable sur une estimation dont on ne se sert plus. */
let appel = 0;
const r6 = await sautsDepuisChemin({ chemin: chemin3, montant: 100n,
  resoudre: resolveurQui({ devis: (m) => { appel += 1; return appel === 3 ? 0n : m * 2n; } }) });
t('un devis nul au DERNIER saut ne casse pas la route', r6.etat === 'OK' && r6.sauts.length === 3);
t('et la sortie estimee devient null plutot que zero', r6.sortieEstimee === null);

/* ══ 5. LES REFUS D ENTREE, ET AUCUN APPEL DEPENSE ════════════════════════════════════════════ */
const cas = [
  ['chemin vide', { chemin: [], montant: 100n }],
  ['pas de chemin', { montant: 100n }],
  ['montant nul', { chemin: chemin3, montant: 0n }],
  ['montant negatif', { chemin: chemin3, montant: -5n }],
  ['trop de sauts', { chemin: [...chemin3, { de: D, vers: A, famille: V4 }, { de: A, vers: B, famille: V4 }], montant: 100n }],
  ['chemin troue', { chemin: [{ de: A, vers: B, famille: V4 }, { de: C, vers: D, famille: V4 }], montant: 100n }],
  ['famille aerodrome', { chemin: [{ de: A, vers: B, famille: 'aerodrome' }], montant: 100n }],
  ['familles melangees', { chemin: [{ de: A, vers: B, famille: V4 }, { de: B, vers: C, famille: 'aerodrome' }], montant: 100n }],
];
for (const [nom, args] of cas) {
  const sonde = resolveurQui();
  const x = await sautsDepuisChemin({ ...args, resoudre: sonde });
  t('refus: ' + nom, x.etat === 'REFUSE' && x.sauts === null
    && typeof x.pourquoi === 'string' && x.pourquoi.length > 10);
  /* ⛔ UN REFUS D ENTREE NE DEPENSE AUCUN APPEL : sur un noeud limite, une saisie fautive volerait
   *   la fenetre d une vraie lecture. */
  t('refus sans reseau: ' + nom, sonde.vus.length === 0);
}
t('chemin troue : le refus dit OU', /hop 2 does not start where hop 1 ends/
  .test((await sautsDepuisChemin({ chemin: [{ de: A, vers: B, famille: V4 }, { de: C, vers: D, famille: V4 }], montant: 100n, resoudre: resolveurQui() })).pourquoi));
t('familles melangees : le refus NOMME les familles',
  /uniswap-v4 then aerodrome/
    .test((await sautsDepuisChemin({ chemin: [{ de: A, vers: B, famille: V4 }, { de: B, vers: C, famille: 'aerodrome' }], montant: 100n, resoudre: resolveurQui() })).pourquoi));
t('sans resolveur => REFUSE',
  (await sautsDepuisChemin({ chemin: chemin3, montant: 100n })).etat === 'REFUSE');
t('SAUTS_MAX vaut 4, comme l assembleur', SAUTS_MAX === 4);

/* ══ 6. UN SEUL SAUT EST UNE ROUTE VALIDE ═════════════════════════════════════════════════════ */
const un = await sautsDepuisChemin({ chemin: [{ de: A, vers: B, famille: V4 }], montant: 100n,
  resoudre: resolveurQui() });
t('un seul saut suffit', un.etat === 'OK' && un.sauts.length === 1);
t('et sa sortie estimee est son devis', un.sortieEstimee === 200n);

console.log((ko.length ? 'KO ' + ko.length : 'OK') + ' — ' + ok + ' assertions');
for (const k of ko) console.log('  KO ' + k);
process.exit(ko.length ? 1 : 0);
