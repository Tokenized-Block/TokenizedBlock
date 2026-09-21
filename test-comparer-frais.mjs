// test-comparer-frais.mjs — prouver un CHANGEMENT sans l inventer.
//
// ⛔⛔ LE DEFAUT QUE CE FICHIER EXISTE POUR EMPECHER : attribuer un ecart a une cause qui n a pas
//    encore agi. Le V6 est deploye mais n a AUCUN marche ; une comparaison « avant / apres le
//    deploiement » mesurerait un ecart entierement produit par le V1 et le V2, et le presenterait
//    comme l effet du V6. Personne ne le verrait — le chiffre serait vrai, la conclusion fausse.
// RPC simule : rien ne part sur un reseau.
import assert from 'node:assert/strict';
import { agreger, comparer, VERDICTS, ETH_NATIF, BLOCS_PAR_JOUR } from './comparer-frais.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const pres = (a, b, m) => { assert.ok(Math.abs(a - b) < 1e-9, m + ' (' + a + ' vs ' + b + ')'); n++; };

const NOUS = new Set(['0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4']);
const ETRANGER = '0x' + 'cc'.repeat(20);
const ev = (tx, montant, hook = 'V1', devise = ETH_NATIF) => ({ tx, montant, hook, devise, bloc: 1 });

// ══ 1. LA NORMALISATION PAR JOUR — SANS ELLE, TOUT EST FAUX ════════════════════════════════════
// ⛔ Comparer 14 jours a 3 jours en brut multiplierait le « avant » par 4,7 sans que rien ne le dise.
{
  const a = agreger({ scan: { complet: true, evenements: [ev('0x1', 1000000000000000000n)] },
    blocs: BLOCS_PAR_JOUR * 2, aNous: NOUS });
  eq(a.jours, 2, 'deux jours');
  pres(a.evenementsParJour, 0.5, 'un evenement sur deux jours = 0,5 par jour');
  pres(a.ethParJour, 0.5, 'un ETH sur deux jours = 0,5 ETH par jour');
  const b = agreger({ scan: { complet: true, evenements: [ev('0x1', 1000000000000000000n)] },
    blocs: BLOCS_PAR_JOUR, aNous: NOUS });
  pres(b.ethParJour, 1, 'le MEME montant sur un jour = 1 ETH par jour');
  ok(a.ethParJour !== b.ethParJour, 'la duree change le taux — c est tout l objet de la normalisation');
}

// ══ 2. UN PAYEUR INCONNU N EST PAS UN EXTERNE ══════════════════════════════════════════════════
// ⛔⛔ C EST LE CHIFFRE QU ON A ENVIE DE VOIR MONTER. Ranger les payeurs illisibles parmi les
//    inconnus gonflerait la part externe exactement dans le sens qui nous arrange.
{
  const scan = { complet: true, evenements: [
    ev('0xA', 100n), ev('0xB', 100n), ev('0xC', 100n)] };
  const payeurs = new Map([['0xA', ETRANGER], ['0xB', [...NOUS][0]]]); /* 0xC : inconnu */
  const a = agreger({ scan, blocs: BLOCS_PAR_JOUR, aNous: NOUS, payeurParTx: payeurs });
  eq(a.evenements, 3, 'trois encaissements');
  eq(a.externes, 1, 'UN SEUL externe — le payeur illisible n est pas compte comme externe');
  eq(a.payeursExternesDistincts, 1, 'une adresse externe distincte');
}

// ══ 3. UNE FENETRE INCOMPLETE INVALIDE LA COMPARAISON ══════════════════════════════════════════
// ⛔ Un total PLANCHER compare a un total complet donne un ecart qui n existe pas. « Prudent » n est
//    pas une option : c est faux dans les deux sens.
{
  const plein = agreger({ scan: { complet: true, evenements: [ev('0x1', 10n)] }, blocs: BLOCS_PAR_JOUR });
  const troue = agreger({ scan: { complet: false, evenements: [ev('0x2', 10n)] }, blocs: BLOCS_PAR_JOUR });
  eq(comparer({ avant: troue, apres: plein, cause: 'V6', activiteCause: 5 }).verdict, 'INCOMPARABLE',
    'avant incomplet -> INCOMPARABLE');
  eq(comparer({ avant: plein, apres: troue, cause: 'V6', activiteCause: 5 }).verdict, 'INCOMPARABLE',
    'apres incomplet -> INCOMPARABLE');
  // ⛔ ET CE REFUS PASSE AVANT TOUS LES AUTRES : des donnees sans valeur ne valent rien non plus
  //    quand la cause n a pas agi.
  eq(comparer({ avant: troue, apres: plein, cause: 'V6', activiteCause: 0 }).verdict, 'INCOMPARABLE',
    'incomplet ET sans cause -> c est l incompletude qui parle en premier');
}

