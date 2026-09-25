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
  const m = /PAIRES_CHIP_QUICK = \[([^\]]+)\]/.exec(html);
  assert.ok(m, 'la liste des puces rapides a disparu');
  const symboles = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.equal(symboles.length, 5, 'il n y a plus cinq puces rapides : ' + symboles.join(', '));
  assert.equal(symboles[0], 'ETH', 'l ETH n est plus la premiere puce');
  const connus = new Set(pairesProposees(8453).map((p) => p.symbole));
  connus.add('ETH');
  for (const s of symboles) {
    assert.ok(connus.has(s),
      'la puce « ' + s + ' » ne correspond a aucune paire proposee : elle mene nulle part');
  }
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
