/* UN SEGMENT AERODROME EN UNE TRANSACTION — teste hors reseau, par un `rpc` de laboratoire.
 *
 * ⭐⭐ CE MODULE EXISTE PARCE QU UNE MESURE A RENVERSE UNE DECISION QUE J AVAIS DEJA PRISE.
 *   J avais renonce a l ecrire : sur toutes les paires (devise x block), il ne debloquait que
 *   1,2 %. Mais mesure depuis les DEUX devises que les gens detiennent reellement :
 *       depuis OUSD   245/245 marches offerts   100 % du volume
 *       depuis USDC   236/245 offerts  mais      23,1 % du volume
 *   Les NEUF non batis depuis USDC sont AAPLc, METAc, GOOGLc, AMZNc, SNDKc... et ils portent
 *   76,9 % du volume. « 1,2 % des paires » et « 76,9 % du volume depuis USDC » decrivent le MEME
 *   trou : moyenner sur des paires que personne ne fait avait noye le chemin que tout le monde
 *   prend.
 *
 * ⛔ ET CE RAIL N EXIGE PAS L ATOMICITE : deux appels, dont le second seul fait le swap. Une
 *   approbation qui passe seule ne coute que du gaz et ne laisse l acheteur avec rien d inattendu.
 *   C est ce qui le rend accessible aux wallets qui ne groupent pas — contrairement au
 *   franchissement.
 */
import { planAerodromeSegment, SAUTS_MAX, ETATS } from './plan-aerodrome-segment.js';
import { FRAIS_INTERFACE_BPS_CL, ROUTEUR_AERODROME_CL } from './calldata-aerodrome.js';
import { selecteur } from './keccak.js';

let ok = 0; const ko = [];
const t = (nom, cond) => { if (cond) ok += 1; else ko.push(nom); };

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const AAPLC = '0xb200000000000000000000c2e324d24d7eecd1fb';
const ETH = '0x4200000000000000000000000000000000000006';
const POOL = '0xa3b1e3f9747065e2073722ff4c9027d3ea4994f0';
const NUL = '0x' + '0'.repeat(40);
const FEE = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const COMPTE = '0x' + '1'.repeat(40);
const mot = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const UN_POUR_UN = 79228162514264337593543950336n;

function rpcQui({ ts = 10, token0 = USDC, sqrt = UN_POUR_UN, refuseSlot0 = false,
  poolNulle = false } = {}) {
  const GP = selecteur('getPool(address,address,int24)');
  const T0 = selecteur('token0()');
  const S0 = selecteur('slot0()');
  return async (_m, p) => {
    if (_m === 'eth_simulateV1') return [{ calls: p[0].blockStateCalls[0].calls.map(() => ({ status: '0x1' })) }]; /* 2026-10-10 (e0b346d) : le segment simule son plan ; ce faux noeud dit que la simulation passe */
    const d = String(p[0].data || '');
    if (d.startsWith(GP)) {
      if (poolNulle) return '0x' + mot(NUL);
      const vu = parseInt(d.slice(10 + 128, 10 + 192), 16);
      return '0x' + mot(vu === ts ? POOL : NUL);
    }
    if (d.startsWith(T0)) return '0x' + mot(token0);
    if (d.startsWith(S0)) {
      if (refuseSlot0) throw new Error('no slot0');
      return '0x' + BigInt(sqrt).toString(16).padStart(64, '0');
    }
    throw new Error('selecteur inattendu ' + d.slice(0, 10));
  };
}

const AERO = 'aerodrome';
const commun = { devise: USDC, block: AAPLC, montant: 1000000000n, compte: COMPTE,
  beneficiaireFrais: FEE };
const cheminUn = [{ de: USDC, vers: AAPLC, famille: AERO }];

/* ══ 1. LE CAS DE LA MISSION : USDC -> AAPLc, UN SAUT, UNE TRANSACTION ════════════════════════ */
const r = await planAerodromeSegment({ ...commun, rpc: rpcQui({}), chemin: cheminUn });
t('USDC -> AAPLc est PRET', r.etat === 'PRET', r.pourquoi);
t('l etat est connu', ETATS.includes(r.etat));
t('DEUX appels : approbation puis swap', r.appels.length === 2);
t('le premier porte sur le JETON paye, pas sur le routeur', r.appels[0].to === USDC.toLowerCase());
t('le second vise le routeur Aerodrome',
  r.appels[1].to.toLowerCase() === ROUTEUR_AERODROME_CL.toLowerCase());
