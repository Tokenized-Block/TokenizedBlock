// test-boucle-pot.mjs — le cycle complet, joue contre une chaine simulee.
//
// ⛔ CE QUE CE FICHIER GARDE AVANT TOUT : que la boucle REFUSE. Un cycle de recompense qui propose
//    une transaction quand il ne devrait pas grave une racine pour toujours ; un cycle qui refuse
//    a tort ne coute qu un tour. Les refus sont donc testes un par un, avec leur raison.
// RPC simule : rien ne part sur un reseau.
import assert from 'node:assert/strict';
import { tour, preparerAncrage, decoderPeriode, lirePeriodes, prepararAlimentation,
  arbreDUnePeriodeAncree, SEL } from './boucle-pot.js';
import { feuille, verifierPreuve } from './merkle-pot.js';
import { TOPIC_TRANSFER, ADRESSE_ZERO } from './soldes-jeton.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const POT = '0xc743f6aaff2c4cad67c30b9e5d1af0e913fce272';
const JETON = '0xb2000000000000000000006d6f9102e9e4b221e0';
const POOL = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const A = '0x' + 'a1'.repeat(20);
const B = '0x' + 'b2'.repeat(20);
const GRAINE = '0xabf6a4d51183d44f4fbd1444053932b1145de01d34fb9f8a1db7563f03813043';
const PLANCHER = 1000;

const m32 = (v) => BigInt(v).toString(16).padStart(64, '0');
const motAdr = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const logT = (bloc, de, vers, v) => ({ blockNumber: '0x' + bloc.toString(16),
  topics: [TOPIC_TRANSFER, '0x' + motAdr(de), '0x' + motAdr(vers)], data: '0x' + m32(v) });

/**
 * Une chaine simulee : des periodes, des logs Transfer, un totalSupply, un depot.
 * ⛔ Elle repond AUX MEMES selecteurs que le vrai contrat — sinon le test validerait une fiction.
 */
function chaine({ tete, periodes, logs, supply, depose, mixHash = GRAINE }) {
  return async (methode, params) => {
    if (methode === 'eth_blockNumber') return '0x' + tete.toString(16);
    if (methode === 'eth_getBlockByNumber') return { mixHash };
    if (methode === 'eth_getLogs') {
      const p = params[0];
      const de = parseInt(p.fromBlock, 16), a = parseInt(p.toBlock, 16);
      const mintSeul = (p.topics || []).length > 1;
      return logs.filter((l) => {
        const b = parseInt(l.blockNumber, 16);
        if (b < de || b > a) return false;
        return mintSeul ? l.topics[1] === '0x' + motAdr(ADRESSE_ZERO) : true;
      });
    }
    if (methode === 'eth_call') {
      const d = params[0].data;
      if (d.startsWith(SEL.nombreDePeriodes)) return '0x' + m32(periodes.length);
      if (d.startsWith(SEL.periodes)) {
        const i = Number(BigInt('0x' + d.slice(10, 74)));
        const p = periodes[i];
        return '0x' + m32(p.debut) + m32(p.fin) + m32(p.ancreeLe) + m32(p.cible || 0) + (p.graine || m32(0));
      }
      if (d.startsWith(SEL.depose)) return '0x' + m32(depose);
      if (d.startsWith('0x18160ddd')) return '0x' + m32(supply);
    }
    throw new Error('appel non simule : ' + methode + ' ' + JSON.stringify(params).slice(0, 80));
  };
}

// ══ 1. LE DECODEUR DE PERIODE ═══════════════════════════════════════════════════════════════════
{
  const d = '0x' + m32(100) + m32(200) + m32(0) + m32(0) + m32(0);
  const p = decoderPeriode(d, 3);
  eq(p.id, 3, 'l id vient de l appelant, pas des donnees');
  eq(p.debut, 100, 'debut'); eq(p.fin, 200, 'fin'); eq(p.ancreeLe, 0, 'pas encore ancree');
  // ⛔ TEMOIN : des donnees tronquees rendent null, jamais une periode a moitie remplie.
  eq(decoderPeriode('0x' + m32(1) + m32(2), 0), null, 'donnees tronquees -> null');
  eq(decoderPeriode('0x', 0), null, 'donnees vides -> null');
}

