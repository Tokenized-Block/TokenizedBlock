// stades.js — ranger les blocks par STADE, pour voir qui en est ou : la progression et l evolution d un block.
// ================================================================================================
// ⛔ DEMANDE DE PHIL (2026-09-14) : « classe bien les blocks pour qu on voie qui est a quel stade — ca donne une
//    impression de progression et d evolution du block ».
// ⛔ UN SEUL BAREME : les paliers de `pointsdevie.js` (en dollars), convertis depuis la vie en ETH par un prix ETH/USD
//    MESURE. Sans ce prix, aucun palier n est juge — le block va dans « tier not judged », jamais dans Seed.
// ⛔⛔ ET LA VIE N EST PAS TOUJOURS EN ETH (corrige le 2026-09-25). Ce fichier ne convertissait QUE l ETH :
//    `if (x.devise !== 'ETH' || !prixOk)`. Un block dont la pool est cotee en USDC, en cbBTC ou dans une action
//    tokenisee (`marche.js ▸ vieEnDevise` rend alors `devise: 'USDC' | 'cbBTC' | 'AAPLc'…`) tombait dans
//    « prix non lu » — et il y tombait SANS MEME essayer la FDV du marche public, qui est deja en dollars.
//    `peindreJeu` (app.html) avait ete corrige le 2026-09-20 ; le meme calcul vivait ici, non corrige.
//    C est `canonical-helper-weaker-copy` : la copie faible est celle qui reste en arriere.
//    ⛔ ON N INVENTE AUCUN PRIX. Une devise sans prix connu reste sans prix — voir `prixUsdDeLaDevise`.
// ⛔⛔ « PAS LU » N EST PAS LE PLUS BAS STADE. Un block dont la vie n a pas ete lue n est pas range en Seed ni en
//    « sans marche » : il a son propre groupe, dit comme un fait sur NOTRE lecture. Meme regle pour la mort : elle
//    n est dite que sur `mort === true` (le createur a detenu puis tombe a zero).
// ⚠️ Un palier suit le prix, dans les deux sens : c est un etat, pas une recompense acquise.
import { progressionPalier, PALIERS } from './pointsdevie.js';
/* ⛔ LA LISTE DES DEVISES EST IMPORTEE, JAMAIS RECOPIEE : `paires.js` est le registre, et c est le meme que
 *    `marche.js` interroge pour nommer la devise d une pool. Deux listes divergeraient en silence. */
import { pairesProposees } from './paires.js';

/* ⛔⛔ REECRITS LE 2026-09-22 (capture de Phil). TROIS DES CINQ TITRES NIAIENT UN DEFAUT :
 *     « not worthless », « not a broken block », et plus loin « Silence ≠ broken ».
 *     NIER UN DEFAUT LE SUGGERE. Personne ne pensait qu un block sans marche etait sans valeur
 *     avant qu on ecrive « pas sans valeur » a cote de son nom — la denegation plante l idee, puis
 *     la laisse. Un titre dit ce qui EST, et ce que le lecteur peut en faire ; jamais ce qu il ne
 *     faut pas croire.
 * ⛔ ET LE JARGON PART AVEC : « node/RPC lag » nomme NOTRE infrastructure a quelqu un qui n a
 *    aucune raison de savoir ce qu est un RPC. Ce qui le concerne, c est que la lecture n a pas
 *    abouti et qu elle se retente.
 * ⛔ CE QUI NE CHANGE PAS : la SEMANTIQUE. « Dead » reste dit sur le meme fait mesure — le createur
 *    a DETENU puis est tombe a zero — parce que 40 createurs sur 43 a zero n ont jamais rien
 *    detenu, et les confondre accuserait des gens a tort. Seule la formulation change. */