/* ⛔⛔ CE RAIL N EXIGE PAS L ATOMICITE, et c est tout son interet : une part importante des wallets
 *   ne sait pas grouper, et le franchissement leur est ferme. Celui-ci ne l est pas. */
t('⛔ il n EXIGE PAS l atomicite', r.exigeAtomique === false);

/* ══ 2. LE FRAIS, DANS LES OCTETS ═════════════════════════════════════════════════════════════ */
const octets = String(r.appels[1].data).toLowerCase();
t('le beneficiaire est NOMME dans le calldata du swap',
  octets.includes(String(FEE).replace(/^0x/, '').toLowerCase()));
t('et le taux est celui du module', r.resume.fraisBps === FRAIS_INTERFACE_BPS_CL);
/* ⛔⛔ DEUX MINIMUMS, DEUX NOMS, ET ILS DIFFERENT : `minPools` sort des pools, `recoitAuMoins`
 *   arrive chez l acheteur APRES notre retenue. L egalite signifierait que rien n est preleve. */
t('⛔ ce que recoit l acheteur est STRICTEMENT inferieur au minimum des pools',
  r.resume.recoitAuMoins < r.resume.minPools);
t('et la retenue vaut exactement le taux annonce, au wei',
  r.resume.recoitAuMoins === (r.resume.minPools * (10000n - FRAIS_INTERFACE_BPS_CL)) / 10000n);
/* ⛔ SANS BENEFICIAIRE : REFUSE. Aucun defaut — un frais qui part « quelque part » est pire qu un
 *   frais absent. */
const sansBenef = await planAerodromeSegment({ ...commun, beneficiaireFrais: undefined,
  rpc: rpcQui({}), chemin: cheminUn });
t('⛔ sans beneficiaire => REFUSE', sansBenef.etat === 'REFUSE');

/* ══ 3. L ESPACEMENT N EST JAMAIS SUPPOSE ═════════════════════════════════════════════════════ */
/* ⛔⛔ MESURE DU 2026-09-28 : il vaut 10 sur SEPT pools d actions et 1 sur CINQ autres. On verifie
 *   que le module TROUVE l espacement reel au lieu d en prendre un par defaut. */
/* ⛔⛔⛔ UNE MUTATION A SURVECU ICI, ET ELLE M A MONTRE QUE JE NE TESTAIS RIEN. En codant
 *   `tickSpacing: 10` EN DUR dans le module, le test restait VERT : mes cas ts=1 et ts=2000 ne
 *   verifiaient que `etat === 'PRET'`, jamais l espacement REELLEMENT utilise. Je testais que ca
 *   ne plantait pas, pas que ca visait la bonne pool — alors que c est tout l objet de ce module.
 *   ⇒ Mesure du 2026-09-28 qui donne son poids au cas : l espacement vaut 10 sur SEPT pools
 *     d actions et 1 sur CINQ autres. Un « 10 » en dur construirait un calldata vers une pool
 *     INEXISTANTE pour cinq actions sur douze, et ca reverterait APRES la signature.
 *   ⇒ ON VERIFIE DONC L ESPACEMENT DANS LES OCTETS DU SWAP, pas l etat du plan. */
/* 2026-10-10 (234ff51) : AAPLc est desormais EPINGLE sur sa pool mesuree (ts 10) - la decouverte d espacement se prouve sur une
 *   paire NON epinglee (USDC/cbBTC), avec les MEMES trois espacements. */
