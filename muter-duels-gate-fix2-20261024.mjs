/* muter-duels-gate-fix2-20261024.mjs — chaque correctif du 2e tour de la revue rolls-duels-ui est RETIRE ou FAUSSE, un a la fois, dans une
 *   COPIE (.mutant-dg2-<pid>-<fichier>, a cote de l original pour que les imports relatifs marchent, effacee juste apres) ; les bancs qui le
 *   couvrent sont relances sur la copie (variable d environnement) et l un d eux DOIT rougir. Aucun fichier du depot n est ecrit. Un temoin
 *   d abord : chaque banc doit etre VERT sur les fichiers non mutes (sinon un rouge ne prouverait rien).
 * ⛔ PORTABLE : la source est lue puis CRLF -> LF ; aucune ancre ne porte de saut de ligne. process.exitCode.
 * Usage : node muter-duels-gate-fix2-20261024.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const BANC = {
  duels: ['test-duels-gate-fix2-20261024.mjs', 'test-duels-ouverture-20261024.mjs'],
  gate: ['test-duels-gate-fix2-20261024.mjs'],
};
const vert = (banc, env = {}) => { try { execFileSync(process.execPath, [path.join(ICI, banc)], { cwd: ICI, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, timeout: 240000 }); return true; } catch (_) { return false; } };
/* [fichier, variable, banc, nom, de, vers] */
const M = [
  ['duels-plan-app.js', 'DUELS_APP_MODULE', 'duels', 'retour au tableau (la forme jamais publiee)',
    "if (!e || e.etat !== 'ON' || !ADR.test(c) || !e.contrats || typeof e.contrats !== 'object') return false;",
    "if (!e || e.etat !== 'ON' || !ADR.test(c) || !Array.isArray(e.contrats)) return false; return e.contrats.some((x) => bas(typeof x === 'string' ? x : x && x.contrat) === c);"],
  ['duels-plan-app.js', 'DUELS_APP_MODULE', 'duels', 'etat global ignore (ARRETE couvre)', "if (!e || e.etat !== 'ON' || !ADR.test(c)", 'if (!e || !ADR.test(c)'],
  ['duels-plan-app.js', 'DUELS_APP_MODULE', 'duels', 'contrat des duels non compare', '&& bas(d.contrat) === c;', '&& !!d.contrat;'],
  ['duels-plan-app.js', 'DUELS_APP_MODULE', 'duels', 'configure ignore', 'd.configure === true && ', ''],
  ['app.html', 'APP_HTML_FILE', 'gate', 'Sign : garde d ouverture retiree',
    "if ((p.kind === 'DUEL_JOIN' || p.kind === 'DUEL_CREATE') && lu.duelsOuverts !== true) return 'new duels are not open just now", "if (false) return 'new duels are not open just now"],
  ['app.html', 'APP_HTML_FILE', 'gate', 'Sign : non relu = ouvert', '&& lu.duelsOuverts !== true) return', '&& lu.duelsOuverts === false) return'],
  ['app.html', 'APP_HTML_FILE', 'gate', 'bjDuelsRelus : ancienne reponse acceptee', ' && duelsCfg.lu >= t0', ''],
  ['app.html', 'APP_HTML_FILE', 'gate', 'bjDuelsRelus : ouverture non lue', ' && Duels.duelsOuverts(j) === true;', ';'],
  ['app.html', 'APP_HTML_FILE', 'gate', 'Sign : duels non relus',
    "if (p.kind === 'DUEL_JOIN' || p.kind === 'DUEL_CREATE') lu = { duelsOuverts: await bjDuelsRelus() };", "if (p.kind === 'DUEL_JOIN' || p.kind === 'DUEL_CREATE') lu = { duelsOuverts: Duels.duelsOuverts(duelsCfg.j) };"],
  ['app.html', 'APP_HTML_FILE', 'gate', 'pass : phrase du re-armement retiree',
    "+ ' Anyone can draw the pass pot, but only within ' + texteBlocs(FENETRE_ROLLS, sParBlocApp) + ' of its draw block; a missed draw can be re-armed, which lets a buyer retry until the hash picks them. ');", "+ ' ');"],
  ['app.html', 'APP_HTML_FILE', 'gate', 'pass : fenetre figee (pas texteBlocs)', "+ ' Anyone can draw the pass pot, but only within ' + texteBlocs(FENETRE_ROLLS, sParBlocApp) + ' of", "+ ' Anyone can draw the pass pot, but only within 256 blocks of"],
  ['app.html', 'APP_HTML_FILE', 'gate', 'pass : lien Fees & risks retire', "e.append(lien, ' Sign '", "e.append(' Sign '"],
  ['mcp-tblock.js', 'MCP_MODULE', 'gate', 'MCP : retour de « a fixed prize from 3/5 »', '(traits in common out of 5). The prizes and the minimum winning score', '(traits in common out of 5), a fixed prize from 3/5. The prizes and the minimum winning score'],
  ['mcp-tblock.js', 'MCP_MODULE', 'gate', 'MCP : createur de UNIT tu', 'and can be changed by the UNIT creator, for rolls', 'for rolls'],
  ['deployer-blockrolls.html', 'DEPLOYER_HTML_FILE', 'gate', 'deployer : retour de « Fixed prizes »', '<h3>Prizes from the roll pot</h3>', '<h3>Fixed prizes</h3>'],
];
let temoin = true;
for (const b of [...new Set(Object.values(BANC).flat())]) { const v = vert(b); console.log((v ? 'vert ' : 'ROUGE ') + 'temoin ' + b); temoin = temoin && v; }
let tues = 0, survivants = 0, introuvables = 0;
if (temoin) for (const [mod, varEnv, banc, nom, de, vers] of M) {
  const src = fs.readFileSync(path.join(ICI, mod), 'utf8').replace(/\r\n/g, '\n');
  const i = src.indexOf(de);
  if (i < 0 || src.indexOf(de, i + 1) >= 0) { introuvables++; console.log((i < 0 ? 'INTROUVABLE ' : 'ANCRE DOUBLE ') + nom); continue; }
  const copie = path.join(ICI, '.mutant-dg2-' + process.pid + '-' + mod);
  fs.writeFileSync(copie, src.slice(0, i) + vers + src.slice(i + de.length));
  let rouge;
  try { rouge = !BANC[banc].every((b) => vert(b, { [varEnv]: copie })); } finally { try { fs.unlinkSync(copie); } catch (_) {} }
  if (rouge) tues++; else survivants++;
  console.log((rouge ? 'tue      ' : 'SURVIT   ') + mod + ' : ' + nom);
}
console.log(JSON.stringify({ temoin, mutants: M.length, tues, survivants, introuvables }));
process.exitCode = temoin && survivants === 0 && introuvables === 0 ? 0 : 1;
