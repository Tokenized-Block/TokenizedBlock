// test-frais-ouverture.mjs — LE PRIX D OUVERTURE EST CELUI QU ON A MESURE, ET IL EST DIT EN ENTIER.
//
// ⛔⛔ CE QUE CE FICHIER PROTEGE (2026-09-21). Pendant des semaines l app a demande 0,0003 ETH pour
//     ouvrir un marche — non pas par choix, mais parce que ~1 $ vaut moins que ca au prix actuel de
//     l ETH, donc c est le PLANCHER qui s appliquait a chaque ouverture, en silence. Personne n a
//     jamais decide « trois fois moins que le marche » ; c est tombe comme ca.
//     La mediane LUE sur les 103 marches ouverts en un jour par le hook le plus actif de Base vaut
//     0,001001 ETH (`prix-du-lancement.mjs`, 22 fenetres, 0 ratee, 43 createurs distincts).
//
// ⛔ CE QUE CE FICHIER NE FAIT PAS : dire que 0,001 ETH est le bon prix. C est une decision de Phil,
//    prise le 2026-09-21 sur la mesure. Ce test verifie que le CODE applique cette decision, que le
//    plancher ne redevienne pas un plafond, et que l ECRAN ne promette pas un autre prix que celui
//    qui sera signe — parce qu une phrase exacte qui trompe se defend mieux qu une erreur franche.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR, phraseFrais, phraseFraisLancement }
  from './frais-creation.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

/* ══ 1. LE MONTANT ═══════════════════════════════════════════════════════════════════════════ */
eq(FRAIS_OUVERTURE_WEI, 1000000000000000n,
  'le prix d ouverture vaut 0,001 ETH — la mediane mesuree du marche, arrondie vers le bas');
ok(FRAIS_OUVERTURE_WEI > CREATE_FEE_WEI_FLOOR,
  'et il est au-dessus de l ancien plancher du CreateRouter (' + CREATE_FEE_WEI_FLOOR + ' wei), '
  + 'sinon le changement n aurait rien change');

/* ══ 2. L ECRAN DIT LE MEME PRIX QUE CELUI QUI SERA SIGNE ════════════════════════════════════ */
// ⛔ LE DEFAUT EXACT QU ON EVITE : annoncer « Create is free » puis faire signer 0,001 ETH.
const avant = phraseFrais(8453, 'Base');
ok(!/free/i.test(avant),
  'la phrase d avant-creation ne promet plus la gratuite sur mainnet — elle disait « Create is '
  + 'free » alors que rien ne peut etre cree avec son marche sans payer. Lu : « ' + avant + ' »');
ok(/0\.001 ETH/.test(avant),
  'et elle donne le montant EN ETH, celui que le wallet affichera. Lu : « ' + avant + ' »');

// ⛔ Practice reste gratuit, et doit continuer de le DIRE : supprimer la gratuite partout aurait
//    fait payer un reseau de test dans le texte sans le faire payer dans le code.
const practice = phraseFrais(84532, 'Base Sepolia');
ok(/free/i.test(practice), 'Practice reste annonce gratuit — il l est. Lu : « ' + practice + ' »');

/* ══ 3. LA PHRASE DE LANCEMENT NE CONTREDIT PAS CELLE DE CREATION ════════════════════════════ */
const lance = phraseFraisLancement(8453, 'Base', 3000, FRAIS_OUVERTURE_WEI, 10n ** 18n);
ok(!/Create itself is free/i.test(lance),
  'la phrase de lancement ne dit plus « Create itself is free ». Lu : « ' + lance + ' »');
ok(/0\.001/.test(lance), 'elle affiche le montant reellement envoye. Lu : « ' + lance + ' »');

/* ⛔ Solde insuffisant : la phrase doit AVERTIR, pas laisser signer un echec. */
const pauvre = phraseFraisLancement(8453, 'Base', 3000, FRAIS_OUVERTURE_WEI, 1n);
ok(/⚠️|not enough/i.test(pauvre),
  'un solde trop faible est signale AVANT le wallet. Lu : « ' + pauvre + ' »');

/* ══ 4. LE PLANCHER NE DOIT PAS ETRE UN PLAFOND ══════════════════════════════════════════════ */
// ⛔ LE PIEGE SYMETRIQUE, et il est reel : si l ETH s effondrait, ~1 $ depasserait 0,001 ETH. Un
//    code qui ECRASERAIT la valeur oracle avec la constante ferait alors payer MOINS que prevu.
//    On verifie donc que l app prend le PLUS GRAND des deux, pas la constante.
{
  const page = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  ok(/w\s*<\s*FRAIS_OUVERTURE_WEI\)\s*w\s*=\s*FRAIS_OUVERTURE_WEI/.test(page),
    'app.html releve au plancher SEULEMENT si la valeur oracle est en dessous — jamais l inverse');
  /* ⛔⛔ PREMIERE VERSION DE CETTE GARDE : `!/w = FRAIS_OUVERTURE_WEI;$/m`. Elle attrapait la ligne
   *     CORRECTE, puisque celle-ci se termine precisement par cette affectation. Une garde qui vire
   *     au rouge sur du code sain finit toujours par etre desactivee — donc elle est reecrite, pas
   *     assouplie : on exige que CHAQUE affectation porte sa condition sur la meme ligne. */
  const affectations = page.split('\n').filter((l) => /\bw\s*=\s*FRAIS_OUVERTURE_WEI\b/.test(l));
  ok(affectations.length > 0, 'au moins une affectation du plancher existe — sinon rien n est teste');
  for (const l of affectations) {
    ok(/w\s*<\s*FRAIS_OUVERTURE_WEI/.test(l),
      'chaque affectation du plancher porte sa condition « si en dessous » sur la meme ligne — '
      + 'sinon l oracle serait ecrase meme quand il demande PLUS. Ligne : « ' + l.trim() + ' »');
  }
  ok(/BigInt\(wei\)\s*>=\s*FRAIS_OUVERTURE_WEI/.test(page),
    'la garde `fraisLancementPret` compare bien au prix d ouverture, pas a l ancien plancher');
  /* ⛔ `wei != null` DOIT passer avant le BigInt : `BigInt(null)` vaut 0n et un montant absent
   *    passerait pour un montant valide de zero. */
  ok(/wei\s*!=\s*null\s*&&\s*BigInt\(wei\)/.test(page),
    'et elle ecarte null AVANT de convertir — BigInt(null) vaut 0n et passerait pour un montant');
}

/* ══ 5. LE TEMOIN — un test qui ne detecterait rien passerait aussi ══════════════════════════ */
{
  const faux = 'Create is free. Bringing it to life costs ≈ $1 in ETH.';
  ok(/free/i.test(faux),
    'temoin : l ANCIENNE phrase serait bien attrapee par le controle du point 2 — sans lui, ce '
    + 'fichier ne prouverait rien');
  ok(!/0\.001 ETH/.test(faux), 'temoin : et elle ne donnait aucun montant en ETH');
}

console.log('test-frais-ouverture : ' + n + ' assertions, OK');
