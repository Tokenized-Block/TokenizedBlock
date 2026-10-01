/* LES DEVISES D ENTREE — et d abord la PREUVE du defaut qu on corrige.
 *
 * ⛔⛔ LA PREMIERE ASSERTION EST LA PLUS IMPORTANTE DU FICHIER : elle rejoue le graphe tel que
 *   l app le construisait, SANS arete du block, et exige que la route OUSD -> block soit
 *   introuvable. Si un jour elle devient verte sans qu on ait touche au graphe, c est que ce test
 *   a cesse de tester le defaut — et c est exactement ce qui est arrive plusieurs fois dans ce
 *   depot : un test vert qui tenait la mauvaise moitie.
 */
import { areteDuBlock, classerDevise, devisesDentree, phraseDevise, peutEtreAssemblee, resumeDesNonOffertes,
  ETATS, ETATS_OFFERTS } from './devises-dentree.js';
import { cheminEntre } from './pont-de-liquidite.js';

let ok = 0; const ko = [];
const t = (nom, cond) => { if (cond) ok += 1; else ko.push(nom); };

/* Les adresses sont celles du depot, pas de ma memoire. */
const ETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const OUSD = '0x0000000000000000000000000000000000000ou'.replace('ou', '01'); /* substitut de test */
const AAPLC = '0x00000000000000000000000000000000000aap1';
const BLOCK = '0xb20000000000000000000084d0953bad205d563f';

const ousd = '0x0000000000000000000000000000000000000001';
const aaplc = '0x0000000000000000000000000000000000000002';

/* ══ 1. LE DEFAUT, REPRODUIT ══════════════════════════════════════════════════════════════════ */
/* Le graphe que `aretesMesurees()` produisait : ETH<->USDC des deux cotes, puis USDC -> devise.
 *   AUCUNE arete n arrive sur le block. */
const grapheApp = [
  { de: ETH, vers: USDC, famille: 'uniswap-v4' },
  { de: ETH, vers: USDC, famille: 'aerodrome' },
  { de: USDC, vers: ousd, famille: 'uniswap-v4' },
  { de: USDC, vers: aaplc, famille: 'aerodrome' },
];
const sansArete = cheminEntre(ousd, BLOCK, grapheApp);
t('DEFAUT: sans arete du block, aucune route OUSD -> block', sansArete.etat === 'REFUSE');
t('DEFAUT: et le refus porte une raison', typeof sansArete.pourquoi === 'string' && sansArete.pourquoi.length > 0);

/* ══ 2. L ARETE DU BLOCK ══════════════════════════════════════════════════════════════════════ */
t('arete: ETH/block aerodrome est acceptee',
  JSON.stringify(areteDuBlock({ block: BLOCK, deviseDeLaPool: ETH, famille: 'aerodrome' }))
  === JSON.stringify({ de: ETH, vers: BLOCK, famille: 'aerodrome' }));
t('arete: famille non lue => pas d arete',
  areteDuBlock({ block: BLOCK, deviseDeLaPool: ETH, famille: 'NON_MESURE' }) === null);
t('arete: famille absente => pas d arete',
  areteDuBlock({ block: BLOCK, deviseDeLaPool: ETH }) === null);
t('arete: block == devise => pas d arete',
  areteDuBlock({ block: BLOCK, deviseDeLaPool: BLOCK, famille: 'aerodrome' }) === null);
t('arete: adresse malformee => pas d arete',
  areteDuBlock({ block: '0xzz', deviseDeLaPool: ETH, famille: 'aerodrome' }) === null);
t('arete: devise malformee => pas d arete',
  areteDuBlock({ block: BLOCK, deviseDeLaPool: 'ETH', famille: 'aerodrome' }) === null);
t('arete: v4 acceptee aussi',
  (areteDuBlock({ block: BLOCK, deviseDeLaPool: USDC, famille: 'uniswap-v4' }) || {}).famille === 'uniswap-v4');
t('arete: la casse est normalisee',
  (areteDuBlock({ block: BLOCK.toUpperCase().replace('0X', '0x'), deviseDeLaPool: ETH, famille: 'aerodrome' }) || {}).vers === BLOCK);