// ══ 2. AUCUNE PERIODE : la boucle propose d en OUVRIR une ═══════════════════════════════════════
{
  const rpc = chaine({ tete: 5000, periodes: [], logs: [], supply: 1000n, depose: 0n });
  const r = await tour({ rpc, pot: POT, jetonHolders: JETON, jetonRecompense: JETON, plancher: PLANCHER });
  eq(r.action, 'OUVRIR', 'rien n existe : on ouvre');
  eq(r.aSigner.to, POT, 'la transaction vise le pot');
  eq(r.aSigner.value, '0x0', 'et n envoie aucune valeur');
  ok(r.valideJusqua > 5000, 'avec une date limite dans le futur');
  ok(!r.arbre, 'et aucun arbre : il n y a rien a ancrer');
}

// ══ 3. UNE PERIODE EN COURS : on ATTEND, et on dit combien ══════════════════════════════════════
{
  const rpc = chaine({ tete: 5000, periodes: [{ debut: 4000, fin: 6000, ancreeLe: 0 }], logs: [], supply: 1000n, depose: 0n });
  const r = await tour({ rpc, pot: POT, jetonHolders: JETON, jetonRecompense: JETON, plancher: PLANCHER });
  eq(r.action, 'ATTENDRE', 'la periode court encore');
  eq(r.blocsRestants, 1000, 'et il reste 1000 blocs');
  ok(!r.aSigner, 'rien a signer');
}

// ══ 4. LE CYCLE COMPLET : periode finie -> graine -> cible -> soldes -> arbre -> ANCRER ═════════
{
  // ⛔ FIXTURE CORRIGEE : la premiere version faisait envoyer 1000 a une pool qui n avait recu que
  //    999 -> solde -1, impossible sur un ERC-20. Le code a refuse, a raison ; c etait le TEST qui
  //    decrivait une chaine qui ne peut pas exister.
  const logs = [logT(1500, ADRESSE_ZERO, POOL, 2000n), logT(1600, POOL, A, 600n), logT(1700, POOL, B, 400n)];
  const rpc = chaine({ tete: 5000, periodes: [{ debut: 2000, fin: 4000, ancreeLe: 0 }],
    logs, supply: 2000n, depose: 1000n });
  const r = await tour({ rpc, pot: POT, jetonHolders: JETON, jetonRecompense: JETON, plancher: PLANCHER });
  eq(r.action, 'ANCRER', 'une periode finie et non ancree : on ancre');
  ok(r.arbre, 'et la boucle rend l arbre');
  ok(r.arbre.cible >= 2000 && r.arbre.cible <= 4000, 'la cible tombe DANS la periode : ' + r.arbre.cible);
  eq(r.arbre.graine, GRAINE, 'la graine est celle du bloc de fin');
  eq(r.arbre.preuves.length, 2, 'deux detenteurs payables — la pool est exclue');
  eq(r.arbre.total, '1000', 'le total distribue est le depot du pot');

  // ⛔ CHAQUE PREUVE EST REJOUEE, comme la boucle le fait elle-meme avant de proposer.
  let bonnes = 0;
  for (const p of r.arbre.preuves) {
    const f = feuille({ id: 0, jeton: JETON, compte: p.compte, montant: BigInt(p.montant) });
    if (verifierPreuve({ feuille: f, preuve: p.preuve, racine: r.arbre.racine })) bonnes++;
  }
  eq(bonnes, 2, 'les deux preuves se rejouent jusqu a la racine');

  // ⛔ LE TEMOIN QUI COMPTE : la POOL n est PAS payee, alors qu elle detient la majorite.
  ok(!r.arbre.preuves.some((p) => p.compte === POOL), 'la pool du marche ne recoit rien');
  const somme = r.arbre.preuves.reduce((s, p) => s + BigInt(p.montant), 0n);
  eq(somme, 1000n, 'et la somme des parts vaut exactement le pot');
}