export const STADES_HORS_PALIER = Object.freeze([
  /* ⛔ LE TITRE NOMMAIT L ETH ALORS QUE LE GROUPE CONTIENT AUSSI DES BLOCKS COTES AILLEURS (2026-09-25) :
   *    « waiting on the ETH price » devant un block cote en cbBTC dit une fausse cause. Il dit maintenant
   *    ce qui manque : un prix en dollars POUR LA DEVISE DE CE BLOCK, quelle qu elle soit. */
  { cle: 'PRIX_NON_LU', titre: 'Tier pending — waiting on a USD price for its currency' },
  { cle: 'NOURRI', titre: 'Awake — no market yet, fed by its community' },
  { cle: 'SANS_MARCHE', titre: 'No market yet — it has never been traded' },
  { cle: 'NON_LU', titre: 'Market not read — our reader did not come back' },
  /* ⛔⛔ LE GROUPE QUI MANQUAIT, et il contenait la grande majorite. Mesure du 2026-09-25 : 180
   *     blocks etiquetes « Market not read », dont 162 que RIEN n a jamais lus. Les ranger sous
   *     « our reader did not come back » accusait notre lecteur d une panne qui n a pas eu lieu, et
   *     surtout envoyait vers « Retry » — un geste sans objet quand aucune lecture n a ete tentee.
   *     Le bon geste, lui, est d ouvrir le block : c est ce qui declenche sa lecture. */
  { cle: 'PAS_REGARDE', titre: 'Not looked at yet — open one to read its market' },
  { cle: 'MORT', titre: 'Gone quiet — its creator held it, and holds none now' },
]);
/* ⛔⛔ UN EMOJI QUI NE S AFFICHE PAS N EST PAS UN EMOJI (Phil, 2026-09-17 : capture d un carre vide a la
 * place de 🪵 devant « ARC · Trunk »). 🪵 (Emoji 12.0, 2019) et 🏞 manquent dans les polices de
 * plusieurs systemes Windows : ils sortent en tofu. Ici, uniquement des caracteres d Emoji 1.0 (2015),
 * presents partout — et la progression reste lisible : bosquet, arbre, palmier, feuille, herbe, pousse. */
export const EMOJI_STADE = Object.freeze({ MONUMENT: '🏛', FORET: '🌲', CANOPEE: '🌳', TRONC: '🌴', BRANCHE: '🍃', POUSSE: '🌿',
  GRAINE: '🌱', PRIX_NON_LU: '⏳', NOURRI: '✨', SANS_MARCHE: '💤', NON_LU: '⏳', PAS_REGARDE: '·', MORT: '⚫' });

/**
 * LE PRIX EN DOLLARS D UNE DEVISE DE COTATION — ou `null`, jamais un chiffre devine.
 * ⛔⛔ TROIS SOURCES, DANS CET ORDRE, ET AUCUNE QUATRIEME :
 *   1. ETH : le prix ETH/USD mesure que l appelant passe (`ethUsd`).
 *   2. un prix lu par l appelant pour cette devise (`prixUsdParDevise`, symbole -> dollars). C est
 *      l equivalent de `prixDeviseUsd` que `peindreJeu` recoit deja dans l app, lu sur /api/prix-usd.
 *      ⚠️ AUCUN APPELANT NE LE PASSE ENCORE : le dire ici plutot que de le laisser croire.
 *   3. une devise de type STABLE du registre `paires.js` : parite 1 $. ⚠️ C EST UNE HYPOTHESE, et c est
 *      la MEME que celle deja prise par l app (son convertisseur rend 1 pour l adresse de l USDC, et
 *      `vieEnUsd` rend la vie telle quelle en USDC). Elle est ici pour ne pas etre plus faible que
 *      l ecran, pas parce qu un depeg serait impossible.
 * ⛔ UNE DEVISE NON NOMMEE N EST PAS DE L ETH. Sans nom de devise, on ne convertit pas : convertir au
 *    prix de l ETH une vie libellee on ne sait pas en quoi rangerait le block dans un faux palier.
 *    (L app, elle, traite `!devise` comme de l ETH dans `vieEnUsd` — ici on reste ferme.)
 * ⛔ cbBTC, les actions tokenisees : PAS de prix sans (2). Elles restent « prix non lu » — une lecture
 *    qui n a pas eu lieu, jamais un zero.
 * @param {string|null|undefined} devise symbole rendu par `marche.js` ('ETH', 'USDC', 'cbBTC', 'AAPLc'…)
 * @param {number|null} ethUsd prix ETH/USD mesure
 * @param {Record<string, number>|null} prixUsdParDevise prix en dollars deja lus par l appelant
 * @returns {number|null}
 */