/* ══ 3. LE DEFAUT, CORRIGE ════════════════════════════════════════════════════════════════════ */
const graphe = grapheApp.concat([areteDuBlock({ block: BLOCK, deviseDeLaPool: ETH, famille: 'aerodrome' })]);
const avecArete = cheminEntre(ousd, BLOCK, graphe);
t('CORRIGE: avec l arete du block, la route OUSD -> block existe', avecArete.etat === 'OK');
/* OUSD -> USDC (v4) -> ETH (v4 ou aero) -> block (aero). Le chemin le MOINS cher en segments. */
t('CORRIGE: la route fait 3 sauts', avecArete.chemin.length === 3);
t('CORRIGE: elle part bien d OUSD', avecArete.chemin[0].de === ousd);
t('CORRIGE: elle arrive bien sur le block', avecArete.chemin[2].vers === BLOCK);

/* ══ 4. LE CLASSEMENT ═════════════════════════════════════════════════════════════════════════ */
const cOusd = classerDevise({ devise: ousd, block: BLOCK, aretes: graphe, faitsLus: true });
t('classer: OUSD est offert', ETATS_OFFERTS.includes(cOusd.etat));
t('classer: OUSD porte un nombre de transactions entier >= 1',
  Number.isInteger(cOusd.tx) && cOusd.tx >= 1);
t('classer: OUSD rend ses segments', Array.isArray(cOusd.segments) && cOusd.segments.length === cOusd.tx);
t('classer: le chemin rendu a bien la longueur annoncee en sauts', cOusd.chemin.length === 3);

/* ⛔⛔ LA DISTINCTION QUI COMPTE : regarde-et-rien vs pas-regarde. */
const inconnue = '0x00000000000000000000000000000000000000ff';
const pasLue = classerDevise({ devise: inconnue, block: BLOCK, aretes: graphe, faitsLus: false });
const lueEtVide = classerDevise({ devise: inconnue, block: BLOCK, aretes: graphe, faitsLus: true });
t('classer: devise non lue => NON_MESUREE', pasLue.etat === 'NON_MESUREE');
t('classer: devise lue sans route => SANS_ROUTE', lueEtVide.etat === 'SANS_ROUTE');
t('classer: les deux etats DIFFERENT', pasLue.etat !== lueEtVide.etat);
t('classer: NON_MESUREE dit qu on n a pas lu', /not read|do not know/i.test(pasLue.pourquoi));
t('classer: SANS_ROUTE parle de la route', /path|route|hops/i.test(lueEtVide.pourquoi));
t('classer: aucune des deux n est offerte',
  !ETATS_OFFERTS.includes(pasLue.etat) && !ETATS_OFFERTS.includes(lueEtVide.etat));
t('classer: payer un block avec lui-meme est SANS_ROUTE',
  classerDevise({ devise: BLOCK, block: BLOCK, aretes: graphe, faitsLus: true }).etat === 'SANS_ROUTE');
t('classer: adresse malformee => NON_MESUREE',
  classerDevise({ devise: 'nope', block: BLOCK, aretes: graphe, faitsLus: true }).etat === 'NON_MESUREE');

/* ⛔ UNE_TX vs PLUSIEURS_TX : le nombre de segments, pas de sauts. */
const monoFamille = [
  { de: ETH, vers: USDC, famille: 'aerodrome' },
  { de: USDC, vers: aaplc, famille: 'aerodrome' },
  areteDuBlock({ block: BLOCK, deviseDeLaPool: ETH, famille: 'aerodrome' }),
];
const cAaplc = classerDevise({ devise: aaplc, block: BLOCK, aretes: monoFamille, faitsLus: true });
t('classer: tout sur aerodrome => UNE_TX', cAaplc.etat === 'UNE_TX');
t('classer: UNE_TX veut dire tx === 1', cAaplc.tx === 1);
/* ⛔ J AVAIS ECRIT `=== 2` ICI, DE TETE, ET LE TEST A ROUGI. Le chemin reel est
 *   AAPLc -> USDC -> ETH -> block, soit TROIS sauts : AAPLc ne touche qu USDC dans ce graphe, et
 *   le block ne touche qu ETH. Compter a la main ce qu une sonde compte est exactement l erreur
 *   que ce depot a deja payee. La propriete visee est d ailleurs MIEUX prouvee ainsi : 3 sauts
 *   pour 1 seule transaction. */
