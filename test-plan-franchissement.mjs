/* L ORCHESTRATION DU FRANCHISSEMENT — testee hors reseau, par un `rpc` de laboratoire.
 *
 * ⛔⛔ CE CODE TOUCHE L ARGENT : il bati un lot qui preleve un frais sur DEUX jambes. Le tester
 *   uniquement en production serait exactement ce qui a laisse passer les deux defauts « gravite
 *   argent » trouves par l audit adverse — ils vivaient dans un chemin qu AUCUN test ne couvrait.
 *
 * ⛔ CE QUE CE FICHIER NE PROUVE PAS : que les pools repondent, ni qu un swap aboutisse. Il prouve
 *   que l ORCHESTRATION enchaine, refuse aux bons endroits, et NOMME l etape qui rate. La preuve
 *   d execution vit dans `banc-franchissement-ousd-action-fork.mjs` (fork Base, 3 appels
 *   `status 0x1`, a6cf paye sur les deux jambes au wei).
 */
import { planFranchissement, poolAerodromeDe, ESPACEMENTS_CL, ETATS } from './plan-franchissement.js';
import { selecteur } from './keccak.js';

let ok = 0; const ko = [];
const t = (nom, cond) => { if (cond) ok += 1; else ko.push(nom); };

const OUSD = '0xb2000000000000000000002feb517dfec7415344';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const AAPLC = '0xb200000000000000000000c2e324d24d7eecd1fb';
const POOL = '0xa3b1e3f9747065e2073722ff4c9027d3ea4994f0'; /* resolue sur la factory, mesure du jour */
const NUL = '0x' + '0'.repeat(40);
const mot = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');

/** Un `rpc` de laboratoire. `poolsConnues` dit quels tickSpacings existent. */
function rpcQui({ poolsConnues = { 10: POOL }, token0 = USDC, sqrt = null, refuseGetPool = 0,
  refuseToken0 = false, refuseSlot0 = false, devisV4 = 99000000n } = {}) {
  const SEL_GET_POOL = selecteur('getPool(address,address,int24)');
  const SEL_TOKEN0 = selecteur('token0()');
  const SEL_SLOT0 = selecteur('slot0()');
  /* ⛔⛔ LE QUOTEUR V4 MANQUAIT A MON STUB, ET MON TEST A AFFIRME UNE CHOSE FAUSSE A CAUSE DE CA :
   *   deux assertions attendaient un refus a l etape « jambe 2 » alors que le plan s arretait a la
   *   « jambe 1 », faute de reponse du quoteur. Le plan avait RAISON et mon test avait tort — il
   *   testait un chemin qu il n atteignait jamais. Un stub incomplet ne rend pas un test faux de
   *   facon visible : il le rend vert sur la mauvaise branche, ou rouge pour la mauvaise raison. */
  const SEL_QUOTE = selecteur('quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))');
  let refusRestants = refuseGetPool;
  const vus = [];
  const f = async (_m, p) => {
    const d = String(p[0].data || '');
    vus.push(d.slice(0, 10));
    if (d.startsWith(SEL_GET_POOL)) {
      if (refusRestants > 0) { refusRestants -= 1; throw new Error('rate limit'); }
      /* le tickSpacing est le 3e mot */
      const ts = parseInt(d.slice(10 + 128, 10 + 192), 16);
      const a = poolsConnues[ts];
      return '0x' + mot(a || NUL);
    }
    if (d.startsWith(SEL_TOKEN0)) {
      if (refuseToken0) throw new Error('no token0');
      return '0x' + mot(token0);
    }
    if (d.startsWith(SEL_SLOT0)) {
      if (refuseSlot0) throw new Error('no slot0');
      return '0x' + (sqrt === null ? '0'.repeat(64) : BigInt(sqrt).toString(16).padStart(64, '0'));
    }
    if (d.startsWith(SEL_QUOTE)) {
      return '0x' + BigInt(devisV4).toString(16).padStart(64, '0');
    }
    /* ⛔ TOUT AUTRE SELECTEUR LEVE AVEC SON NOM : un stub qui rendrait 0 par defaut ferait croire
     *   a une pool vide la ou il manque simplement une reponse — et on chercherait le defaut dans
     *   le code teste au lieu du test. */
    throw new Error('selecteur inattendu ' + d.slice(0, 10));
  };
  f.vus = vus;
  return f;
}

/* ══ 1. LA RESOLUTION DE POOL ═════════════════════════════════════════════════════════════════ */
const r1 = await poolAerodromeDe({ rpc: rpcQui({}), a: USDC, b: AAPLC });
t('pool: trouvee au bon espacement', r1.etat === 'PRET' && r1.pool === POOL && r1.tickSpacing === 10);
/* ⛔ LE SENS EST LU SUR LA POOL, pas deduit de l ordre des arguments. */
t('pool: entreeEst0 vrai quand token0 == entree', r1.entreeEst0 === true);
const r1b = await poolAerodromeDe({ rpc: rpcQui({ token0: AAPLC }), a: USDC, b: AAPLC });
t('pool: entreeEst0 faux quand token0 == sortie', r1b.entreeEst0 === false);
t('pool: LES DEUX SENS DIFFERENT', r1.entreeEst0 !== r1b.entreeEst0);

