/* test-banque-contre-test-grok-20261011.mjs - LES RETOURS DU CONTRE-TEST DE 20261011-bank-for-you (Grok, wallet 0x31e0, 6 tx verifiees on-chain).
 * (1) Apres borrow, repay et withdraw, la carte TokenizedBank du Wallet restait PERIMEE a t0 et t+35 s (dette « fantome » 4-5 min) :
 *     je relisais la Bank, jamais la carte du Wallet. (2) « GOOGLc liste 2 fois sans distinction claire ». (3) « Building the plan… »
 *     restait affiche une fois le plan pret. (4) « Your positions » disait « Connect your wallet » alors que le wallet etait connecte.
 * AFFIRME le cablage de chaque correctif dans app.html (TB_APP = ancienne : rouge). NE PROUVE PAS : un vrai wallet (Grok recontre-teste).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => { const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete); const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length); };
/* (1) */
const apres = fonction('function bcApresOperation() {');
vu(/await bcBanqueDonneesPourToi\(true\)/.test(apres) && /void bcBanquePositions\(true\)/.test(apres) && /void tbBanquePeindre\(\)/.test(apres) && /void bcBanquePourToi\(\)/.test(apres),
  '(1) apres une operation, la carte du Wallet (ou les positions, ou les donnees fraiches) ne se relit pas');
vu(/setTimeout\(\(\) => \{ void relire\(\); \}, 35000\);/.test(apres) && /setTimeout\(\(\) => \{ void relire\(\); \}, 180000\);/.test(apres), '(1) pas de relecture a 35 s et 3 min');
for (const ent of ['async function bcBanqueProposer({', 'async function bcBanqueProposerPanier(lignes) {']) vu(/bcApresOperation\(\);/.test(fonction(ent)), '(1) ' + ent.slice(15, 40) + ' n appelle pas bcApresOperation');
/* (2) */
const charger = fonction('async function bcBanqueCharger(force = false) {');
vu(/nParAction\.set\(mk\.garantie\.symbole, \(nParAction\.get\(mk\.garantie\.symbole\) \|\| 0\) \+ 1\)/.test(charger) && /\(nParAction\.get\(mk\.garantie\.symbole\) \|\| 0\) > 1 \? \[bcEl\('span', \{ cls: 'bcPuce', text: 'up to ' \+ pctLtv\(c\.maxPct\)/.test(charger),
  '(2) deux marches de la meme action ne se distinguent pas');
/* (3) */
vu(/const li = bcEl\('li', \{ cls: classe, text: texte \}\);\s*ul\.append\(li\);[\s\S]{0,80}return li;/.test(fonction('function bcEtape(m, texte, classe = \'\') {')), '(3) bcEtape ne rend pas sa ligne');
for (const ent of ['async function bcBanqueProposer({', 'async function bcBanqueProposerPanier(lignes) {']) {
  const f = fonction(ent);
  vu(/const enCours = bcEtape\(m, 'Building the plan/.test(f) && /if \(enCours\) \{ if \(p && p\.etat === 'PRET'\) enCours\.textContent = 'Plan built/.test(f) && /else enCours\.remove\(\); \}/.test(f),
    '(3) « Building the plan… » reste a cote du resultat dans ' + ent.slice(15, 40));
}
/* (4) la Bank deja chargee se relit a la connexion (positions comprises : bcBanqueCharger appelle bcBanquePositions) */
/*   mesure locale (serveur froid) : marches NON lus -> la connexion ne relisait pas les positions ; elle les relit desormais dans les deux cas */
vu((html.match(/if \(bcBanque\.marches\) void bcBanqueCharger\(\); else \{ void bcBanquePourToi\(\); void bcBanquePositions\(\); \}/g) || []).length === 2,
  '(4) connecter / changer de compte ne relit pas les positions (Bank chargee ou non)');
vu(/void bcBanquePositions\(\);/.test(charger), '(4) bcBanqueCharger ne relit plus les positions');
vu(/text: 'Try again' \}\);\s*reessayer\.addEventListener\('click', \(\) => \{ void bcBanqueCharger\(true\); \}\);/.test(charger), '(4) un echec de lecture des marches ne propose pas de relire');
console.log('ok banque-contre-test-grok - ' + n + ' assertions ; NE PROUVE PAS un vrai wallet');