t('classer: 3 sauts pour 1 transaction — segments != sauts',
  cAaplc.chemin.length === 3 && cAaplc.tx === 1);

const deuxMondes = [
  { de: USDC, vers: ousd, famille: 'uniswap-v4' },
  areteDuBlock({ block: BLOCK, deviseDeLaPool: USDC, famille: 'aerodrome' }),
];
const cPont = classerDevise({ devise: ousd, block: BLOCK, aretes: deuxMondes, faitsLus: true });
t('classer: changement de factory => PLUSIEURS_TX', cPont.etat === 'PLUSIEURS_TX');
t('classer: PLUSIEURS_TX porte tx === 2', cPont.tx === 2);
t('classer: les familles ignorees remontent (tableau)', Array.isArray(cPont.ignorees));

const avecExotique = deuxMondes.concat([{ de: ousd, vers: BLOCK, famille: 'un-lieu-inconnu' }]);
const cExo = classerDevise({ devise: ousd, block: BLOCK, aretes: avecExotique, faitsLus: true });
t('classer: une famille inconnue est NOMMEE, pas empruntee',
  cExo.ignorees.includes('un-lieu-inconnu') && cExo.tx === 2);

/* ══ 5. LA LISTE ══════════════════════════════════════════════════════════════════════════════ */
const candidates = [
  { adr: ETH, symbole: 'ETH', decimales: 18, faitsLus: true },
  { adr: USDC, symbole: 'USDC', decimales: 6, faitsLus: true },
  { adr: ousd, symbole: 'OUSD', decimales: 6, faitsLus: true },
  { adr: aaplc, symbole: 'AAPLc', decimales: 8, faitsLus: true },
  { adr: inconnue, symbole: 'XXX', decimales: 18, faitsLus: false },
];
const L = devisesDentree({ block: BLOCK, deviseDeLaPool: ETH, familleDuBlock: 'aerodrome',
  candidates, aretes: grapheApp });
t('liste: OK quand la famille du block est lue', L.etat === 'OK');
t('liste: la devise de la pool est en tete', L.devises[0].devise === ETH);
t('liste: elle est DIRECTE', L.devises[0].etat === 'DIRECTE');
t('liste: elle porte son symbole', L.devises[0].symbole === 'ETH');
t('liste: elle porte ses decimales', L.devises[0].decimales === 18);
t('liste: pas de doublon de la devise de la pool',
  L.devises.filter((d) => d.devise === ETH).length === 1);
t('liste: OUSD y est et est offert',
  L.offertes.some((d) => d.devise === ousd));
t('liste: la devise non lue est presente mais PAS offerte',
  L.devises.some((d) => d.devise === inconnue && d.etat === 'NON_MESUREE')
  && !L.offertes.some((d) => d.devise === inconnue));
t('liste: tous les etats rendus sont connus', L.devises.every((d) => ETATS.includes(d.etat)));
t('liste: les offertes sont un sous-ensemble des devises', L.offertes.every((d) => L.devises.includes(d)));
/* ⛔ L ORDRE EST UN ORDRE DE COUT : aucun etat non offert ne precede un etat offert. */
const rangs = L.devises.map((d) => ETATS.indexOf(d.etat));
t('liste: l ordre est croissant en cout', rangs.every((r, i) => i === 0 || rangs[i - 1] <= r));
t('liste: tout ce qui est offert vient avant tout ce qui ne l est pas',
  L.devises.findIndex((d) => !ETATS_OFFERTS.includes(d.etat))
  > L.devises.map((d) => ETATS_OFFERTS.includes(d.etat)).lastIndexOf(true) - 1);

