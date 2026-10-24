/* muter-keeper-fix4-20261024.mjs — chaque correctif du round 4 (porte des duels fermee sur BlockDuels v1 ; tete gelee -> DEGRADE) est RETIRE
 *   ou FAUSSE, un a la fois, dans une COPIE (.mutant-kf4-<pid>-<fichier>, a cote de l original pour que les imports relatifs marchent,
 *   effacee juste apres) ; test-keeper-fix4 est relance sur la copie (REGLEUR_MODULE / DUELS_APP_MODULE / BRAIN_JEU_MODULE) et DOIT rougir.
 *   Aucun fichier du depot n est ecrit. Un temoin d abord : le banc doit etre VERT sur les fichiers non mutes.
 * ⛔ PORTABLE : la source est lue puis CRLF -> LF ; aucune ancre ne porte de saut de ligne. process.exitCode, jamais process.exit.
 * Usage : node muter-keeper-fix4-20261024.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const BANC = 'test-keeper-fix4-20261024.mjs';
const vert = (env = {}) => {
  try { execFileSync(process.execPath, [path.join(ICI, BANC)], { cwd: ICI, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }); return true; }
  catch (_) { return false; }
};
const A = ['duels-plan-app.js', 'DUELS_APP_MODULE'], BR = ['brain-jeu.js', 'BRAIN_JEU_MODULE'], R = ['slots-regleur.js', 'REGLEUR_MODULE'];
const M = [
  /* ---- 1. la porte des duels, fermee sur BlockDuels v1 */
  [...A, 'v1 declare suffisant', "'0x6b7647b326a635c0902eaed41ab0b41746b9602c': false,", "'0x6b7647b326a635c0902eaed41ab0b41746b9602c': true,"],
  [...A, 'regleurCouvre sans la constante par contrat', 'return regleurSuffit(contrat) && regleurLitLesDuels(e, contrat, maintenant);', 'return regleurLitLesDuels(e, contrat, maintenant);'],
  [...A, 'regleurSuffit toujours vrai', 'export const regleurSuffit = (contrat) => declare(contrat) && DUELS_REGLEUR_SUFFIT[bas(contrat)] === true;', 'export const regleurSuffit = (contrat) => true;'],
  [...A, 'duelsOuverts suit la reponse sur v1', 'j.regleur.regleDuels === true && !duelsFermesParContrat(j.contrat));', 'j.regleur.regleDuels === true);'],
  [...A, 'duelsFermesParContrat toujours faux', 'export const duelsFermesParContrat = (contrat) => declare(contrat) && DUELS_REGLEUR_SUFFIT[bas(contrat)] !== true;', 'export const duelsFermesParContrat = (contrat) => false;'],
  [...A, 'phrase : la vieille promesse d ouverture', "'New duels are closed: in this contract,", "'New duels open once the automatic settler runs: in this contract,"],
  [...BR, 'brain : v1 ouvert si open true', 'if (D.open !== true || duelsFermesParContrat(D.contract))', 'if (D.open !== true)'],
  /* ---- 2. la tete gelee */
  [...R, 'gel jamais detecte', 'if (ms > seuilMs) {', 'if (false) {'],
  [...R, 'une tete EGALE compte comme un mouvement', 'if (st.teteMax === null || tete > st.teteMax) {', 'if (st.teteMax === null || tete >= st.teteMax) {'],
  [...R, 'une tete qui RECULE compte comme un mouvement', 'if (st.teteMax === null || tete > st.teteMax) {', 'if (st.teteMax === null || tete !== st.gelee?.lue) {'],
  [...R, 'gel detecte mais on lit et envoie quand meme', '            return { fait: false, pourquoi: st.gelee.pourquoi };', ''],
  [...R, 'etat() ne dit pas DEGRADE', "etat: st.etat === 'ON' && st.gelee ? 'DEGRADE' : st.etat,", 'etat: st.etat,'],
  [...R, 'degrade.teteGelee jamais publie', 'teteGelee: st.gelee ? { ...st.gelee } : null,', 'teteGelee: null,'],
  [...R, 'pourquoi du gel jamais journalise', 'if (neuf) erreur(st.gelee.pourquoi);', ''],
  [...R, 'le gel ne se leve jamais', 'st.teteMax = tete; st.teteMaxA = t1; st.gelee = null; }', 'st.teteMax = tete; st.teteMaxA = t1; }'],
  [...R, 'seuil a 200 ms fixes (le temps de bloc ignore)', 'const seuilMs = bornes.teteGeleeBlocs * (Number(st.msParBloc) > 0 ? Number(st.msParBloc) : 200);', 'const seuilMs = bornes.teteGeleeBlocs * 200;'],
  [...R, 'seuil a 300 blocs', 'teteGeleeBlocs: 30,', 'teteGeleeBlocs: 300,'],
  [...R, 'seuil large (>=)', 'if (ms > seuilMs) {', 'if (ms > seuilMs + 1) {'],
];
const temoin = vert();
console.log((temoin ? 'vert ' : 'ROUGE ') + 'temoin ' + BANC);
let tues = 0, survivants = 0, introuvables = 0;
if (temoin) for (const [mod, varEnv, nom, de, vers] of M) {
  const src = fs.readFileSync(path.join(ICI, mod), 'utf8').replace(/\r\n/g, '\n');
  const i = src.indexOf(de);
  if (i < 0 || src.indexOf(de, i + 1) >= 0) { introuvables++; console.log((i < 0 ? 'INTROUVABLE ' : 'ANCRE DOUBLE ') + mod + ' : ' + nom); continue; }
  const copie = path.join(ICI, '.mutant-kf4-' + process.pid + '-' + mod);
  fs.writeFileSync(copie, src.slice(0, i) + vers + src.slice(i + de.length));
  let rouge;
  try { rouge = !vert({ [varEnv]: copie }); } finally { try { fs.unlinkSync(copie); } catch (_) { /* deja efface */ } }
  if (rouge) tues++; else survivants++;
  console.log((rouge ? 'tue      ' : 'SURVIT   ') + mod + ' : ' + nom);
}
console.log(JSON.stringify({ temoin, mutants: M.length, tues, survivants, introuvables }));
process.exitCode = temoin && survivants === 0 && introuvables === 0 ? 0 : 1;