// ══ 5. LES REFUS DE LA BOUCLE — chacun nomme ════════════════════════════════════════════════════
{
  const finie = [{ debut: 2000, fin: 4000, ancreeLe: 0 }];

  /* pas de detenteur hors pool : on ne grave rien */
  const seule = chaine({ tete: 5000, periodes: finie, logs: [logT(1500, ADRESSE_ZERO, POOL, 1000n)],
    supply: 1000n, depose: 1000n });
  const r1 = await tour({ rpc: seule, pot: POT, jetonHolders: JETON, jetonRecompense: JETON, plancher: PLANCHER });
  eq(r1.action, 'REFUS', 'tout est dans la pool : personne a payer');
  ok(/personne ne detient|incomplete/.test(r1.pourquoi), 'et la raison le dit : ' + r1.pourquoi);

  /* pot vide : rien a partager */
  const vide = chaine({ tete: 5000, periodes: finie,
    logs: [logT(1500, ADRESSE_ZERO, POOL, 600n), logT(1600, POOL, A, 400n)], supply: 600n, depose: 0n });
  const r2 = await tour({ rpc: vide, pot: POT, jetonHolders: JETON, jetonRecompense: JETON, plancher: PLANCHER });
  eq(r2.action, 'REFUS', 'pot vide : on n ancre pas');

  /* somme differente du totalSupply : la reconstruction est fausse, on refuse */
  const faux = chaine({ tete: 5000, periodes: finie,
    logs: [logT(1500, ADRESSE_ZERO, POOL, 600n), logT(1600, POOL, A, 400n)], supply: 999n, depose: 1000n });
  const r3 = await tour({ rpc: faux, pot: POT, jetonHolders: JETON, jetonRecompense: JETON, plancher: PLANCHER });
  eq(r3.action, 'REFUS', 'somme != totalSupply au bloc tire : refus');
  ok(/differs from totalSupply/.test(r3.pourquoi), 'avec la raison exacte');

  /* graine nulle : la periode est annulee, jamais devinee */
  const sansGraine = chaine({ tete: 5000, periodes: finie,
    logs: [logT(1500, ADRESSE_ZERO, POOL, 600n), logT(1600, POOL, A, 400n)],
    supply: 1000n, depose: 1000n, mixHash: '0x' + '0'.repeat(64) });
  const r4 = await tour({ rpc: sansGraine, pot: POT, jetonHolders: JETON, jetonRecompense: JETON, plancher: PLANCHER });
  eq(r4.action, 'REFUS', 'graine nulle : refus');
  ok(/tirage impossible/.test(r4.pourquoi), 'et on dit que le tirage est impossible');

  /* jeton jamais mint avant la cible : naissance introuvable */
  const sansMint = chaine({ tete: 5000, periodes: finie, logs: [], supply: 0n, depose: 1000n });
  const r5 = await tour({ rpc: sansMint, pot: POT, jetonHolders: JETON, jetonRecompense: JETON, plancher: PLANCHER });
  eq(r5.action, 'REFUS', 'aucune naissance : refus');
}

// ══ 6. UNE LECTURE RATEE N EST JAMAIS UNE LISTE VIDE ════════════════════════════════════════════
// ⛔ Si lirePeriodes rendait [] sur une lecture ratee, la boucle proposerait d OUVRIR une periode
//    alors qu une autre attend peut-etre son ancrage. Le refus doit remonter.
{
  const casse = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x1388';
    if (m === 'eth_call' && p[0].data.startsWith(SEL.nombreDePeriodes)) return '0x' + m32(2);
    if (m === 'eth_call' && p[0].data.startsWith(SEL.periodes)) return '0x'; /* illisible */
    throw new Error('non simule');
  };
  eq(await lirePeriodes({ rpc: casse, pot: POT }), null, 'une periode illisible rend null');
  const r = await tour({ rpc: casse, pot: POT, jetonHolders: JETON, jetonRecompense: JETON, plancher: PLANCHER });
  eq(r.action, 'REFUS', 'et la boucle refuse plutot que d ouvrir a l aveugle');
  ok(/liste trouee/.test(r.pourquoi), 'en disant pourquoi');
}