// ══ 4. LE COEUR : UNE CAUSE QUI N A PAS AGI NE S ATTRIBUE RIEN ═════════════════════════════════
// ⛔⛔ LE V6 EST DEPLOYE ET N A AUCUN MARCHE. Sans ce refus, on lui attribuerait la variation du V1.
{
  const avant = agreger({ scan: { complet: true, evenements: [ev('0x1', 10n)] }, blocs: BLOCS_PAR_JOUR });
  const apres = agreger({ scan: { complet: true, evenements: [ev('0x2', 50n), ev('0x3', 50n)] },
    blocs: BLOCS_PAR_JOUR });
  const sansCause = comparer({ avant, apres, cause: 'V6', activiteCause: 0 });
  eq(sansCause.verdict, 'PAS_DE_CAUSE', 'zero activite de la cause -> PAS_DE_CAUSE');
  ok(/vient donc d ailleurs/.test(sansCause.pourquoi), 'et la raison le dit : ' + sansCause.pourquoi);
  ok(sansCause.ethParJour === undefined, 'AUCUN ecart n est publie quand la cause n a pas agi');

  // ⛔ TEMOIN : les MEMES donnees, avec une cause qui a agi, donnent bien une comparaison.
  const avecCause = comparer({ avant, apres, cause: 'V6', activiteCause: 2 });
  eq(avecCause.verdict, 'COMPARABLE', 'des que la cause a agi, la comparaison est rendue');
  ok(avecCause.ethParJour.ecart > 0, 'et l ecart est calcule : ' + avecCause.ethParJour.ecart);
  ok(/n est qu une des choses qui ont change/.test(avecCause.borne),
    'la borne rappelle qu un ecart ne prouve pas une cause');
}

// ══ 5. « ZERO APRES » N EST PAS « CA A BAISSE », ET « ZERO AVANT » N EST PAS UNE BASE ══════════
{
  const vide = agreger({ scan: { complet: true, evenements: [] }, blocs: BLOCS_PAR_JOUR });
  const plein = agreger({ scan: { complet: true, evenements: [ev('0x1', 10n)] }, blocs: BLOCS_PAR_JOUR });
  eq(comparer({ avant: vide, apres: vide, cause: 'V6', activiteCause: 0 }).verdict, 'AUCUNE_ACTIVITE',
    'deux fenetres vides -> AUCUNE_ACTIVITE, pas une baisse de 100 %');
  eq(comparer({ avant: vide, apres: plein, cause: 'V6', activiteCause: 1 }).verdict, 'PAS_DE_BASE',
    'rien avant -> PAS_DE_BASE, pas une hausse infinie');
}

// ══ 6. LA PART EXTERNE SE COMPARE EN POINTS, ET null N EST PAS ZERO ════════════════════════════
{
  const mk = (nExt, total) => {
    const evs = [], payeurs = new Map();
    for (let i = 0; i < total; i++) {
      const tx = '0x' + i;
      evs.push(ev(tx, 1000000000000000000n));
      payeurs.set(tx, i < nExt ? ETRANGER : [...NOUS][0]);
    }
    return agreger({ scan: { complet: true, evenements: evs }, blocs: BLOCS_PAR_JOUR,
      aNous: NOUS, payeurParTx: payeurs });
  };
  const avant = mk(1, 4);   /* 25 % */
  const apres = mk(3, 4);   /* 75 % */
  pres(avant.partExternePourCent, 25, 'un quart des frais vient de l exterieur');
  pres(apres.partExternePourCent, 75, 'trois quarts apres');
  const c = comparer({ avant, apres, cause: 'V6', activiteCause: 4 });
  pres(c.partExternePourCent.ecart, 50, 'l ecart vaut 50 POINTS, pas 300 %');

  // ⛔ TEMOIN : sans aucun ETH, la part externe est null — pas zero. Zero se lirait « aucun externe ».
  const sansEth = agreger({ scan: { complet: true, evenements: [ev('0x1', 5n, 'V1', '0xb2' + '00'.repeat(19))] },
    blocs: BLOCS_PAR_JOUR, aNous: NOUS });
  eq(sansEth.partExternePourCent, null, 'aucun ETH -> null, jamais 0');
  eq(sansEth.ethParJour, 0, 'et le taux ETH est bien zero');
}