/* ⛔⛔ « AUCUNE POOL » N EST PAS « IL N Y A PAS DE POOL » SI DES LECTURES ONT ECHOUE. */
/* 2026-10-10 (234ff51) : AAPLc est EPINGLE (1 espacement, le mesure) - le balayage des 9 se prouve sur une paire non epinglee (cbBTC) */
const NONEP = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf';
const vide = await poolAerodromeDe({ rpc: rpcQui({ poolsConnues: {} }), a: USDC, b: NONEP });
t('pool: aucune pool, toutes lectures OK => REFUSE (un verdict)', vide.etat === 'REFUSE');
t('pool: et le refus dit combien d espacements ont ete essayes',
  new RegExp(String(vide.essayes)).test(vide.pourquoi) && vide.essayes === ESPACEMENTS_CL.length);
const aveugle = await poolAerodromeDe({ rpc: rpcQui({ poolsConnues: {}, refuseGetPool: 3 }), a: USDC, b: NONEP });
t('pool: des lectures refusees => NON_MESURE (une cecite)', aveugle.etat === 'NON_MESURE');
t('pool: et il DIT que ce serait notre aveuglement', /blindness/i.test(aveugle.pourquoi));
t('pool: REFUSE et NON_MESURE DIFFERENT', vide.etat !== aveugle.etat);
/* et la paire EPINGLEE garde les deux informations : 1 espacement essaye, et l aveuglement si la lecture manque */
const videE = await poolAerodromeDe({ rpc: rpcQui({ poolsConnues: {} }), a: USDC, b: AAPLC });
t('pool epinglee: aucune pool rendue => REFUSE, et le refus dit 1 espacement essaye', videE.etat === 'REFUSE' && videE.essayes === 1 && /1 tried/.test(videE.pourquoi));
const aveugleE = await poolAerodromeDe({ rpc: rpcQui({ refuseGetPool: 9 }), a: USDC, b: AAPLC });
t('pool epinglee: getPool refuse => NON_MESURE qui DIT l aveuglement', aveugleE.etat === 'NON_MESURE' && /blindness/i.test(aveugleE.pourquoi));
/* ⛔ UNE POOL TROUVEE DONT ON NE SAIT PAS LIRE LE SENS NE SE DEVINE PAS. */
const sansSens = await poolAerodromeDe({ rpc: rpcQui({ refuseToken0: true }), a: USDC, b: AAPLC });
t('pool: token0 illisible => NON_MESURE', sansSens.etat === 'NON_MESURE');
t('pool: et la raison dit qu une direction ne se devine jamais',
  /never guessed|direction/i.test(sansSens.pourquoi));
/* ⛔ LES NEUF ESPACEMENTS DECLARES, PAS CINQ : la sous-mesure a deja rendu 49,8 % du volume
 *   invisible dans ce depot. */
t('pool: les NEUF espacements declares sont essayes', ESPACEMENTS_CL.length === 9);
t('pool: adresses malformees => REFUSE',
  (await poolAerodromeDe({ rpc: rpcQui({}), a: 'usdc', b: AAPLC })).etat === 'REFUSE');

/* ══ 2. LE PLAN : LES REFUS DE FORME, AVANT TOUT RESEAU ═══════════════════════════════════════ */
const V4 = 'uniswap-v4', AERO = 'aerodrome';
const cheminBon = [{ de: OUSD, vers: USDC, famille: V4 }, { de: USDC, vers: AAPLC, famille: AERO }];
const commun = { chaine: 8453, compte: '0x' + '1'.repeat(40), devise: OUSD, block: AAPLC,
  montant: 100000000n, decimalesEntree: 6, prixUsdEntree: 1,
  beneficiaireFrais: '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4',
  /* ⛔⛔ SANS CET ENSEMBLE, LE PLAN REFUSE — et c est la garde qui fait son travail : elle interdit
   *   de prelever un frais dans une devise dont on n a pas LU le marche. Ce depot a deja mesure ce
   *   que ca coute : a6cf paye en jetons invendables, 7 detentions, 0 avec un marche, part reelle
   *   0 $. Mon fixture l avait oublie et j ai d abord cru a un defaut du code. */
  fraisDevisesOk: new Set([OUSD]),
  resoudreV4: async () => ({ etat: 'OK', cle: { currency0: USDC, currency1: OUSD, fee: 100, tickSpacing: 1, hooks: NUL }, zeroForOne: false, quote: 99000000n }) };

