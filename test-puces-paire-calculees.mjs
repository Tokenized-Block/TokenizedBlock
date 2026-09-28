/* test-puces-paire-calculees.mjs — LES PUCES DE PAIRE NE DOIVENT PLUS ETRE UNE PHOTO D UN JOUR.
 *
 * ⛔⛔ LE DEFAUT. `PAIRES_CHIP_QUICK` etait une constante : `['ETH','AAPLc','GOOGLc','NVDAc','METAc']`.
 *     Son PROPRE commentaire disait « CETTE LISTE EST UNE PHOTO D UN JOUR… a re-mesurer, pas a
 *     graver ». Deux jours plus tard elle etait fausse.
 *     RE-MESURE DU 2026-09-27, `/api/prix-usd` rejoue sur les dix actions du registre :
 *         HUIT ont un prix lisible — AAPLc, GOOGLc, METAc, MSFTc, MSTRc, NVDAc, SNDKc, SPCXc
 *         DEUX non — AMZNc (7 957 $ de liquidite) et TSLAc (623 $), reellement illiquides
 *     Or MSTRc fait 4,9 M$ de volume 24 h et SNDKc 3,0 M$ : LES DEUX PLUS GROS MARCHES DU JEU
 *     etaient exclus des puces par une mesure perimee.
 *
 * ⛔ CE QU ON NE CHANGE PAS, et c est la regle qui compte : une puce ne pousse que vers une action
 *   DONT LE PRIX EST CONNU. Sans prix, l ecran de mise en vie demande une valeur de depart dans une
 *   devise que l app ne sait pas evaluer, et le parcours s arrete la. Les dix restent dans la liste
 *   deroulante : on ne retire aucun choix, on arrete seulement de pousser vers un cul-de-sac.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu une action ait un marche aujourd hui. Il prouve que la liste se
 *   CALCULE au lieu d etre gravee, et qu elle ne peut plus vieillir en silence.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { pairesProposees } from './paires.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const nu = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

cas('⛔⛔ la liste des puces n est plus GRAVEE', () => {
  assert.ok(!/PAIRES_CHIP_QUICK/.test(nu),
    'la constante gravee est revenue : elle redeviendra fausse des qu un marche bougera, et rien '
    + 'ne le dira');
  assert.ok(/function pairesChipQuick\(\)/.test(nu), 'la liste calculee a disparu');
  assert.ok(/htmlChips = pairesChipQuick\(\)/.test(nu),
    'les puces ne sont plus construites depuis la liste calculee');
});

cas('⛔ une puce n apparait QUE si le prix a ete lu', () => {
  /* ⛔ C EST LA REGLE D ORIGINE, ET ELLE EST GARDEE : pousser vers une action sans prix menait a un
   *   cul-de-sac au moment de la mise en vie. On calcule la liste, on n assouplit pas la porte. */
  const i = nu.indexOf('function pairesChipQuick');
  const bloc = nu.slice(i, nu.indexOf('function peindrePaireChips', i));
  assert.ok(/prixUsdDeviseLus\.has\(String\(p\.symbole\)\)/.test(bloc),
    'la porte du prix lu a saute : des puces pousseraient vers des devises que l app ne sait pas '
    + 'evaluer');
  assert.ok(/p\.type === 'ACTION'/.test(bloc), 'le filtre par type d actif a disparu');
  assert.ok(/const out = \['ETH'\]/.test(bloc), 'ETH n est plus garanti dans les puces');
});

cas('⛔⛔ les lectures sont AMORCEES, sinon la liste reste vide a vie', () => {
  /* ⛔⛔ `assurerPrixDevise` n est appelee ailleurs que pour la devise DEJA choisie. Une puce ne
   *     peut pas apparaitre pour une action dont personne n a jamais demande le prix : sans
   *     amorcage, « calculee » voudrait dire « toujours reduite a l ETH ». */
  assert.ok(/function amorcerPrixActions\(\)/.test(nu), 'l amorcage des prix a disparu');
  assert.ok(/amorcerPrixActions\(\);\s*\n\s*peindrePaireChips\(\);/.test(nu),
    'l amorcage n est plus lance avant la peinture des puces');
});

cas('⛔⛔ les puces se REPEIGNENT quand un prix arrive', () => {
  /* ⛔⛔ LES LECTURES SONT ASYNCHRONES : au premier rendu la liste est vide. Sans ce rappel, le
   *     correctif serait juste dans le code et INVISIBLE a l ecran — exactement le defaut inerte
   *     attrape sur la carte quelques heures plus tot le meme jour. */
  const i = nu.indexOf('function assurerPrixDevise');
  const bloc = nu.slice(i, i + 1400);
  assert.ok(/prixUsdDeviseLus\.set\(s, p\);[\s\S]{0,200}peindrePaireChips\(\)/.test(bloc),
    'les puces ne sont plus repeintes a l arrivee d un prix : elles resteraient a ETH seul');
});