export function prixUsdDeLaDevise(devise, ethUsd = null, prixUsdParDevise = null) {
  const bon = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (devise === 'ETH') return bon(ethUsd) ? ethUsd : null;
  if (!devise || typeof devise !== 'string') return null;
  if (prixUsdParDevise && Object.prototype.hasOwnProperty.call(prixUsdParDevise, devise)) {
    const p = prixUsdParDevise[devise];
    if (bon(p)) return p;
  }
  const connue = pairesProposees(8453).find((q) => q.symbole === devise);
  return connue && connue.type === 'STABLE' ? 1 : null;
}

/**
 * ⛔ DEUXIEME SOURCE DE CAP (2026-09-17) : notre noeud ne lit la vie que des premiers blocks — en prod
 *    251 blocks tombaient dans « market unread » alors que le marche public en cote plus de 200. Un
 *    `capUsdMarche` (FDV lue par le serveur chez DexScreener) juge alors le palier, et le block porte
 *    `source:'MARCHE'`. Ce n est PAS une lecture on-chain : l appelant doit le dire a l ecran.
 * ⛔ PRIORITE INCHANGEE : une vie LUE on-chain gagne toujours ; le marche ne sert qu a ce qu on n a
 *    pas lu. Sans aucune des deux, le block reste dans NON_LU — jamais range en Seed.
 * @param {{ blocks: {adr:string, sym?:string|null, vie?:number|null, devise?:string|null, etatVie?:string|null,
 *   capUsdMarche?:number|null,
 *   nourriture?:{etat:string, gm:number, messages:number, detenteurs:number, mort:boolean|null}|null}[], ethUsd: number|null,
 *   prixUsdParDevise?: Record<string, number>|null }} o `devise` est le symbole rendu par `marche.js` ; `prixUsdParDevise`
 *   porte les prix en dollars que l appelant a su lire pour les devises autres que l ETH (facultatif).
 * @returns {{ groupes: {cle:string, titre:string, blocks:{adr:string, sym:string|null, capUsd:number|null, pct:number|null,
 *   prochain:string|null, source:string}[]}[], total:number, parMarche:number }}
 */