const NONEP = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf';
const cheminX = [{ de: USDC, vers: NONEP, famille: AERO }], communX = { ...commun, block: NONEP };
const ts10 = await planAerodromeSegment({ ...communX, rpc: rpcQui({ ts: 10 }), chemin: cheminX });
t('une pool a tickSpacing 10 est trouvee (paire non epinglee)', ts10.etat === 'PRET');
const ts1 = await planAerodromeSegment({ ...communX, rpc: rpcQui({ ts: 1 }), chemin: cheminX });
t('une pool a tickSpacing 1 est trouvee', ts1.etat === 'PRET');
const ts2000 = await planAerodromeSegment({ ...communX, rpc: rpcQui({ ts: 2000 }), chemin: cheminX });
t('une pool a tickSpacing 2000 est trouvee', ts2000.etat === 'PRET');
/* L espacement est encode en int24 dans le chemin du swap : on le cherche dans les octets. */
/* ⛔ CHERCHER UNE SOUS-CHAINE HEXA EST TROP CRU : « 00000a » apparait par hasard dans un calldata
 *   long, et ma premiere version a rougi pour ca. Ce qui PROUVE que l espacement entre dans le
 *   calldata, c est que TROIS espacements differents donnent TROIS calldata differents — et que les
 *   plans portent bien l espacement resolu, pas une valeur fixe. */
t('⛔ trois espacements donnent trois calldata DIFFERENTS',
  new Set([ts10.appels[1].data, ts1.appels[1].data, ts2000.appels[1].data]).size === 3);
t('⛔ et un espacement en dur rendrait ces trois calldata identiques',
  ts10.appels[1].data !== ts1.appels[1].data);
/* ⛔ ET SI LA FACTORY NE CONNAIT AUCUNE POOL : REFUSE, pas un calldata vers le vide. */
const aucune = await planAerodromeSegment({ ...commun, rpc: rpcQui({ poolNulle: true }), chemin: cheminUn });
t('aucune pool => REFUSE', aucune.etat === 'REFUSE');
t('et le refus NOMME le saut', /hop 1/.test(aucune.etape + ' ' + aucune.pourquoi));

/* ══ 4. CE QUI DOIT REFUSER AVANT TOUT RESEAU ═════════════════════════════════════════════════ */
const cas = [
  ['chemin vide', { chemin: [] }],
  ['segment uniswap', { chemin: [{ de: USDC, vers: AAPLC, famille: 'uniswap-v4' }] }],
  ['deux familles', { chemin: [{ de: USDC, vers: ETH, famille: AERO }, { de: ETH, vers: AAPLC, famille: 'uniswap-v4' }] }],
  ['montant nul', { chemin: cheminUn, montant: 0n }],
  ['n arrive pas sur le block', { chemin: [{ de: USDC, vers: ETH, famille: AERO }] }],
  ['ne part pas de la devise', { chemin: [{ de: ETH, vers: AAPLC, famille: AERO }] }],
  /* ⛔⛔ CE CAS ETAIT INUTILE ET UNE MUTATION L A DIT : mon chemin « trop long » repetait le MEME
   *   saut, donc il echouait de toute facon sur un autre controle, et retirer la borne de sauts ne
   *   faisait pas rougir le test. Un cas qui refuse pour la mauvaise raison ne teste pas la garde
   *   qu il vise.
   *   ⇒ Il faut un chemin par ailleurs VALIDE — qui part de la devise, arrive sur le block, chaine
   *     correctement — et seulement trop long. */
  ['trop de sauts', { chemin: [
    { de: USDC, vers: ETH, famille: AERO },
    { de: ETH, vers: USDC, famille: AERO },
    { de: USDC, vers: ETH, famille: AERO },
    { de: ETH, vers: USDC, famille: AERO },
    { de: USDC, vers: AAPLC, famille: AERO },
  ] }],
];
for (const [nom, args] of cas) {
  const x = await planAerodromeSegment({ ...commun, rpc: rpcQui({}), ...args });
  t('refus: ' + nom, x.etat === 'REFUSE' && typeof x.pourquoi === 'string' && x.pourquoi.length > 10);
  t('refus sans appels: ' + nom, !x.appels);
}
/* ⛔⛔ LE REFUS « N ARRIVE PAS SUR LE BLOCK » EST LE PLUS IMPORTANT DU LOT : sans lui on batirait
 *   un swap qui achete autre chose que ce que l ecran annonce, et RIEN ne reverterait. */
