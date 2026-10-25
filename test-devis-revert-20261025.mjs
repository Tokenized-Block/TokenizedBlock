/* test-devis-revert-20261025.mjs - UN DEVIS QUI REVERTE EST UNE REPONSE DE LA CHAINE, PAS UNE LECTURE RATEE.
 * Testeur live (2026-10-25, game46, Wallet -> Swap RBLXc -> USDC, lecture seule) : « Not measured — we couldn’t read this market yet.
 *   Retry. (the price could not be quoted: execution reverted) », avec pour seul geste « Try again ».
 * CAUSE : echange.js rend NON_MESURE « the price could not be quoted: <message> » sur tout echec du devis, revert compris ; le Chat
 *   (bcLigneEtatPlan) dit alors « couldn’t read … Retry ». Un revert (estRevertDeChaine : « revert » sans debit/limite/delai) veut dire
 *   que la pool a REPONDU : pas de route pour ce montant maintenant.
 * ⛔ L ETAT SERVEUR RESTE NON_MESURE, DELIBEREMENT : rails-api.js achatUsdcActionAvecSecours ne recote sur la cle mesuree / la pool
 *   Aerodrome QUE sur un NON_MESURE (cas GMEc/RDDTc, 2026-10-11) ; le passer a REFUSE couperait ce secours. Le correctif est dans ce
 *   que l app DIT et PROPOSE : la phrase vraie, et « Dismiss » a cote de « Try again ».
 * CE BANC EXECUTE bcLigneEtatPlan / bcDevisRefuse (extraits d app.html) et lit la rangee de boutons du refus dans bcProposerSwap ;
 *   mutants sur des COPIES du texte. NE PROUVE PAS le rendu navigateur, ni la cause du revert de RBLXc (non relue sur la chaine). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
const { estRevertDeChaine } = await import(pathToFileURL(path.join(ICI, 'echange.js')).href);

function fonction(app, nom) {
  const a = app.indexOf('function ' + nom + '(');
  if (a < 0) return null;
  let p = 0, b = app.indexOf('{', a);
  for (; b < app.length; b++) { if (app[b] === '{') p += 1; else if (app[b] === '}') { p -= 1; if (p === 0) break; } }
  return app.slice(a, b + 1);
}

function verifier(app) {
  const ko = [];
  const src = [fonction(app, 'bcDevisRefuse'), fonction(app, 'bcLigneEtatPlan')].filter(Boolean).join('\n');
  let L, D;
  try { ({ L, D } = new Function(src + '; return { L: bcLigneEtatPlan, D: typeof bcDevisRefuse === "function" ? bcDevisRefuse : null };')()); }
  catch (e) { return ['extraction : ' + e.message]; }
  const revert = { etat: 'NON_MESURE', pourquoi: 'the price could not be quoted: execution reverted' };
  const t = (() => { try { return L(revert); } catch (e) { return 'JETTE ' + e.message; } })();
  if (/couldn.t read|Not measured|Retry/i.test(t)) ko.push('revert dit comme une lecture ratee : ' + t);
  if (!/No route for this amount right now: the pool refused the quote/.test(t)) ko.push('revert : la phrase vraie manque (' + t + ')');
  if (!/Nothing was sent\.$/.test(t)) ko.push('revert : « Nothing was sent. » manque');
  /* les vraies pannes de lecture gardent « Not measured … Retry » */
  for (const pq of ['the price could not be quoted: 429 Too Many Requests', 'the price could not be quoted: request timed out',
    'the price could not be quoted: execution reverted: rate limit exceeded', 'the plan could not be fetched', '']) {
    const x = (() => { try { return L({ etat: 'NON_MESURE', pourquoi: pq }); } catch (e) { return 'JETTE ' + e.message; } })();
    if (!/^Not measured — we couldn’t read this market yet\. Retry\./.test(x)) ko.push('panne « ' + pq + ' » : plus dite « Not measured … Retry » (' + x + ')');
  }
  /* meme frontiere que estRevertDeChaine (echange.js) sur les messages du devis */
  if (!D) ko.push('bcDevisRefuse absente');
  else for (const msg of ['execution reverted', 'execution reverted: 0x7a5ed734', '429 Too Many Requests', 'execution reverted (rate limited)', 'timeout', 'null']) {
    const a = D({ etat: 'NON_MESURE', pourquoi: 'the price could not be quoted: ' + msg }), b = estRevertDeChaine(new Error(msg));
    if (a !== b) ko.push('frontiere : « ' + msg + ' » app ' + a + ', echange.js ' + b);
  }
  if (D && D({ etat: 'REFUSE', pourquoi: 'the price could not be quoted: execution reverted' })) ko.push('un REFUSE classe en devis refuse');
  /* la rangee de boutons : un devis refuse n offre pas « Try again » seul */
  const k = app.indexOf('async function bcProposerSwap(');
  const corps = k < 0 ? '' : app.slice(k, app.indexOf('if (accordCerveau) bcEtape(m, accordCerveau', k));
  const r = /bcBoutons\(m, (bcDevisRefuse\(p\) \? \[[^\n]*?\] : \[\['Try again', planifier, true\]\])\);/.exec(corps);
  if (!r) ko.push('bcProposerSwap : la rangee de boutons du refus ne distingue pas le devis refuse');
  else if (!/\['Dismiss', refuser, true\]/.test(r[1].split(' : ')[0])) ko.push('devis refuse : pas de « Dismiss »');
  return ko;
}

let n = 0;
const vu = (c, m) => { if (!c) { console.log('KO ' + m); process.exitCode = 1; } n += 1; };
const ko = verifier(APP);
if (ko.length) console.log('  ' + ko.join('\n  '));
vu(ko.length === 0, 'un devis qui reverte est dit « No route for this amount right now », avec Dismiss ; les pannes gardent Not measured / Retry');
const MUTANTS = [
  ['le revert redevient « Not measured »', "if (bcDevisRefuse(p)) return", "if (false) return"],
  ['un 429 classe en revert', "!/rate|limit|\\b429\\b|too many|timeout|timed out|capacity|unavailable|busy/i.test(m)", 'true'],
  ['plus de Dismiss', "bcDevisRefuse(p) ? [['Dismiss', refuser, true], ['Try again', planifier, true]]", "bcDevisRefuse(p) ? [['Try again', planifier, true]]"],
  ['un REFUSE classe en devis refuse', "p && p.etat === 'NON_MESURE' && ", 'p && '],
];
let tues = 0;
for (const [nom, de, a] of MUTANTS) {
  if (APP.split(de).length !== 2) { vu(false, 'mutant « ' + nom + ' » : ancre absente ou multiple'); continue; }
  const k = verifier(APP.replace(de, a));
  if (process.env.VERBEUX) console.log('  [mutant] ' + nom + ' -> ' + String(k[0]).slice(0, 160));
  vu(k.length > 0, 'mutant « ' + nom + ' » : ROUGE');
  if (k.length) tues += 1;
}
if (process.exitCode) { console.log('KO devis-revert'); process.exit(1); }
console.log('ok devis-revert - ' + n + ' assertions, ' + tues + '/' + MUTANTS.length + ' mutants tues ; NE PROUVE PAS le rendu navigateur');