export function stadesDesBlocks({ blocks, ethUsd = null, prixUsdParDevise = null }) {
  const par = new Map();
  const mettre = (cle, b) => { if (!par.has(cle)) par.set(cle, []); par.get(cle).push(b); };
  let total = 0, parMarche = 0;
  for (const x of Array.isArray(blocks) ? blocks : []) {
    if (!x || !/^0x[0-9a-fA-F]{40}$/.test(String(x.adr))) continue;
    total++;
    const n = x.nourriture && x.nourriture.etat === 'LUE' ? x.nourriture : null;
    /* ⛔ PHIL (2026-09-14) : « ne donne pas les noms, on a deja trop de monde — nos blocks du launcher en priorite » */
    const base = { adr: String(x.adr).toLowerCase(), sym: x.sym || null, nous: x.nous === true, capUsd: null, pct: null, prochain: null, source: 'RIEN' };
    if (n && n.mort === true) { mettre('MORT', base); continue; }
    const vieLue = x.etatVie === 'LUE' && typeof x.vie === 'number' && Number.isFinite(x.vie) && x.vie > 0;
    if (vieLue) {
      /* ⛔ LA VIE EST LIBELLEE DANS LA DEVISE DE SA POOL : elle est convertie par le prix de CETTE devise. */
      const prixDevise = prixUsdDeLaDevise(x.devise, ethUsd, prixUsdParDevise);
      const capUsd = prixDevise === null ? null : x.vie * prixDevise;
      const p = capUsd === null ? null : progressionPalier(capUsd);
      if (p && p.etat === 'LU') {
        mettre(p.palier.cle, { ...base, capUsd, pct: p.prochain ? p.pct : null, prochain: p.prochain ? p.prochain.titre : null, source: 'CHAINE' });
        continue;
      }
      /* ⛔⛔ PAS DE CUL-DE-SAC ICI (2026-09-25). L ancien code faisait `continue` vers PRIX_NON_LU sans jamais
       *     essayer la FDV du marche public — alors qu elle est DEJA EN DOLLARS et n a besoin d aucun prix de
       *     devise. Un block cote en cbBTC avec une FDV publique lue restait « prix non lu » pour rien.
       *     On ne conclut donc pas ici : on laisse la seconde source parler, et PRIX_NON_LU reste le mot final
       *     si elle ne dit rien non plus (voir plus bas) — jamais NON_LU, car la vie, elle, a bien ete lue. */
    }
    /* seconde source : la FDV du marche public, quand notre noeud n a pas lu ce block */
    const capMarche = typeof x.capUsdMarche === 'number' && Number.isFinite(x.capUsdMarche) && x.capUsdMarche > 0
      ? x.capUsdMarche : null;
    if (capMarche !== null) {
      const p = progressionPalier(capMarche);
      if (p.etat === 'LU') {
        parMarche++;
        mettre(p.palier.cle, { ...base, capUsd: capMarche, pct: p.prochain ? p.pct : null,
          prochain: p.prochain ? p.prochain.titre : null, source: 'MARCHE' });
        continue;
      }
    }
    /* ⛔ VIE LUE, MAIS PAS DE PRIX POUR SA DEVISE ET PAS DE FDV : « palier en attente d un prix », et surtout
     *    PAS « marche non lu ». Le marche de ce block a ete lu — c est NOTRE prix de devise qui manque, et la
     *    difference entre les deux phrases est celle entre accuser le block et nommer notre limite. */
    if (vieLue) { mettre('PRIX_NON_LU', base); continue; }
    if (x.etatVie === 'NON_TROUVEE') {
      mettre(n && n.gm + n.messages + n.detenteurs > 0 ? 'NOURRI' : 'SANS_MARCHE', base);
      continue;
    }
    /* ⛔⛔ « ON A ESSAYE ET RATE » N EST PAS « ON N A JAMAIS REGARDE », et l ecran disait le premier
     *     pour les deux. Mesure du 2026-09-25 en production : 180 blocks marques « Market not read »
     *     dans le selecteur, dont CENT SOIXANTE-DEUX qui ne sont sur aucune carte — donc qu aucun
     *     lecteur n a jamais lus. Le titre « our reader did not come back » affirmait qu un lecteur
     *     etait parti sans revenir : faux pour 162 d entre eux, et il accusait notre infrastructure
     *     d une panne qui n a jamais eu lieu.
     *   ⛔ `NON_LUE` = une lecture a ETE TENTEE et a echoue ; la, « retry » a un sens.
     *     `undefined` = on n a pas encore regarde ; il n y a rien a reessayer, il faut l ouvrir.
     *     Deux etats, deux phrases, deux gestes. */
    mettre(x.etatVie === 'NON_LUE' ? 'NON_LU' : 'PAS_REGARDE', base);
  }
  const ordre = [...PALIERS].reverse().map((p) => ({ cle: p.cle, titre: p.titre }))
    .concat(STADES_HORS_PALIER.map((s) => ({ cle: s.cle, titre: s.titre })));
  const groupes = [];
  for (const g of ordre) {
    const l = par.get(g.cle);
    if (!l || !l.length) continue;
    l.sort((a, b) => Number(b.nous) - Number(a.nous) || (b.capUsd ?? -1) - (a.capUsd ?? -1) || String(a.sym || '').localeCompare(String(b.sym || '')));
    groupes.push({ cle: g.cle, titre: g.titre, blocks: l, nous: l.filter((b) => b.nous).length, autres: l.filter((b) => !b.nous).length });
  }
  return { groupes, total, parMarche };
}
