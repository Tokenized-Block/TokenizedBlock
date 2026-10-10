/* test-qa-panneau-20261010.mjs — QA de Phil du 2026-10-10 (hors reseau, portable LF/CRLF).
 * 1) un block se vend contre une action a pool v4 (rails-api route 2) et le ticket Sell la propose ;
 * 2) « You hold » liste les actions detenues ; 3) puce Buy sans montant, « Nothing was sent » une fois, « left unfinished » dit une
 * fois, saisie du Chat bornee ; 4) /api/prix-usd fusionne les requetes identiques, boucles de fond ralenties budget epuise. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './commandes-panel.js';
import { pauseNosBlocks, routeurEnchaine, PAUSE_EPUISE_MS } from './rythme-fond.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); };
const rails = lire('rails-api.js'), html = lire('app.html'), srv = lire('serveur-web.js');
/* 1 */
const i2 = rails.indexOf("if (nv === 'ACTION' && !POOLS_ACTIONS_AERODROME.has(vers) && (quote === ETH || quote === USDC)) {");
const iRefus = rails.indexOf("'a block sells here for its own quote token ('");
ok(i2 > 0 && i2 < iRefus, '1a route 2 : la branche block -> action v4 existe, AVANT le refus');
const br = rails.slice(i2, iRefus);
ok(/sautsDepuisChemin\(/.test(br) && /planEchangeMultiSauts\(/.test(br), '1b elle reutilise sautsDepuisChemin + planEchangeMultiSauts');
ok(/chemin\.push\(\{ de: ETH, vers: USDC/.test(br) && /chemin\.push\(\{ de: USDC, vers,/.test(br), '1c chemin block -> ETH -> USDC -> action');
ok(/fraisDevisesOk: new Set\(\[\.\.\.fraisDevisesOk, vers\]\)/.test(br), '1d l action recue admise en devise de frais (pool v4 lue)');
ok(/for \(const st of ACTIONS_COINBASE\) \{ const sa = String\(st\.adr\)\.toLowerCase\(\); if \(v4\.has\(sa\)\) choix\.push\(\[sa, 'for ' \+ st\.symbole \+ ' \(stock\)'\]\); \}/.test(html), '1e le ticket Sell propose « for <action> (stock) » pour un block');
/* 2 */
ok(/bc\.actionsDetenues = \{ compte: moi, t: Date\.now\(\), liste/.test(html) && /cas\(x\.sym, texte\(x\.brut, x\.dec\), 'tokenized stock'\)/.test(html), '2 « You hold » liste les actions detenues (relues <= toutes les 5 min)');
/* 3a */
const pb = C.PRECOMMANDES.find((p) => p.cle === 'buy_block');
ok(pb && !/\d/.test(pb.modele) && pb.aCompleter === true, '3a la puce Buy ne pre-remplit aucun montant (« ' + (pb && pb.modele) + ' »)');
ok(C.analyserCommande(pb.modele).ok === false && C.analyserCommande(pb.modele.slice(0, pb.curseur) + '0.002' + pb.modele.slice(pb.curseur + (pb.selection || 0))).ok === true && pb.modele.slice(pb.curseur, pb.curseur + pb.selection) === '\u2026', '3a refusee telle quelle, acceptee une fois le montant tape au curseur');
/* 3b — on rejoue bcLigneEtatPlan extraite d app.html */
const m = /function bcLigneEtatPlan\(p\) \{[\s\S]*?\n\}/.exec(html);
const f = new Function('return (' + m[0] + ')')();
const t1 = f({ etat: 'REFUSE', pourquoi: 'this block has no market the app can trade on right now — nothing was sent' });
ok((t1.match(/nothing was sent/gi) || []).length === 1, '3b « Nothing was sent » une seule fois : ' + t1);
const t2 = f({ etat: 'REFUSE', pourquoi: 'too small' });
ok(t2 === 'Refused \u2014 too small. Nothing was sent.', '3b temoin : une raison sans la phrase la recoit une fois');
/* 3c */
ok(/BC_ETATS\[o\.etat\] && o\.etat !== 'interrupted'\)/.test(html), '3c un « left unfinished » deja dit est retire au chargement suivant');
/* 3d */
ok(/bcAvecDelai\(bcDecimales\(de\.adr\), 8000\)/.test(html) && /let bcSaisieEnCours = false;/.test(html) && /finally \{ bcSaisieEnCours = false; s\.focus\(\); \}/.test(html), '3d la saisie du Chat : lecture bornee, jamais bloquee');
/* 4 */
ok(/const enVol = prixUsdEnVol\.get\(adr\);\n\s*if \(enVol\) \{ prixUsdFusions \+= 1; enVol\.then\(\(o\) => repondre\(o\)\); return; \}/.test(srv), '4a /api/prix-usd : une requete identique en vol attend le meneur');
ok(/if \(libererVol\) \{ if \(prixUsdEnVol\.get\(adr\) === monVol\) prixUsdEnVol\.delete\(adr\);/.test(srv), '4a le vol est retire a la reponse (rien de garde)');
ok(/setTimeout\(pas, pauseNosBlocks\(archiveEpuisee\(\)\)\)/.test(srv) && /if \(!routeurEnchaine\(archiveEpuisee\(\)\)\) break;/.test(srv), '4b les deux boucles de fond lisent le budget');
/* 4c — mesure CALCULEE sur une heure, budget epuise (sans la duree du tour) */
const toursH = (pause) => Math.floor(3600000 / pause);
ok(toursH(pauseNosBlocks(false)) === 900 && toursH(pauseNosBlocks(true)) === 12 && PAUSE_EPUISE_MS === 300000, '4c nos-blocks : 900 -> 12 tours/h budget epuise (calcule)');
ok(routeurEnchaine(false) === true && routeurEnchaine(true) === false, '4c routeur : jusqu a 40 tours par minute -> 1 budget epuise ; budget libre inchange');
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
