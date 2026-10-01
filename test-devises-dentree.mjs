/* LES DEVISES D ENTREE — et d abord la PREUVE du defaut qu on corrige.
 *
 * ⛔⛔ LA PREMIERE ASSERTION EST LA PLUS IMPORTANTE DU FICHIER : elle rejoue le graphe tel que
 *   l app le construisait, SANS arete du block, et exige que la route OUSD -> block soit
 *   introuvable. Si un jour elle devient verte sans qu on ait touche au graphe, c est que ce test
 *   a cesse de tester le defaut — et c est exactement ce qui est arrive plusieurs fois dans ce
 *   depot : un test vert qui tenait la mauvaise moitie.
 */
import { areteDuBlock, classerDevise, devisesDentree, phraseDevise, peutEtreAssemblee,
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
t('assemblage: deux segments => refuse, avec le chiffre',
  peutEtreAssemblee(cPont).ok === false && /\b2 venues\b/.test(peutEtreAssemblee(cPont).pourquoi));
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

console.log((ko.length ? 'KO ' + ko.length : 'OK') + ' — ' + ok + ' assertions');
for (const k of ko) console.log('  KO ' + k);
process.exit(ko.length ? 1 : 0);
