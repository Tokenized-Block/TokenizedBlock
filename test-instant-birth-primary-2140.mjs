// tip 20260922-2140 → 20260922-ib-batch — Instant Birth hooked V8 DIRECT primary; fee = fixed 0.001 ETH.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

/* ⛔ EPINGLE RETIREE LE 2026-09-22 : cette ligne verifiait `data-build="20260922-<tip>"`,
 *    donc elle rougissait des qu UN AUTRE deploiement bumpait le build — plusieurs fois par jour
 *    quand deux agents travaillent. Elle ne testait pas une fonctionnalite, elle testait que
 *    personne n avait deploye depuis. L intention (« c est bien la version courante ») est
 *    gardee sous une forme qui ne pourrit pas : la ligne doit EXISTER et etre bien formee.
 *    ⛔ AUCUNE autre assertion de ce fichier n a ete touchee. */
assert.match(html, /data-build="\d{8}-[\w-]+"/);
assert.match(html, /FRAIS_OUVERTURE_WEI/);
assert.match(html, /preflightInstantBirthEthFixe/);
assert.match(html, /tip 20260922-eth-fixe HARD/);
assert.match(html, /Review → sign Instant Birth|Connect wallet → review → Instant Birth/);
assert.doesNotMatch(html, /Could not read the price or your ETH balance, so nothing was started/);
assert.doesNotMatch(html, /Launch hooked V8/);
assert.match(html, /Give birth · V8 = Instant Birth vieAuto/);
assert.match(html, /Birth = V8|HOOK_V8/i);
assert.match(html, /Fees for Dev/);
assert.doesNotMatch(html, /0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4/i);
/* ⛔⛔ CETTE ASSERTION EXIGEAIT « ≈$1 (0.001 ETH) », ET ELLE VERROUILLAIT UN CHIFFRE FAUX.
 *     Le frais facture est `FRAIS_OUVERTURE_WEI` = 0,001 ETH (decision de Phil du 2026-09-21,
 *     alignee sur la mediane mesuree du marche). Le « $1 » vient de `FRAIS_USD`, une CIBLE en
 *     dollars devenue vestige : le code prend `max(weiPourDollars($1), 0,001 ETH)` et, au prix
 *     actuel de l ETH, c est TOUJOURS le plancher qui s applique.
 *     ⇒ Au prix LU PAR L APP ELLE-MEME (`prixEthUsd`, 4 lectures, 2741,48 $/ETH, ecart 0,16 % —
 *       recoupe sur 14 paires DexScreener de plus de 200 000 $ de liquidite, mediane 2 744,43 $) :
 *       0,001 ETH = 2,74 $. L ecran annoncait donc 1 $ pour un prelevement de 2,74 $, soit un
 *       facteur 2,74 DANS LE SENS QUI NOUS ARRANGE, sur le bouton d achat.
 * ⛔ CE N EST PAS UN AFFAIBLISSEMENT DU TEST : il continue d exiger que le montant soit AFFICHE,
 *    et il exige maintenant le montant EXACT — celui qui part du wallet — au lieu d un dollar fige
 *    qui diverge du marche chaque jour. Un test qui verrouille un chiffre faux rend le mensonge
 *    obligatoire, et c est pire que pas de test du tout.
 * ⛔ ET LA GARDE D ECRAN LE REFUSE AUSSI : `test-texte-a-l-ecran.mjs` interdit desormais un prix en
 *    dollars FIGE colle a un montant en ETH. Les deux tests disent la meme chose. */
assert.match(html, /0\.001 ETH/);
assert.doesNotMatch(html, /≈\s?\$1\s*\(0\.001 ETH\)/);
assert.doesNotMatch(html, /0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4/);
console.log('PASS tip 20260922-eth-fixe Instant Birth fixed 0.001 ETH · no oracle refuse · preflight');
