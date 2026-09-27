// tip 20260922-stock-pair-ux — Create offers Coinbase ACTION pairs; CreateRouter Instant Birth path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIONS_COINBASE, pairesProposees, etiquettePaire } from './paires.js';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const tip = '20260922-fee-label-clean';
/* ⛔ EPINGLE RETIREE LE 2026-09-23 — elle exigeait un numero de build EXACT.
 *    Elle ne testait pas une fonctionnalite : elle testait que PERSONNE N AVAIT DEPLOYE ni
 *    reformate depuis. Des qu un autre agent bump le build ou reindente, elle rougit — et la
 *    suite partagee devient inutilisable pour decider si on peut deployer.
 *    L intention est gardee sous une forme qui ne pourrit pas.
 *    ⛔ AUCUNE autre assertion de ce fichier n a ete touchee (compte verifie avant/apres). */
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23, passe globale) : elle exigeait un numero de
 *    build precis, donc elle rougissait des qu un AUTRE deploiement bumpait le build. Elle ne
 *    testait pas une fonctionnalite, elle testait que personne n avait deploye depuis.
 *    L intention — « c est bien une page servie, avec sa ligne de build » — est gardee. */
assert.match(html, /data-build="[\w-]+"/);
assert.match(html, /Coinbase tokenized stocks/);
assert.match(html, /id="cPaireChips"/);
assert.match(html, /data-paire-chip/);
/* ⛔⛔ CETTE ASSERTION EPINGLAIT UNE PHOTO D UN JOUR COMME SI C ETAIT UNE REGLE. Elle exigeait les
 *     cinq puces a l identique, COINc comprise — or la mesure du 2026-09-25 (`/api/prix-usd` rejoue
 *     sur les treize actions) montre que COINc n a AUCUN prix lisible : la choisir menait a un
 *     Create reussi, puis a un ecran demandant une valeur de depart dans une devise dont l app
 *     ignore le prix. Le test rendait donc ce cul-de-sac OBLIGATOIRE — le corriger le faisait
 *     rougir, ce qui est l exact contraire du travail d une garde.
 *   ⇒ CE QUI COMPTE N A JAMAIS ETE « ces cinq symboles-la » mais : cinq puces, l ETH en premier, et
 *     aucune puce qui ne soit une paire reellement proposee. Les symboles sont une MESURE, a refaire
 *     quand la liquidite bouge ; la STRUCTURE est la regle. */
{
  /* ⛔⛔ LA LISTE N EST PLUS UNE CONSTANTE (2026-09-27), ET CE FICHIER AVAIT DEJA ECRIT POURQUOI :
   *     « ce qui compte n a jamais ete ces cinq symboles-la mais : l ETH en premier, et aucune puce
   *     qui ne soit une paire reellement proposee. Les symboles sont une MESURE, a refaire quand la
   *     liquidite bouge ; la STRUCTURE est la regle. »
   *     La liquidite a bouge. Re-mesure du 2026-09-27 : HUIT des dix actions ont un prix lisible,
   *     dont MSTRc (4,9 M$ de volume 24 h) et SNDKc (3,0 M$) que la constante excluait — les deux
   *     plus gros marches du jeu. La liste se CALCULE desormais depuis les prix reellement lus.
   *   ⇒ ON GARDE LA STRUCTURE, ON ABANDONNE LE COMPTE. Exiger « cinq puces » rendrait de nouveau
   *     une MESURE obligatoire — exactement le defaut que ce fichier reprochait a sa propre version
   *     precedente, qui figeait un cul-de-sac. */
  const i = html.indexOf('function pairesChipQuick');
  assert.notEqual(i, -1, 'la liste calculee des puces a disparu');
  const bloc = html.slice(i, html.indexOf('function peindrePaireChips', i));
  assert.ok(/const out = \['ETH'\]/.test(bloc), 'l ETH n est plus la premiere puce');
  assert.ok(/pairesProposees\(CHAINE\)/.test(bloc),
    'les puces ne viennent plus du registre des paires : une puce pourrait ne mener nulle part');
  assert.ok(/prixUsdDeviseLus\.has\(String\(p\.symbole\)\)/.test(bloc),
    'une puce peut de nouveau pointer une action SANS PRIX LU : c est le cul-de-sac mesure le '
    + '2026-09-25 — Create reussit, puis la mise en vie demande une valeur dans une devise que '
    + 'l app ne sait pas evaluer');
  /* ⛔ TEMOIN : le registre doit encore porter des actions, sinon tout ce qui precede passerait sur
   *   une liste vide sans rien signaler. */
  assert.ok(pairesProposees(8453).some((p) => p.type === 'ACTION'),
    'le registre ne porte plus aucune action : ce cas ne mesure plus rien');
}
assert.match(html, /hookV8Deploye/);
assert.match(html, /deviseOk = v3Pret \|\| Number\(CHAINE\) === 8453/);
assert.match(html, /quoteAction/);
assert.match(html, /function openFeeDejaPayePour/);
assert.match(html, /function majFundWalletPourPaire/);
assert.doesNotMatch(html, /Fees for Dev/);
assert.doesNotMatch(html, /No fee address in UI/);
assert.doesNotMatch(html, /0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4/i);
const actions = pairesProposees(8453).filter((p) => p.type === 'ACTION');
assert.equal(actions.length, ACTIONS_COINBASE.length);
assert.match(etiquettePaire(actions[0]), /Coinbase tokenized stock/);
const lp = readFileSync(new URL('./lancer-pool.js', import.meta.url), 'utf8');
assert.match(lp, /Instant Birth only pairs against native ETH/);
console.log('ALL PASS tip ' + tip);