/* ⛔⛔ SANS FAMILLE DU BLOCK : REFUSE, PAS UNE LISTE VIDE. */
const R = devisesDentree({ block: BLOCK, deviseDeLaPool: ETH, familleDuBlock: 'NON_MESURE',
  candidates, aretes: grapheApp });
t('liste: famille du block non lue => REFUSE', R.etat === 'REFUSE');
t('liste: et le refus n est PAS une liste vide deguisee',
  R.devises.length === 0 && /have not read|cannot say/i.test(R.pourquoi));
t('liste: candidates absentes => REFUSE ou liste reduite a la directe',
  devisesDentree({ block: BLOCK, deviseDeLaPool: ETH, familleDuBlock: 'aerodrome', aretes: grapheApp })
    .devises.length === 1);
t('liste: aretes absentes => la directe reste offerte',
  devisesDentree({ block: BLOCK, deviseDeLaPool: ETH, familleDuBlock: 'aerodrome', candidates })
    .offertes.some((d) => d.etat === 'DIRECTE'));

/* ══ 6. LES PHRASES ═══════════════════════════════════════════════════════════════════════════ */
t('phrase: DIRECTE dit une signature', /one signature/.test(phraseDevise(L.devises[0], 'TB')));
t('phrase: PLUSIEURS_TX PORTE LE CHIFFRE', /\b2 signatures\b/.test(phraseDevise(cPont, 'TB')));
t('phrase: PLUSIEURS_TX dit combien de changements de lieu',
  /changes venue 1 time\b/.test(phraseDevise(cPont, 'TB')));
t('phrase: SANS_ROUTE est un verdict sur la route',
  /no route/i.test(phraseDevise(lueEtVide, 'TB')));
t('phrase: NON_MESUREE est un aveu sur nous, pas un verdict',
  /not checked yet/i.test(phraseDevise(pasLue, 'TB'))
  && !/no route/i.test(phraseDevise(pasLue, 'TB')));
t('phrase: les deux phrases DIFFERENT',
  phraseDevise(lueEtVide, 'TB') !== phraseDevise(pasLue, 'TB'));
t('phrase: un etat inconnu ne produit pas de prose confiante',
  phraseDevise({ etat: 'INVENTE' }, 'TB') === 'Not computed.');
t('phrase: rien du tout ne produit pas de prose confiante',
  phraseDevise(null, 'TB') === 'Not computed.');
t('phrase: le symbole du block apparait', /TBLOCK/.test(phraseDevise(cOusd, 'TBLOCK')));
t('phrase: sans symbole de devise, l adresse sert de nom',
  phraseDevise({ etat: 'UNE_TX', devise: ousd, tx: 1 }, 'TB').startsWith(ousd));

/* ⛔ UN PLURIEL FAUX EST UN DEFAUT D AFFICHAGE : 3 tx => 2 changements, donc « times ». */
t('phrase: 3 signatures => « 2 times » au pluriel',
  /changes venue 2 times/.test(phraseDevise({ etat: 'PLUSIEURS_TX', devise: ousd, symbole: 'OUSD', tx: 3 }, 'TB')));

/* ══ 7. « IL Y A UNE ROUTE » N EST PAS « ON SAIT L ASSEMBLER » ═════════════════════════════════ */
/* ⛔⛔ C est la frontiere qui decide quel bouton est CLIQUABLE. L oublier offrirait un bouton qui
 *   revert — le pire des trois etats possibles, parce qu il coute du gas a l utilisateur. */
const v4Pur = [
  { de: USDC, vers: ousd, famille: 'uniswap-v4' },
  { de: ETH, vers: USDC, famille: 'uniswap-v4' },
  areteDuBlock({ block: BLOCK, deviseDeLaPool: ETH, famille: 'uniswap-v4' }),
];
const cV4 = classerDevise({ devise: ousd, block: BLOCK, aretes: v4Pur, faitsLus: true });
t('assemblage: un segment v4 est assemblable', peutEtreAssemblee(cV4).ok === true);
t('assemblage: et il nomme son assembleur', peutEtreAssemblee(cV4).par === 'route-v4-multi-sauts');
t('assemblage: c est bien UNE transaction', cV4.tx === 1);
/* ⛔ LE CAS QUE J AURAIS OFFERT A TORT : un seul segment, mais Aerodrome. */
const aeroPur = [
  { de: USDC, vers: ousd, famille: 'aerodrome' },
  { de: ETH, vers: USDC, famille: 'aerodrome' },
  areteDuBlock({ block: BLOCK, deviseDeLaPool: ETH, famille: 'aerodrome' }),
];
const cAero = classerDevise({ devise: ousd, block: BLOCK, aretes: aeroPur, faitsLus: true });
t('assemblage: UNE_TX ne suffit PAS — un segment aerodrome est refuse',
  cAero.etat === 'UNE_TX' && cAero.tx === 1 && peutEtreAssemblee(cAero).ok === false);
