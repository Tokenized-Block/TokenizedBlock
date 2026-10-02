/* LE FRANCHISSEMENT A DEUX MONDES — et tout ce qu il doit REFUSER plutot que de bricoler.
 *
 * ⛔ LA PROPRIETE CENTRALE : une forme inattendue est refusee ICI, pas sur la chaine. Un lot dont
 *   l ordre des approbations est faux reverte APRES la signature, donc apres le gaz de l acheteur.
 *   Accepter large serait lui facturer notre laxisme.
 */
import { franchissementDepuisChemin, phraseFranchissement, FORME_EXIGEE, ETATS }
  from './franchissement-depuis-chemin.js';

let ok = 0; const ko = [];
const t = (nom, cond) => { if (cond) ok += 1; else ko.push(nom); };

const OUSD = '0xb2000000000000000000002feb517dfec7415344';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const ETH = '0x0000000000000000000000000000000000000000';
const AAPLC = '0xb200000000000000000000c2e324d24d7eecd1fb';
const V4 = 'uniswap-v4', AERO = 'aerodrome';

/* ══ 1. LE CAS DE LA MISSION : OUSD -> USDC (V4) -> AAPLc (Aerodrome) ═════════════════════════ */
const r = franchissementDepuisChemin({ chemin: [
  { de: OUSD, vers: USDC, famille: V4 },
  { de: USDC, vers: AAPLC, famille: AERO },
] });
t('OUSD -> USDC -> AAPLc est un franchissement valide', r.etat === 'OK');
t('le pivot est USDC', r.pivot === USDC);
t('l actif d arrivee est AAPLc', r.action === AAPLC);
t('la jambe 1 est un SOUS-CHEMIN, pas une paire', Array.isArray(r.jambe1) && r.jambe1.length === 1);
t('la jambe 1 part d OUSD et arrive sur le pivot',
  r.jambe1[0].de === OUSD && r.jambe1[0].vers === USDC);
t('la forme vue est rendue', JSON.stringify(r.formeVue) === JSON.stringify([V4, AERO]));
t('l etat est connu', ETATS.includes(r.etat));

/* ⛔⛔ LA JAMBE 1 PEUT FAIRE PLUSIEURS SAUTS V4, ET ILS DOIVENT TOUS REMONTER. N en garder que les
 *   bouts construirait une route qui n existe pas — OUSD -> ETH directement, alors que la pool
 *   OUSD/ETH ne fait que 289 $ (mesure du 2026-09-30). */
const long = franchissementDepuisChemin({ chemin: [
  { de: OUSD, vers: USDC, famille: V4 },
  { de: USDC, vers: ETH, famille: V4 },
  { de: ETH, vers: AAPLC, famille: AERO },
] });
t('une jambe 1 a deux sauts est acceptee', long.etat === 'OK');
t('et ses DEUX sauts remontent, pas seulement les bouts', long.jambe1.length === 2);
t('le pivot devient ETH, la charniere reelle', long.pivot === ETH);
t('les sauts du milieu ne sont pas perdus',
  long.jambe1[0].vers === USDC && long.jambe1[1].de === USDC);

/* ══ 2. LES FORMES REFUSEES, ET LE REFUS NOMME CE QU IL A VU ══════════════════════════════════ */
const unSeul = franchissementDepuisChemin({ chemin: [{ de: OUSD, vers: USDC, famille: V4 }] });
t('un seul segment => REFUSE', unSeul.etat === 'REFUSE');
t('et le refus dit combien de segments il a vus', /has 1 /.test(unSeul.pourquoi));
t('et il nomme la forme attendue', new RegExp(FORME_EXIGEE.join(' then ')).test(unSeul.pourquoi));

const inverse = franchissementDepuisChemin({ chemin: [
  { de: AAPLC, vers: USDC, famille: AERO },
  { de: USDC, vers: OUSD, famille: V4 },
] });
t('l ordre inverse (aerodrome puis uniswap) => REFUSE', inverse.etat === 'REFUSE');
/* ⛔ LE REFUS DIT POURQUOI CA COMPTE : l ordre du lot, et le fait que ca reverte APRES signature. */
t('et il explique que l ordre du lot serait faux',
  /batch order|reverts after the signature/i.test(inverse.pourquoi));
t('et il nomme la famille trouvee a la place', /runs on aerodrome/.test(inverse.pourquoi));

const trois = franchissementDepuisChemin({ chemin: [
  { de: OUSD, vers: USDC, famille: V4 },
  { de: USDC, vers: AAPLC, famille: AERO },
  { de: AAPLC, vers: ETH, famille: V4 },
] });
t('trois segments => REFUSE', trois.etat === 'REFUSE');
t('et la forme vue est rendue meme en refus', trois.formeVue.length === 3);

const toutV4 = franchissementDepuisChemin({ chemin: [
  { de: OUSD, vers: USDC, famille: V4 },
  { de: USDC, vers: AAPLC, famille: V4 },
] });
/* ⛔ UNE ROUTE ENTIEREMENT V4 N EST PAS UN FRANCHISSEMENT : elle tient en UN appel, et la faire
 *   passer par le lot ferait signer trois appels la ou un suffit, avec une approbation inutile. */