// ══ 7. L ALIMENTATION RAPPELLE L APPROBATION ════════════════════════════════════════════════════
{
  const a = prepararAlimentation({ pot: POT, id: 0, jeton: JETON, montant: 500n });
  eq(a.aSigner.to, POT, 'la transaction vise le pot');
  eq(a.aSigner.value, '0x0', 'un versement ERC-20 n envoie pas de valeur');
  ok(/approve\(/.test(a.prealable), 'et le prealable rappelle l approbation');
  const e = prepararAlimentation({ pot: POT, id: 0, jeton: JETON, montant: 7n, estEth: true });
  eq(e.aSigner.value, '0x7', 'en ETH, le montant voyage dans la value');
  ok(!e.prealable, 'et aucune approbation n est necessaire');
}

// ══ 8. ON DOIT POUVOIR NOUS CONTREDIRE ═════════════════════════════════════════════════════════
// ⛔ C EST LA PROPRIETE LA PLUS IMPORTANTE DU SYSTEME. Le contrat ne peut verifier ni la graine ni
//    la racine ; le delai de contestation de 6 h n a de sens que si quelqu un peut RECALCULER et
//    constater un desaccord. Ces tests prouvent que le recalcul MORD.
{
  const logs = [logT(1500, ADRESSE_ZERO, POOL, 2000n), logT(1600, POOL, A, 600n), logT(1700, POOL, B, 400n)];
  const rpc = chaine({ tete: 9000, periodes: [], logs, supply: 2000n, depose: 1000n });
  /* une periode ancree honnetement : cible = celle que la graine produit */
  const { blocDeSnapshot } = await import('./regle-snapshot.js');
  const tirage = blocDeSnapshot({ debut: 2000, fin: 4000, graine: GRAINE });
  const honnete = { id: 0, debut: 2000, fin: 4000, ancreeLe: 12345, cible: tirage.cible, graine: GRAINE };

  const bon = await arbreDUnePeriodeAncree({ rpc, pot: POT, periode: honnete, jetonHolders: JETON, jetonRecompense: JETON,
    plancher: PLANCHER, totalAncre: 1000n });
  ok(bon.ok, 'un ancrage honnete se recalcule : ' + (bon.pourquoi || ''));
  eq(bon.cible, tirage.cible, 'et il tombe sur la meme cible');

  /* ⛔ LE MEME ARBRE, AVEC LA RACINE ANCREE : doit concorder */
  const avecRacine = await arbreDUnePeriodeAncree({ rpc, pot: POT, periode: honnete, jetonHolders: JETON, jetonRecompense: JETON,
    plancher: PLANCHER, totalAncre: 1000n, racineAncree: bon.racine });
  ok(avecRacine.ok, 'la racine recalculee egale la racine ancree');

  /* ⛔ UNE CIBLE TRUQUEE EST ATTRAPEE : elle ne decoule pas de la graine stockee. */
  const cibleTruquee = { ...honnete, cible: honnete.cible + 1 };
  const r1 = await arbreDUnePeriodeAncree({ rpc, pot: POT, periode: cibleTruquee, jetonHolders: JETON, jetonRecompense: JETON,
    plancher: PLANCHER, totalAncre: 1000n });
  ok(!r1.ok, 'une cible qui ne decoule pas de la graine est REFUSEE');
  ok(/not what the stored seed produces/.test(r1.pourquoi), 'et la raison le nomme : ' + r1.pourquoi);

  /* ⛔ UNE RACINE TRUQUEE EST ATTRAPEE : elle ne decrit pas les soldes reels. */
  const r2 = await arbreDUnePeriodeAncree({ rpc, pot: POT, periode: honnete, jetonHolders: JETON, jetonRecompense: JETON,
    plancher: PLANCHER, totalAncre: 1000n, racineAncree: '0x' + 'ab'.repeat(32) });
  ok(!r2.ok, 'une racine qui ne correspond pas aux soldes est REFUSEE');
  ok(/does not match the anchored root/.test(r2.pourquoi), 'et on dit exactement quoi');
  ok(r2.racineRecalculee && r2.racineAncree, 'en rendant LES DEUX racines, pour qu on puisse juger');

  /* une periode pas encore ancree ne sert aucune preuve */
  const pasAncree = { ...honnete, ancreeLe: 0 };
  const r3 = await arbreDUnePeriodeAncree({ rpc, pot: POT, periode: pasAncree, jetonHolders: JETON, jetonRecompense: JETON, plancher: PLANCHER });
  ok(!r3.ok, 'une periode non ancree ne rend pas de preuve');
  ok(/not anchored yet/.test(r3.pourquoi), 'et le dit');

  /* ⛔ LE TOTAL ANCRE, PAS LE SOLDE DU MOMENT. Si on rebatissait sur le depot courant, les parts
   *    changeraient a chaque reclamation et plus aucune preuve ne serait valable. */
  const potEntame = chaine({ tete: 9000, periodes: [], logs, supply: 2000n, depose: 400n });
  const apresReclamations = await arbreDUnePeriodeAncree({ rpc: potEntame, pot: POT, periode: honnete,
    jetonHolders: JETON, jetonRecompense: JETON, plancher: PLANCHER, totalAncre: 1000n, racineAncree: bon.racine });
  ok(apresReclamations.ok, 'le pot entame ne change pas l arbre : on rebatit sur le TOTAL ANCRE');
}

// ══ 9. DEUX JETONS, DEUX ROLES — LE BUG QUI ALLAIT COUTER UN TOUR ENTIER ═══════════════════════
// ⛔⛔ MESURE SUR LA CHAINE (2026-09-20) : depose[periode 0][ETH] = 300 000 000 000 000 wei et
//    depose[periode 0][OK] = 0. Le code utilisait UN SEUL parametre pour QUI detient et EN QUOI on
//    paie. A la fin de la periode, il aurait lu le pot dans la mauvaise devise et refuse avec
//    « le pot est vide » — techniquement vrai, completement faux pour la situation.
{
  const RECOMPENSE = '0x0000000000000000000000000000000000000000';
  const logs = [logT(1500, ADRESSE_ZERO, POOL, 2000n), logT(1600, POOL, A, 600n), logT(1700, POOL, B, 400n)];
  /* une chaine ou le pot est alimente en RECOMPENSE, et VIDE dans le jeton des holders */
  const parDevise = (m, p) => {
    if (m === 'eth_call' && p[0].data.startsWith(SEL.depose)) {
      const dem = p[0].data.slice(74).toLowerCase();
      const estRecompense = dem.endsWith(RECOMPENSE.slice(2));
      return '0x' + m32(estRecompense ? 1000 : 0);
    }
    return null;
  };
  const base = chaine({ tete: 5000, periodes: [{ debut: 2000, fin: 4000, ancreeLe: 0 }],
    logs, supply: 2000n, depose: 0n });
  const rpc2 = async (m, p) => { const v = parDevise(m, p); return v !== null ? v : base(m, p); };

  // ⛔ LE TEMOIN : avec UN SEUL jeton (l ancien comportement), le pot est vide -> REFUS.
  const ancien = await tour({ rpc: rpc2, pot: POT, jetonHolders: JETON, jetonRecompense: JETON,
    plancher: PLANCHER });
  eq(ancien.action, 'REFUS', 'un seul jeton : le pot parait vide, on refuse (le bug)');

  // ✅ Avec les DEUX jetons separes, l ancrage part.
  const bon = await tour({ rpc: rpc2, pot: POT, jetonHolders: JETON, jetonRecompense: RECOMPENSE,
    plancher: PLANCHER });
  eq(bon.action, 'ANCRER', 'deux jetons : on trouve le pot dans la bonne devise');
  eq(bon.arbre.total, '1000', 'et on distribue ce qu il contient vraiment');
}

// ══ 10. UN JETON MANQUANT EST UN REFUS NOMME, PAS UN DEFAUT SILENCIEUX ═════════════════════════
// ⛔ Faire retomber la recompense sur le jeton des holders reproduirait le bug EN SILENCE.
{
  const logs = [logT(1500, ADRESSE_ZERO, POOL, 2000n), logT(1600, POOL, A, 600n)];
  const rpc3 = chaine({ tete: 5000, periodes: [{ debut: 2000, fin: 4000, ancreeLe: 0 }],
    logs, supply: 2000n, depose: 1000n });
  const sansRec = await tour({ rpc: rpc3, pot: POT, jetonHolders: JETON, plancher: PLANCHER });
  eq(sansRec.action, 'REFUS', 'jetonRecompense manquant : REFUS');
  ok(/jetonRecompense manquant/.test(sansRec.pourquoi), 'et le parametre est NOMME');
  const sansHold = await tour({ rpc: rpc3, pot: POT, jetonRecompense: JETON, plancher: PLANCHER });
  eq(sansHold.action, 'REFUS', 'jetonHolders manquant : REFUS');
  ok(/jetonHolders manquant/.test(sansHold.pourquoi), 'et celui-la aussi');
}

// ══ 11. CE QUI NE VAUT PAS SON GAS ARRIVE JUSQU A L ECRAN DE SIGNATURE ════════════════════════
// ⛔⛔ MESURE SUR LA CHAINE (2026-09-20) : sur un block a 62 detenteurs, la plus petite part valait
//    2 849 507 902 wei contre ~20 000 000 000 000 wei de gas — 7 000 fois moins que son cout. Le
//    chiffre EXISTAIT dans `partsHolders` et etait jete par `preparerAncrage` : l ecran affichait
//    « 62 recipient(s) » sans un mot. Un chiffre juste mais absent n avertit personne, et une racine
//    gravee ne se reprend pas.
{
  const RECOMPENSE = '0x0000000000000000000000000000000000000001';
  /* ⛔ UN DETENTEUR A 1 UNITE SUR 1001 : sa part tombe a zero, il doit etre COMPTE et exclu. */
  const C = '0x' + 'c3'.repeat(20);
  const logs = [logT(1500, ADRESSE_ZERO, POOL, 2001n), logT(1600, POOL, A, 600n),
    logT(1650, POOL, B, 400n), logT(1700, POOL, C, 1n)];
  const rpc = chaine({ tete: 5000, periodes: [{ debut: 2000, fin: 4000, ancreeLe: 0 }],
    logs, supply: 2001n, depose: 1000n });
  const t = await tour({ rpc, pot: POT, jetonHolders: JETON, jetonRecompense: RECOMPENSE,
    plancher: PLANCHER });
  eq(t.action, 'ANCRER', 'la periode est finie et le pot est plein : on ancre');
  eq(t.arbre.preuves.length, 2, 'deux destinataires payables');
  eq(t.arbre.aZero, 1, 'le detenteur a part nulle est COMPTE dans l arbre rendu');
  eq(t.arbre.poussiere, 2, 'les deux parts sont sous le gas d une reclamation, et c est DIT');
  /* ⛔ 399 ET NON 400 : le reste d arrondi va au PLUS GROS (601 au lieu de 599). La plus petite part
   *    est donc la part plancher de B, 1000*400/1001 = 399. Mon attente de 400 etait fausse ; le code
   *    avait raison. Une attente calculee a la main vaut mieux qu une attente recopiee du code. */
  eq(String(t.arbre.plusPetite), '399', 'la plus petite part voyage jusqu a l ecran');
  // ⛔ TEMOIN : avec un pot enorme, plus aucune part n est de la poussiere.
  const gros = chaine({ tete: 5000, periodes: [{ debut: 2000, fin: 4000, ancreeLe: 0 }],
    logs, supply: 2001n, depose: 10n ** 20n });
  const tg = await tour({ rpc: gros, pot: POT, jetonHolders: JETON, jetonRecompense: RECOMPENSE,
    plancher: PLANCHER });
  eq(tg.arbre.poussiere, 0, 'temoin : un pot large ne produit aucune poussiere');
  eq(tg.arbre.aZero, 0, 'temoin : et plus personne ne tombe a zero');
}

console.log('test-boucle-pot : ' + n + ' assertions, OK');