t('assemblage: et le refus nomme la famille, pas « impossible »',
  /aerodrome/.test(peutEtreAssemblee(cAero).pourquoi)
  && /we proved|builder/i.test(peutEtreAssemblee(cAero).pourquoi));
/* ⭐⭐ OUVERT LE 2026-10-01 : `cPont` est exactement la forme uniswap-v4 PUIS un saut aerodrome,
 *   c est-a-dire OUSD -> USDC -> une action tokenisee. C etait refuse ; c est desormais bati par
 *   `planifierFranchissement` en UN LOT ATOMIQUE de trois appels.
 *   ⛔ Cette assertion disait avant « deux segments => refuse ». Elle encodait une limite de notre
 *     outillage, PAS une regle du produit — et c est pour ca qu elle devait changer quand
 *     l outillage a change. Une assertion qui gele une limite temporaire finit par defendre le
 *     defaut qu elle documentait. */
t('assemblage: uniswap-v4 PUIS un saut aerodrome est un FRANCHISSEMENT',
  peutEtreAssemblee(cPont).ok === true && peutEtreAssemblee(cPont).par === 'franchissement');
t('assemblage: et il annonce TROIS appels, pas un',
  peutEtreAssemblee(cPont).appels === 3);
/* ⛔⛔ ET IL EXIGE L ATOMICITE. Sans elle, la jambe 1 peut passer seule et l acheteur se retrouve
 *   avec le pivot au lieu de ce qu il voulait — il a paye un frais pour un actif qu il n a pas
 *   demande. Le drapeau doit remonter pour que l ecran puisse refuser aux wallets qui ne groupent
 *   pas, au lieu de les laisser decouvrir le probleme apres avoir signe. */
t('assemblage: le franchissement EXIGE l atomicite', peutEtreAssemblee(cPont).exigeAtomique === true);
t('assemblage: le rail a un seul segment ne l exige PAS',
  peutEtreAssemblee(cV4).exigeAtomique === undefined && peutEtreAssemblee(cV4).appels === 1);
/* ⛔ L ORDRE INVERSE RESTE REFUSE : aerodrome puis uniswap ferait un lot aux approbations fausses. */
const inverseSeg = { etat: 'PLUSIEURS_TX', devise: ousd, tx: 2,
  segments: [{ famille: 'aerodrome', sauts: [{}] }, { famille: 'uniswap-v4', sauts: [{}] }] };
t('assemblage: aerodrome PUIS uniswap reste refuse', peutEtreAssemblee(inverseSeg).ok === false);
t('assemblage: et le refus NOMME la forme vue',
  /aerodrome then uniswap-v4/.test(peutEtreAssemblee(inverseSeg).pourquoi));
/* ⛔⛔ UNE MUTATION A SURVECU ICI, ET ELLE M A MONTRE UN TROU DE COUVERTURE, PAS UN BUG.
 *   En relachant le controle du SECOND segment, le test restait vert — parce que mon seul cas a
 *   deux segments mettait `aerodrome` EN PREMIER : la condition sur segs[0] echouait deja, et
 *   celle sur segs[1] n etait JAMAIS exercee. Une garde peut etre protegee par la garde d a cote
 *   et n avoir aucun test a elle.
 *   ⇒ Il faut donc un cas ou le PREMIER segment est bon et le SECOND ne l est pas. */