cas('⛔ le registre porte bien dix actions — sinon ce test ne mesure rien', () => {
  /* ⛔ TEMOIN : si le registre se vidait, tous les cas ci-dessus passeraient sur une liste vide. */
  const actions = pairesProposees(8453).filter((p) => p.type === 'ACTION');
  assert.ok(actions.length >= 8,
    'le registre ne porte plus que ' + actions.length + ' actions : les puces calculees n auraient '
    + 'presque rien a proposer, et ce fichier ne mesurerait plus le bon defaut');
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok puces-paire-calculees — ' + n + ' cas.');
console.log('   La liste se CALCULE depuis les prix reellement lus, les lectures sont amorcees, et');
console.log('   les puces se repeignent a l arrivee d un prix.');
console.log('⚠️ NE PROUVE PAS qu une action ait un marche aujourd hui — prouve que la liste ne peut');
console.log('   plus vieillir en silence.');

/* ── ⛔ AJOUTS DU 2026-09-27 — la decouverte, et la devise majeure oubliee ───────────────────── */
{
  let m = 0;
  const casB = (titre, f) => { m++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

  casB('⛔⛔ une devise MAJEURE peut avoir une puce — TOSHI n en avait aucune', () => {
    /* ⛔⛔ OUBLI VISIBLE A L ECRAN : TOSHI, 1 230 755 $ de liquidite mesures, etait selectionnable
     *     dans la liste deroulante et n avait AUCUNE puce — le filtre ne connaissait que `ACTION`.
     *     cbBTC non plus. Une devise proposee sans raccourci est une devise cachee a moitie. */
    const i = nu.indexOf('function pairesChipQuick');
    const bloc = nu.slice(i, nu.indexOf('function peindrePaireChips', i));
    assert.ok(/p\.type === 'ACTION' \|\| p\.type === 'MAJEUR'/.test(bloc),
      'les devises MAJEURES ne peuvent plus avoir de puce : TOSHI et cbBTC redeviennent invisibles '
      + 'dans les raccourcis alors qu ils sont proposes');
    /* ⛔ ET L AMORCAGE SUIT LE MEME ENSEMBLE, sinon il ment par omission : une puce qui depend d un
     *   prix jamais demande n apparaitra jamais. */
    const j = nu.indexOf('function amorcerPrixActions');
    const bloc2 = nu.slice(j, nu.indexOf('function pairesChipQuick', j));
    assert.ok(/p\.type === 'ACTION' \|\| p\.type === 'MAJEUR'/.test(bloc2),
      'l amorcage des prix ne couvre plus les devises majeures : leur puce ne pourrait jamais sortir');
  });

  casB('⛔⛔ la decouverte est BORNEE et filtree comme le reste', () => {
    const i = nu.indexOf('function blocksDecouverts');
    assert.notEqual(i, -1, 'la decouverte des blocks vivants a disparu');
    const bloc = nu.slice(i, nu.indexOf('function peindrePaires', i));
    assert.ok(/Number\(m\.liquiditeUsd\) >= LIQ_MIN_BUY_USD/.test(bloc),
      'le seuil de profondeur a saute, ou un SECOND seuil a ete cree — son propre commentaire dit '
      + 'qu une valeur separee deriverait');
    assert.ok(/Number\(m\.prixUsd\) > 0/.test(bloc),
      'un block sans prix LU peut de nouveau etre propose : cul-de-sac a la mise en vie');
    assert.ok(/\/\^0xb2\[0-9a-fA-F\]\{38\}\$\/i\.test\(adr\)/.test(bloc),
      'le prefixe B20 n est plus exige : la paire serait refusee par la CHAINE, apres le clic');
    assert.ok(/slice\(0, PAIRES_DECOUVERTES_MAX\)/.test(bloc),
      'la liste n est plus bornee : 148 lignes dans un menu deroulant, c est un mur, pas un choix');
    assert.ok(/dejaAuRegistre\.has\(adr\)/.test(bloc), 'les doublons du registre reviennent dans la liste');
  });

  casB('⛔ le groupe « Live blocks » ne s affiche QUE s il contient quelque chose', () => {
    /* ⛔ Un `optgroup` vide est un rayon vide : il fait croire a une panne. */
    assert.ok(/vivants\.length\s*\n?\s*\? '<optgroup label="Live blocks/.test(nu)
      || /\+ \(vivants\.length[\s\S]{0,80}Live blocks/.test(nu),
      'le groupe des blocks vivants s affiche meme vide');
    assert.ok(/' liquidity'/.test(nu),
      'la profondeur n est plus dite dans le libelle : « pairer avec X » ne veut rien dire sans '
      + 'savoir s il y a 600 $ ou 2 M$ en face');
  });

  assert.equal(m, 3, 'compte de cas (ajouts) inattendu : ' + m);
  console.log('   + ' + m + ' cas : MAJEUR a droit a une puce, la decouverte est bornee et filtree.');
}

/* ── ⛔⛔ LA REGLE QUI M A PRIS TROIS FOIS LE MEME JOUR ──────────────────────────────────────── */
{
  let m = 0;
  const casC = (titre, f) => { m++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

  casC('⛔⛔ les paires sont REPEINTES a l arrivee du trending', () => {
    /* ⛔⛔ MESURE EN PRODUCTION, juste apres deploiement : le groupe « Live blocks » etait ABSENT
     *     alors que 155 blocks passaient le filtre. `peindrePaires()` tourne a l initialisation,
     *     AVANT que `marcheParAdr` soit remplie — la liste etait calculee sur une Map vide.
     *     Troisieme fois ce jour-la : la garde `NON_TROUVEE` sur la carte, les puces calculees,
     *     puis ceci. REGLE : ce qui se CALCULE depuis une donnee asynchrone doit etre REPEINT a
     *     l arrivee de cette donnee, sinon « calcule » veut dire « vide ». */
    const i = nu.indexOf('marcheParAdr.set(');
    assert.notEqual(i, -1, 'le point d arrivee du trending est introuvable');
    const apres = nu.slice(i, i + 3000);
    assert.ok(/peindrePaires\(\)/.test(apres),
      'les paires ne sont plus repeintes quand le trending arrive : le groupe « Live blocks » '
      + 'restera vide pour toujours, et le correctif sera inerte');
  });

  assert.equal(m, 1, 'compte de cas (repeinture) inattendu : ' + m);
  console.log('   + ' + m + ' cas : les paires sont repeintes a l arrivee du trending.');
}

/* ══ ⛔⛔ LA PANNE DU 2026-09-29, ET LA GARDE QUI L EMPECHE DE REVENIR ═══════════════════════════
 *     CE QUI EST ARRIVE EN PRODUCTION. La porte d achat (`porte-achat.js`) a ete branchee sur des
 *     faits lus sur un RPC public, en FAIL-CLOSED. Le RPC a rendu « over rate limit », le verdict
 *     est tombe a `NON_MESURE` pour TOUTES les devises, et LES PUCES SONT PASSEES DE 13 A 2 sur le
 *     site deploye — les dix actions et TOSHI comprises. Une garde JUSTE, posee sur une
 *     AFFORDANCE, a efface le seul chemin d achat de la page.
 *   ⛔ LA REGLE QUE CES CAS GRAVENT : fail-closed est pour une garde de SECURITE, ou notre
 *     ignorance doit bloquer. Sur une affordance, un refus ne se prononce que sur un verdict
 *     CONNU ; sur `NON_MESURE` on retombe exactement sur le comportement d avant, jamais pire.
 * ⚠️ CE QUE CES CAS NE PROUVENT PAS : ce sont des assertions sur le TEXTE de `app.html`, pas une
 *   execution. Elles attrapent la SUPPRESSION de la branche, pas une erreur d execution dedans.
 *   Seul un navigateur sur la page deployee l a dit — et c est lui qui a crie, pas cette suite. */
{
  let m = 0;
  const casD = (titre, f) => { m++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
  const corpsChip = () => {
    const i = nu.indexOf('function pairesChipQuick()');
    assert.notEqual(i, -1, 'la liste calculee a disparu');
    const j = nu.indexOf('function peindrePaireChips', i);
    assert.notEqual(j, -1, 'la peinture des puces a disparu');
    return nu.slice(i, j);
  };

  casD('⛔⛔ LA PORTE NE FERME PAS SUR UN VERDICT INCONNU', () => {
    const corps = corpsChip();
    assert.ok(/verdictPorteDe/.test(corps), 'la porte d achat n est plus consultee du tout');
    /* ⛔ LE COEUR DE LA GARDE : la branche qui laisse passer l inconnu doit etre LA. */
    assert.ok(/NON_MESURE/.test(corps),
      'la branche qui laisse passer un verdict NON_MESURE a disparu : une panne du RPC de prix '
      + 'effacera de nouveau toutes les puces, comme le 2026-09-29 (13 -> 2 en production)');
  });

  casD('⛔ mais la porte MORD quand le verdict est connu', () => {
    assert.ok(/meriteUnePuce\(/.test(corpsChip()),
      'plus aucun refus : un marche a 385 bps de glissement redeviendrait pousse comme les autres');
  });

  casD('⛔⛔ `data-frais` A TROIS VALEURS — « non » ne doit pas couvrir « inconnu »', () => {
    const i = nu.indexOf('function peindrePaireChips');
    const corps = nu.slice(i, i + 2600);
    assert.ok(/data-frais=/.test(corps), 'la marque de frais a disparu de la puce');
    assert.ok(/inconnu/.test(corps),
      'l etat « inconnu » a disparu : pendant une panne de lecture, des marches qui RAPPORTENT '
      + 'seraient comptes comme ne rapportant rien, et l entonnoir rendrait un chiffre faux');
    assert.ok(/porteNotreFrais\(/.test(corps),
      'la puce ne distingue plus les marches qui portent notre frais de ceux qui n en portent pas');
  });

  assert.equal(m, 3, 'compte de cas (fail-open) inattendu : ' + m);
  console.log('   + ' + m + ' cas : la porte ne ferme pas sur l inconnu (panne du 2026-09-29).');
}