t('tout sur une seule factory => REFUSE (ce n est pas un franchissement)', toutV4.etat === 'REFUSE');
t('et le refus dit qu il n a vu qu un segment', /has 1 /.test(toutV4.pourquoi));

/* ⛔⛔ LE SEGMENT AERODROME DOIT TENIR EN UN SAUT : l assembleur prend UN tickSpacing et UNE pool. */
const aeroDeux = franchissementDepuisChemin({ chemin: [
  { de: OUSD, vers: USDC, famille: V4 },
  { de: USDC, vers: ETH, famille: AERO },
  { de: ETH, vers: AAPLC, famille: AERO },
] });
t('un segment aerodrome a deux sauts => REFUSE', aeroDeux.etat === 'REFUSE');
t('et le refus dit pourquoi (un tickSpacing, une pool)',
  /single hop|one tickSpacing/i.test(aeroDeux.pourquoi));

/* ⛔ UNE CHARNIERE INCOHERENTE : le lot approuverait un jeton et en depenserait un autre. */
const troue = franchissementDepuisChemin({ chemin: [
  { de: OUSD, vers: USDC, famille: V4 },
  { de: ETH, vers: AAPLC, famille: AERO },
] });
t('les segments qui ne se rejoignent pas => REFUSE', troue.etat === 'REFUSE');
t('et le refus NOMME les deux jetons', /do not meet/.test(troue.pourquoi)
  && troue.pourquoi.includes(USDC) && troue.pourquoi.includes(ETH));

/* ⛔⛔ UNE MUTATION A SURVECU ICI : la garde `pivot === action` existait et AUCUN cas ne la
 *   touchait. Une garde non testee est une garde dont on ignore si elle marche — et celle-ci evite
 *   un lot qui approuverait un jeton pour l echanger contre lui-meme, c est-a-dire du gaz brule
 *   pour rien. `cheminEntre` ne produit pas cette forme, mais ce module accepte un chemin de
 *   N IMPORTE QUEL appelant : se reposer sur la politesse du producteur est exactement ce que les
 *   autres gardes de ce fichier refusent de faire. */
const boucle = franchissementDepuisChemin({ chemin: [
  { de: OUSD, vers: USDC, famille: V4 },
  { de: USDC, vers: USDC, famille: AERO },
] });
t('un segment 2 qui arrive sur le pivot lui-meme => REFUSE', boucle.etat === 'REFUSE');
t('et le refus dit que pivot et destination sont le meme jeton',
  /pivot and the destination are the same/i.test(boucle.pourquoi));
t('et il ne rend aucune piece', boucle.jambe1 === null && boucle.pivot === null);

for (const [nom, c] of [['chemin vide', []], ['rien', undefined], ['pas un tableau', 'OUSD->AAPLc']]) {
  const x = franchissementDepuisChemin({ chemin: c });
  t('refus: ' + nom, x.etat === 'REFUSE' && typeof x.pourquoi === 'string' && x.pourquoi.length > 5);
  t('refus sans pieces: ' + nom, x.jambe1 === null && x.pivot === null && x.action === null);
}
t('aucun refus ne rend de pieces utilisables',
  [unSeul, inverse, trois, toutV4, aeroDeux, troue].every((x) => x.jambe1 === null && x.pivot === null));

/* ══ 3. LA PHRASE DIT DEUX FRAIS ET NE DIT PAS « UNE TRANSACTION » ════════════════════════════ */
const ph = phraseFranchissement(r, { [USDC]: 'USDC', [AAPLC]: 'AAPLc' });
t('la phrase nomme les deux lieux', /Uniswap/.test(ph) && /Aerodrome/.test(ph));
t('la phrase nomme le pivot et la destination', /USDC/.test(ph) && /AAPLc/.test(ph));
/* ⛔⛔ « UNE SIGNATURE » N EST PAS « UNE TRANSACTION ». Le lot groupe TROIS appels sous une
 *   signature ; ils restent trois appels on-chain. Dire « one transaction » serait plus vendeur et
 *   FAUX — et c est exactement le genre de phrase qui finit reprise telle quelle. */
t('la phrase dit « one signature », pas « one transaction »',
  /one signature/.test(ph) && !/one transaction/i.test(ph));
t('la phrase dit que le wallet doit SAVOIR grouper', /supports batching/i.test(ph));
/* ⛔ 2026-10-02 (Phil : UN frais par swap) : le lot prend UN frais, sur une seule jambe — la phrase le dit. */
t('la phrase dit UN frais pour le lot', /One fee for the whole crossing/.test(ph) && !/Each swap carries its own fee/.test(ph));
t('un refus ne produit pas de prose confiante',
  /^No crossing/.test(phraseFranchissement(unSeul)));
t('rien du tout non plus', phraseFranchissement(null) === 'Crossing: not computed.');
t('sans symboles, la phrase reste honnete et ne colle pas une adresse',
  /the bridge asset/.test(phraseFranchissement(r)));

console.log((ko.length ? 'KO ' + ko.length : 'OK') + ' — ' + ok + ' assertions');
for (const k of ko) console.log('  KO ' + k);
process.exit(ko.length ? 1 : 0);