// ══ 7. LA LISTE DES VERDICTS EST FERMEE ════════════════════════════════════════════════════════
{
  eq(VERDICTS.length, 5, 'cinq verdicts, pas un de moins');
  for (const v of ['COMPARABLE', 'INCOMPARABLE', 'PAS_DE_CAUSE', 'PAS_DE_BASE', 'AUCUNE_ACTIVITE']) {
    ok(VERDICTS.includes(v), v + ' est declare');
  }
}

// ══ 8. « MESURE INCOMPLETE » ET « COMPLETUDE INCONNUE » NE SE DISENT PAS PAREIL ═══════════════
// ⛔⛔ CE QUI EST ARRIVE LE 2026-09-21 : l outil a rendu INCOMPARABLE en annoncant « des lectures
//    ont ete refusees par le noeud ». Les deux scans etaient COMPLETS — le vrai probleme etait que
//    le fichier de reference gele ne portait pas le drapeau. Un refus JUSTE avec une explication
//    FAUSSE envoie chercher du cote du noeud alors que la faute est dans notre fichier. Et on lui
//    fait confiance, donc il coute plus cher qu un refus muet.
{
  const base = { evenements: 1, evenementsParJour: 1, ethWallet: 10n, ethParJour: 1,
    externes: 0, payeursExternesDistincts: 0, ethExternes: 0n, partExternePourCent: 0,
    parHook: [], blocs: BLOCS_PAR_JOUR, jours: 1 };
  const bon = { ...base, complet: true };
  const mesureIncomplete = { ...base, complet: false };
  const completudeInconnue = { ...base };          /* complet ABSENT, pas false */

  const rIncomplet = comparer({ avant: mesureIncomplete, apres: bon, cause: 'V6', activiteCause: 3 });
  const rInconnu = comparer({ avant: completudeInconnue, apres: bon, cause: 'V6', activiteCause: 3 });
  eq(rIncomplet.verdict, 'INCOMPARABLE', 'une mesure incomplete refuse la comparaison');
  eq(rInconnu.verdict, 'INCOMPARABLE', 'une completude inconnue la refuse AUSSI');

  // ⛔ MAIS PAS AVEC LA MEME PHRASE — c est tout l objet de ce test.
  ok(rIncomplet.pourquoi !== rInconnu.pourquoi, 'les deux refus ne disent PAS la meme chose');
  ok(/refusees par le noeud/.test(rIncomplet.pourquoi), 'incomplet accuse le noeud : ' + rIncomplet.pourquoi);
  ok(/notre fichier/.test(rInconnu.pourquoi), 'inconnu nous accuse NOUS : ' + rInconnu.pourquoi);
  ok(!/refusees par le noeud/.test(rInconnu.pourquoi), 'et n accuse PAS le noeud a tort');

  // ⛔ LE COTE FAUTIF EST NOMME : chercher des deux cotes coute deux fois plus.
  eq(rIncomplet.etatAvant, 'incomplet', 'le cote AVANT est etiquete incomplet');
  eq(rIncomplet.etatApres, 'ok', 'et le cote APRES est dit sain');
  eq(rInconnu.etatAvant, 'inconnu', 'le cote AVANT est etiquete inconnu');

  const rApres = comparer({ avant: bon, apres: completudeInconnue, cause: 'V6', activiteCause: 3 });
  eq(rApres.etatApres, 'inconnu', 'et quand c est l APRES, c est l APRES qui est nomme');
  eq(rApres.etatAvant, 'ok', 'sans accuser l autre cote');
}

console.log('test-comparer-frais : ' + n + ' assertions, OK');