const secondFaux = { etat: 'PLUSIEURS_TX', devise: ousd, tx: 2,
  segments: [{ famille: 'uniswap-v4', sauts: [{}] }, { famille: 'uniswap-v4', sauts: [{}] }] };
t('assemblage: premier segment bon, second pas aerodrome => refuse',
  peutEtreAssemblee(secondFaux).ok === false);
t('assemblage: et le refus nomme la forme vue',
  /uniswap-v4 then uniswap-v4/.test(peutEtreAssemblee(secondFaux).pourquoi));

/* ⛔ UN SEGMENT AERODROME A PLUSIEURS SAUTS RESTE REFUSE : l assembleur prend UNE pool. */
const aeroLong = { etat: 'PLUSIEURS_TX', devise: ousd, tx: 2,
  segments: [{ famille: 'uniswap-v4', sauts: [{}] }, { famille: 'aerodrome', sauts: [{}, {}] }] };
t('assemblage: un segment aerodrome a deux sauts reste refuse',
  peutEtreAssemblee(aeroLong).ok === false);
/* ⛔ TROIS SEGMENTS RESTENT REFUSES, et le refus dit combien il en a vus. */
const trois = { etat: 'PLUSIEURS_TX', devise: ousd, tx: 3,
  segments: [{ famille: 'uniswap-v4', sauts: [{}] }, { famille: 'aerodrome', sauts: [{}] },
    { famille: 'uniswap-v4', sauts: [{}] }] };
t('assemblage: trois segments restent refuses',
  peutEtreAssemblee(trois).ok === false && /3 venues/.test(peutEtreAssemblee(trois).pourquoi));
t('assemblage: la DIRECTE passe par le chemin historique',
  peutEtreAssemblee(L.devises[0]).ok === true
  && peutEtreAssemblee(L.devises[0]).par === 'chemin historique');
t('assemblage: SANS_ROUTE n est pas assemblable', peutEtreAssemblee(lueEtVide).ok === false);
t('assemblage: NON_MESUREE n est pas assemblable', peutEtreAssemblee(pasLue).ok === false);
/* ⛔⛔ UNE MUTATION A SURVECU ICI, ET ELLE M A APPRIS QUE MA GARDE ETAIT CORRECTE PAR ACCIDENT.
 *   En supprimant le controle `ETATS_OFFERTS`, SANS_ROUTE restait refuse — mais par le controle
 *   SUIVANT, celui des segments, qui n existent pas sur un etat non offert. Le verdict restait bon
 *   et la RAISON devenait fausse : « this route crosses 0 venues » au lieu du vrai motif. Mon
 *   assertion ne regardait que la LONGUEUR du message, donc elle ne voyait rien.
 *   ⇒ On exige maintenant que le refus d un etat non offert porte SA raison, et JAMAIS un decompte
 *     de segments. Un refus qui invoque un mauvais motif envoie la personne corriger la mauvaise
 *     chose. */
t('assemblage: le refus de SANS_ROUTE porte SA raison, pas un decompte de segments',
  peutEtreAssemblee(lueEtVide).pourquoi === lueEtVide.pourquoi
  && !/venues/.test(peutEtreAssemblee(lueEtVide).pourquoi));
t('assemblage: le refus de NON_MESUREE porte SA raison, pas un decompte de segments',
  peutEtreAssemblee(pasLue).pourquoi === pasLue.pourquoi
  && !/venues/.test(peutEtreAssemblee(pasLue).pourquoi));
t('assemblage: un objet inconnu n est pas assemblable',
  peutEtreAssemblee({ etat: 'INVENTE' }).ok === false);
t('assemblage: rien du tout n est pas assemblable', peutEtreAssemblee(null).ok === false);
/* ⛔ UN REFUS SANS RAISON EST UNE PANNE POUR CELUI QUI LE LIT. */
t('assemblage: tout refus porte une raison non vide',
  [cAero, cPont, lueEtVide, pasLue, { etat: 'INVENTE' }, null]
    .every((x) => { const r = peutEtreAssemblee(x); return r.ok || (typeof r.pourquoi === 'string' && r.pourquoi.length > 10); }));