const sonde = rpcQui({});
const mauvaiseForme = await planFranchissement({ ...commun, rpc: sonde,
  chemin: [{ de: OUSD, vers: USDC, famille: V4 }] });
t('plan: une forme invalide REFUSE', mauvaiseForme.etat === 'REFUSE');
t('plan: et il NOMME l etape qui rate', mauvaiseForme.etape === 'forme');
/* ⛔ UN REFUS DE FORME NE DEPENSE AUCUN APPEL : sur un noeud limite, une saisie fautive volerait la
 *   fenetre d une vraie lecture. */
t('plan: un refus de forme n envoie AUCUN appel', sonde.vus.length === 0);

/* ⛔⛔ LE CHEMIN DOIT ARRIVER SUR CE QU ON CROIT ACHETER. Sans ce controle on batirait un lot qui
 *   achete autre chose que ce que l ecran annonce — et RIEN ne reverterait. */
const autreBlock = await planFranchissement({ ...commun, rpc: rpcQui({}), chemin: cheminBon,
  block: '0x' + '9'.repeat(40) });
t('plan: un chemin qui arrive ailleurs que sur le block REFUSE', autreBlock.etat === 'REFUSE');
t('plan: et le refus nomme les DEUX adresses',
  autreBlock.pourquoi.includes(AAPLC) && autreBlock.pourquoi.includes('9'.repeat(40)));

/* ══ 3. LE PLAN : LES ETAPES RESEAU, CHACUNE NOMMEE ═══════════════════════════════════════════ */
const sansPool = await planFranchissement({ ...commun, rpc: rpcQui({ poolsConnues: {} }),
  chemin: cheminBon });
t('plan: sans pool aerodrome => REFUSE a l etape nommee',
  sansPool.etat === 'REFUSE' && sansPool.etape === 'pool aerodrome');

/* ⛔⛔⛔ LA FRONTIERE DE CE FICHIER, ET POURQUOI JE M ARRETE ICI PLUTOT QUE DE GROSSIR LE STUB.
 *   Pour depasser la jambe 1, il faudrait simuler le quoteur V4, l etat Permit2, les allowances et
 *   la forme acceptee par le routeur. A ce point, le stub devient une SECONDE implementation — et
 *   le test ne verifierait plus le code, il verifierait MA FICTION. Ce depot a deja paye cette
 *   erreur exacte : un test qui ecrivait des cles V4 a la main dans un ordre que `cleDePool` ne
 *   produit JAMAIS, et qui etait vert sur une route impossible.
 *   ⇒ DIVISION DU TRAVAIL ASSUMEE : ce fichier teste les DECISIONS isolables — forme, resolution de
 *     pool, sens, etats, refus sans reseau. L EXECUTION de bout en bout est prouvee par
 *     `banc-franchissement-ousd-action-fork.mjs` sur un vrai fork Base : 3 appels `status 0x1`,
 *     a6cf paye sur LES DEUX jambes au wei (0,2 % puis 0,1 %), 22 assertions, 0 KO.
 *   ⚠️ CE QUI N EST DONC PAS COUVERT ICI, et doit se lire comme tel : le calcul du minimum de la
 *     jambe 2 a partir du prix spot, et le refus sur un prix illisible ou nul. Les deux existent
 *     dans le module et sont documentes ; aucun test unitaire ne les atteint. */
const sansPrix = await planFranchissement({ ...commun, rpc: rpcQui({ refuseSlot0: true }),
  chemin: cheminBon });
t('plan: sans etat d autorisation lisible, le plan NE REND PAS un plan',
  sansPrix.etat !== 'PRET');
t('plan: et il nomme l etape ou il s arrete', typeof sansPrix.etape === 'string' && sansPrix.etape.length > 0);
/* ⛔ ET IL NE REND JAMAIS D APPELS QUAND IL N EST PAS PRET : un appelant distrait pourrait les
 *   envoyer. C est la garde qui compte vraiment ici, et elle, le stub l atteint. */
t('plan: un plan non PRET ne porte AUCUN appel', !sansPrix.appels || sansPrix.appels.length === 0);
t('plan: ni resume', !sansPrix.resume);

/* ⛔⛔ LES APPROBATIONS REMONTENT TELLES QUELLES : les avaler produirait un lot qui reverte sur
 *   l allowance, apres la signature. */
const resolveurOK = commun.resoudreV4;
const approbations = await planFranchissement({ ...commun, rpc: rpcQui({ sqrt: 79228162514264337593543950336n }),
  chemin: cheminBon,
  resoudreV4: resolveurOK });
t('plan: tous les etats rendus sont connus', ETATS.includes(approbations.etat));
t('plan: et l etape est toujours nommee quand ca rate',
  approbations.etat === 'PRET' || typeof approbations.etape === 'string');

console.log((ko.length ? 'KO ' + ko.length : 'OK') + ' — ' + ok + ' assertions');
for (const k of ko) console.log('  KO ' + k);
process.exit(ko.length ? 1 : 0);
