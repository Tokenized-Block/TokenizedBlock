/* test-create-sans-wallet-le-dit.mjs — SANS WALLET, L ONGLET CREATE NE DIT PAS « TOUT EST PRET ».
 *
 * ⛔⛔ LE DEFAUT (handoff Claude 2026-10-01, §5.3), MESURE EN PRODUCTION : Chrome sans
 *     `window.ethereum`, onglet Create a l ouverture, `#cRecap` disait
 *         « Give it a name and a symbol — everything else is already set. »
 *     La phrase « Connect your wallet first… » n etait pas morte : apres saisie du nom et du
 *     symbole elle s affichait bien, en neutre. Mais a l ouverture, le validateur rend le PREMIER
 *     prealable (le nom) et la branche `neutre` le recouvrait par une phrase qui affirme que tout
 *     le reste est pret — faux sans wallet.
 *
 * ⛔ CE FICHIER EXECUTE LE VRAI CODE : `validerCreation` et la tranche de `majFraisEtRecap` qui
 *   peint `#cRecap` (texte ET classe), extraites de app.html depouille de ses commentaires.
 *
 * ⛔⛔ SES TEMOINS NEGATIFS :
 *   T1 — l ANCIEN code (eaebb04) DOIT etre rapporte fautif (pas de phrase wallet a l ouverture) ;
 *   T2 — mutation `compte ? 'Give it` -> `true ? 'Give it` (appliquee, comptee) DOIT etre fautive ;
 *   T3 — un VRAI refus (nom > 32 octets) DOIT rester rouge : sinon on aurait juste tout repeint.
 * ⚠️ NE PROUVE PAS la visibilite a l ecran : ca se mesure au navigateur, et ca l a ete.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sansCommentaires } from './outils-test.js';

let n = 0;
const cas = (t, f) => { n += 1; try { f(); console.log('  ok  ' + t); } catch (e) { console.error('✗ ' + t); throw e; } };
const ACTUEL = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const WALLET = 'Connect your wallet first: it is the one that signs, and it receives the supply.';

function tranche(nu, debut, fin) {
  const d = nu.indexOf(debut);
  assert.ok(d >= 0, 'repere introuvable : ' + debut);
  const f = nu.indexOf(fin, d + debut.length);
  assert.ok(f > d, 'repere de fin introuvable : ' + fin);
  return nu.slice(d, f);
}

function recap(html, { nom = '', sym = '', compte = null } = {}) {
  const nu = sansCommentaires(html, { minRetire: 5000 });
  const debutV = nu.includes('function phraseWalletCreate()') ? 'function phraseWalletCreate()' : 'function validerCreation()';
  const sV = tranche(nu, debutV, 'let forcerCreateRouterIb');
  const sR = tranche(nu, 'const neutre = v.ko', 'majFundWalletPourPaire();');
  const champs = { '#cNom': { value: nom }, '#cSym': { value: sym }, '#cSel': { value: 'block-0011223344556677' } };
  const cible = { textContent: '', className: '' };
  const $ = (q) => (q === '#cRecap' ? cible : champs[q] || null);
  const paire = { adr: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', type: 'ERC20', symbole: 'USDC' };
  const f = new Function('$', 'compte', 'paireChoisie', 'R', 'feeTxt', 'transactionsDepuisEth',
    'segmenterParFactory', 'fraisDuPont', 'phraseFraisDuPont', 'etiquettePaire',
    sV + '\nconst v = validerCreation();\n' + sR + '\nreturn v;');
  f($, compte, paire, { nom: 'Base' }, '', () => null, () => [], () => 0, () => '', () => 'USDC');
  return cible;
}
const rouge = (c) => c.className.split(' ').includes('wKo');

cas('⛔⛔⛔ SANS WALLET, A L OUVERTURE (champs vides) : LA PHRASE WALLET EST DITE, EN NEUTRE', () => {
  const c = recap(ACTUEL);
  assert.ok(c.textContent.includes(WALLET), 'sans wallet, le recap ne le dit pas : « ' + c.textContent + ' »');
  assert.ok(!c.textContent.includes('everything else is already set'), 'le recap affirme que tout est pret sans wallet');
  assert.equal(rouge(c), false, 'un prealable peint en rouge');
});

cas('⛔⛔ AVEC WALLET, A L OUVERTURE : LA PHRASE NEUTRE D ORIGINE, SANS PHRASE WALLET', () => {
  const c = recap(ACTUEL, { compte: '0x1111111111111111111111111111111111111111' });
  assert.equal(c.textContent, 'Give it a name and a symbol — everything else is already set.');
  assert.equal(rouge(c), false);
});

cas('⛔⛔ SANS WALLET, NOM ET SYMBOLE SAISIS : LA PHRASE WALLET SEULE, EN NEUTRE (inchange)', () => {
  const c = recap(ACTUEL, { nom: 'Probe', sym: 'PROBE' });
  assert.equal(c.textContent, WALLET);
  assert.equal(rouge(c), false);
});

cas('TEMOIN T3 — UN VRAI REFUS (nom > 32 octets) RESTE ROUGE', () => {
  const c = recap(ACTUEL, { nom: 'x'.repeat(40), sym: 'PROBE' });
  assert.match(c.textContent, /over 32 bytes/);
  assert.equal(rouge(c), true, 'un vrai refus n est plus rouge : on a tout repeint en neutre');
});

cas('TEMOIN T1 — L ANCIEN CODE (eaebb04) EST RAPPORTE FAUTIF', () => {
  const ancien = execFileSync('git', ['show', 'eaebb04:app.html'], { cwd: new URL('./', import.meta.url), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const c = recap(ancien);
  assert.ok(!c.textContent.includes(WALLET), 'l ancien code disait deja la phrase : ce temoin ne sait plus dire NON');
  assert.ok(c.textContent.includes('everything else is already set'));
});

cas('TEMOIN T2 — MUTATION « compte ? » -> « true ? » : RAPPORTEE FAUTIVE', () => {
  const avant = "compte ? 'Give it a name and a symbol";
  const morceaux = ACTUEL.split(avant);
  assert.equal(morceaux.length, 2, 'mutation NON APPLIQUEE : un temoin qui ne mute rien ne prouve rien');
  const c = recap(morceaux.join("true ? 'Give it a name and a symbol"));
  assert.ok(!c.textContent.includes(WALLET), 'la mutation n est pas vue : le test ne mesure pas la branche');
});

console.log('\n' + n + ' cas, 0 KO');