const ailleurs = await planAerodromeSegment({ ...commun, rpc: rpcQui({}),
  chemin: [{ de: USDC, vers: ETH, famille: AERO }] });
t('⛔ et ce refus NOMME les deux jetons',
  ailleurs.pourquoi.includes(ETH.toLowerCase()) && ailleurs.pourquoi.includes(AAPLC.toLowerCase()));

/* ══ 5. UN PRIX ILLISIBLE NE DONNE PAS UN MINIMUM INVENTE ═════════════════════════════════════ */
const sansPrix = await planAerodromeSegment({ ...commun, rpc: rpcQui({ refuseSlot0: true }),
  chemin: cheminUn });
t('prix de pool illisible => NON_MESURE, pas REFUSE', sansPrix.etat === 'NON_MESURE');
t('et la raison dit qu aucun minimum honnete ne peut etre pose',
  /honest minimum/i.test(sansPrix.pourquoi));
/* ⛔ UN PRIX A ZERO N EST PAS UN PRIX : le retenir ferait un minimum nul, donc un ordre qui accepte
 *   de tout perdre. C est le motif « Number(null) = 0 ». */
const prixNul = await planAerodromeSegment({ ...commun, rpc: rpcQui({ sqrt: 0n }), chemin: cheminUn });
t('un prix a zero ne fait pas un plan', prixNul.etat !== 'PRET');
/* ⛔⛔ UNE MUTATION A SURVECU ICI AUSSI, ET POUR UNE RAISON INSTRUCTIVE : avec `sqrt = 0`, c est la
 *   garde PRECEDENTE (`sqrt <= 0n`) qui attrape, donc le controle `suivant <= 0n` n etait JAMAIS
 *   atteint par mes cas. Une garde protegee par sa voisine n a aucun test a elle — c est la
 *   troisieme fois aujourd hui.
 *   ⇒ IL FAUT UN PRIX VALIDE QUI PRODUIT UNE SORTIE NULLE : un prix tres haut et un montant minuscule
 *     font un `sortieSpot` qui TRONQUE a zero. C est un cas reel — acheter pour trois centimes un
 *     actif a 200 $ — et le retenir ferait un ordre dont le minimum de sortie est nul, c est-a-dire
 *     un ordre qui accepte de tout perdre. */
/* ⛔ ET LE SENS COMPTE : `sortieSpot` vaut `e*s²/Q192` quand l entree est currency0, et
 *   `e*Q192/s²` sinon. Seule la SECONDE forme tronque a zero avec un prix tres haut. Ma premiere
 *   version prenait la premiere et obtenait un nombre ENORME — elle testait l inverse de ce
 *   qu elle croyait. On met donc AAPLc en `token0` pour que l entree USDC ne le soit pas. */
const sortieTronquee = await planAerodromeSegment({ ...commun, montant: 1n,
  rpc: rpcQui({ token0: AAPLC, sqrt: UN_POUR_UN * 1000000n }), chemin: cheminUn });
t('⛔ une sortie qui TRONQUE a zero ne fait pas un plan', sortieTronquee.etat !== 'PRET');
t('et le refus NOMME le saut', /hop 1/.test(String(sortieTronquee.etape) + ' ' + String(sortieTronquee.pourquoi)));

/* ══ 6. LE MINIMUM PORTE SA NATURE ════════════════════════════════════════════════════════════ */
/* ⛔ Il vient d un PRIX SPOT, pas d un devis : il ignore la profondeur, donc la sortie reelle sera
 *   inferieure sur un gros montant. L ecran doit pouvoir le dire au lieu de le presenter comme une
 *   cotation. */
t('le resume dit que le minimum vient du prix spot', r.resume.minimumParPrixSpot === true);
t('et il porte le nombre de sauts', r.resume.sauts === 1);
t('et la phrase de retenue est rendue', typeof r.resume.retenue === 'string' && /%/.test(r.resume.retenue));

console.log((ko.length ? 'KO ' + ko.length : 'OK') + ' — ' + ok + ' assertions');
for (const k of ko) console.log('  KO ' + k);
process.exit(ko.length ? 1 : 0);