/* ══ 8. LE RESUME DES NON OFFERTES — groupe, borne, et ne cache rien ══════════════════════════
 * ⛔⛔⛔ CE BLOC EXISTE PARCE QUE J AI DEPLOYE UN MUR DE TEXTE. Phil l a entoure en rouge : quinze
 *   devises, quinze fois la MEME phrase de quinze mots, bout a bout sous le selecteur. Un bloc
 *   repete n informe pas — il apprend a ne plus lire la zone. */
const quinze = Array.from({ length: 15 }, (_, i) => ({
  etat: 'PLUSIEURS_TX', devise: '0x' + String(i).padStart(40, '0'), symbole: 'TOK' + i,
}));
const R1 = resumeDesNonOffertes(quinze, () => 'this route crosses 2 venues');
t('resume: quinze devises a la MEME raison font UN SEUL groupe', R1.length === 1);
t('resume: la raison n apparait qu UNE fois',
  (R1[0].texte.match(/this route crosses 2 venues/g) || []).length === 1);
t('resume: le TOTAL est dit, pas seulement les noms montres', R1[0].total === 15);
t('resume: le texte porte le total entre parentheses', /\(15\)/.test(R1[0].texte));
/* ⛔ LA LISTE EST BORNEE ET SON RESTE EST COMPTE : « et 9 autres » est une information. */
t('resume: au plus 6 noms sont montres', (R1[0].texte.split(' and ')[0].match(/TOK/g) || []).length === 6);
t('resume: le reste est COMPTE', /and 9 more/.test(R1[0].texte));
/* ⛔⛔ ET AUCUNE DEVISE N EST PERDUE : on cesse de REPETER, on ne dit pas MOINS. */
t('resume: les quinze noms restent accessibles', R1[0].noms.length === 15);

/* ⛔ DEUX RAISONS DIFFERENTES FONT DEUX GROUPES, et la plus frequente passe devant. */
const melange = [
  { etat: 'PLUSIEURS_TX', devise: '0x' + '1'.repeat(40), symbole: 'A' },
  { etat: 'PLUSIEURS_TX', devise: '0x' + '2'.repeat(40), symbole: 'B' },
  { etat: 'SANS_ROUTE', devise: '0x' + '3'.repeat(40), symbole: 'C' },
];
const R2 = resumeDesNonOffertes(melange, (d) => (d.etat === 'SANS_ROUTE' ? 'no path' : 'two venues'));
t('resume: deux raisons font deux groupes', R2.length === 2);
t('resume: la raison la plus frequente passe devant', R2[0].total === 2 && R2[1].total === 1);

/* ⛔⛔ CE QU ON N A PAS SONDE N EST PAS NOMME. Lister une devise `NON_MESUREE` comme « sans route »
 *   serait une accusation fondee sur notre propre incompletude — la distinction que tout ce
 *   fichier defend. */
const avecNonMesuree = [
  { etat: 'NON_MESUREE', devise: '0x' + '4'.repeat(40), symbole: 'INCONNU' },
  { etat: 'SANS_ROUTE', devise: '0x' + '5'.repeat(40), symbole: 'VU' },
];
const R3 = resumeDesNonOffertes(avecNonMesuree, () => 'raison');
t('resume: une devise NON_MESUREE n est PAS nommee', !JSON.stringify(R3).includes('INCONNU'));
t('resume: mais celle qu on a regardee l est', JSON.stringify(R3).includes('VU'));
/* ⛔ UNE RAISON ABSENTE N INVENTE PAS DE GROUPE. */
t('resume: sans raison, pas de groupe', resumeDesNonOffertes(melange, () => null).length === 0);
t('resume: une entree vide ne casse rien', resumeDesNonOffertes(null, () => 'x').length === 0);
t('resume: un raisonDe qui leve ne casse rien',
  resumeDesNonOffertes(melange, () => { throw new Error('boum'); }).length === 0);

console.log((ko.length ? 'KO ' + ko.length : 'OK') + ' — ' + ok + ' assertions');
for (const k of ko) console.log('  KO ' + k);
process.exit(ko.length ? 1 : 0);
