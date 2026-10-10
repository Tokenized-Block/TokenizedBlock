/* test-qa-grok-2-20261010.mjs — QA d ecran de Grok Super sur prod 20261010-qa-rails-stock-archive2 (2e passe).
 * AFFIRME (lecture d app.html / rails-api.js / commandes-panel.js, fins de ligne normalisees -> portable Windows) :
 *  P0 la bulle deja ouverte ne referme plus la carte (ecran noir) ; Live vide + lecture refusee -> « Live feed not read — the network is
 *     busy » avec Retry ; la recherche Map demande l index serveur (test-recherche-index-du-moment l EXECUTE).
 *  P1 « accepts » n est dit qu apres un plan PRET/APPROBATIONS ; S.I montre toujours SA devise ; le panneau suit le profil (test-panneau-suit).
 *  P2 Entree vide la saisie ; puce « buy this with … ETH » « … » selectionne ; « Connect to see » ; rangee de bulles defilable ; Sell USDC.
 * Le fork prouve IB022 > USDC (banc-bloc-vers-action-fork-20261010.mjs). NE PROUVE PAS : le rendu navigateur reel.
 */
import { readFileSync } from 'node:fs';
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const html = lire('app.html'), rails = lire('rails-api.js');
const C = await import('./commandes-panel.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); };
ok(/ouvrirSeule\(nom, true\);/.test(html) && !/ouvrirSeule\(dejaOuverte \? null : nom, true\)/.test(html), 'P0 la bulle ouverte ne referme plus la carte');
ok(/!liveEvts\.length && liveRatees && !liveEnCours\s*\? '<li class="filL"><p class="note">Live feed not read \\u2014 the network is busy\. <button[^>]*data-live-relire>Retry<\/button>/.test(html), 'P0 Live vide + refus -> phrase + Retry');
ok(/closest\('\[data-live-relire\]'\); if \(t\) \{ t\.disabled = true; void lireLive\(\); \}/.test(html), 'P0 Retry relit le Live');
ok(/fetch\('\/api\/chercher\?q=' \+ encodeURIComponent\(brut\)/.test(html), 'P0 la recherche Map interroge l index serveur');
const iAcc = html.indexOf("if (g.ok) accordCerveau = 'Its brain ("), iPlan = html.indexOf("if (accordCerveau) bcEtape(m, accordCerveau, 'oui');"), iNon = html.search(/if \(p\.etat !== 'PRET' && p\.etat !== 'APPROBATIONS'\) \{\r?\n\s+bcEtape\(m, bcLigneEtatPlan\(p\), 'non'\);/);
ok(iAcc > 0 && iPlan > iNon && iNon > iAcc, 'P1 « accepts » differe apres le refus du plan (dit seulement si PRET/APPROBATIONS)');
ok(!/bcEtape\(m, g\.ok \? 'Its brain \(' \+ humeur \+ '\) accepts\.' : 'Its brain \(' \+ humeur \+ '\) refuses: ' \+ bcRaison\(g\.pourquoi\) \+ '\.', g\.ok \? 'oui' : 'non'\);\n    bcNoter\(\{ type: 'verdict', \.\.\.refs/.test(html), 'P1 temoin : plus de verdict immediat dans bcProposerSwap');
ok(/!choix\.some\(\(\[v\]\) => v === voulue\)\) s\.append\(bcEl\('option', \{ value: voulue, text: bc\.aifi\.devise\.sym \}\)\)/.test(html), 'P1 S.I en marche : le menu montre sa devise');
ok(/if \(!\(brainAdr && adrBrainEq\(brainAdr, adr\)\)\) \{ choisirBrain\(adr\); if \(pop && pop\.open\) bcRepeindre\(\); \}/.test(html), 'P1 le panneau suit le profil, ouvert ou ferme');
ok(/const ok = await bcExecuterTexte\(tape\);\n    s\.value = '';/.test(html), 'P2 Entree vide la saisie, acceptee ou non');
const pb = C.PRECOMMANDES.find((p) => p.cle === 'buy_block');
ok(pb.modele === 'buy this with \u2026 ETH' && pb.modele.slice(pb.curseur, pb.curseur + pb.selection) === '\u2026', 'P2 puce « buy this with … ETH », « … » selectionne');
ok(/setSelectionRange\(ou, ou \+ \(Number\.isInteger\(p\.selection\) \? p\.selection : 0\)\)/.test(html), 'P2 la selection est posee');
ok(/if \(!compte\) \$\('#pSolde'\)\.textContent = 'Connect to see';/.test(html), 'P2 « You hold » : Connect to see sans wallet');
ok(/@media \(max-width:620px\)\{[\s\S]{0,600}\.bulles\{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin/.test(html) && /barre\.addEventListener\('wheel'/.test(html), 'P2 rangee de bulles defilable a 375 px (barre visible + molette)');
ok(/if \(q && q\.ok && q\.adr === eth && usdcV\.ok\) choix\.push\(\[usdcV\.adr, 'for USDC'\]\);/.test(html), 'P2 Sell propose USDC pour un block cote en ETH');
ok(/if \(vers === USDC && quote === ETH\) \{\n\s+const chemin = \[\{ de, vers: ETH, famille: 'uniswap-v4' \}, \{ de: ETH, vers: USDC, famille: 'uniswap-v4' \}\];/.test(rails), 'P2 rails : block cote ETH -> USDC en multi-sauts');
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
