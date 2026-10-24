/* muter-rolls-duels-ui-20261024.mjs — chaque garde des correctifs de l audit rolls-duels (2026-10-24) est RETIREE ou FAUSSEE, une a la fois,
 *   dans une COPIE (.mutant-rdui-<pid>-<module>, a cote du module pour que ses imports relatifs marchent, effacee juste apres) ; le banc qui la
 *   couvre est relance sur la copie (variable d environnement) et DOIT rougir. Aucun fichier du depot n est ecrit. Un temoin d abord : chaque
 *   banc doit etre VERT sur les modules non mutes (sinon un rouge ne prouverait rien).
 * Usage : node muter-rolls-duels-ui-20261024.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const BANC = {
  duels: ['test-duels-ouverture-20261024.mjs'], regles: ['test-rolls-regles-20261024.mjs'], textes: ['test-rolls-risques-textes-20261024.mjs'], serveur: ['test-serveur-regles-duels-20261024.mjs'],
};
const vert = (banc, env = {}) => { try { execFileSync(process.execPath, [path.join(ICI, banc)], { cwd: ICI, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, timeout: 240000 }); return true; } catch (_) { return false; } };
/* [module, variable, banc, nom, de, vers] */
const M = [
  ['duels-plan-app.js', 'DUELS_APP_MODULE', 'duels', 'regleur OFF couvre', "if (!e || e.etat !== 'ON' || !ADR.test(c)", 'if (!e || !ADR.test(c)'],
  ['duels-plan-app.js', 'DUELS_APP_MODULE', 'duels', 'sans contrats[] : couvre', '!Array.isArray(e.contrats)) return false;', '!Array.isArray(e.contrats)) return true;'],
  ['duels-plan-app.js', 'DUELS_APP_MODULE', 'duels', 'contrat ARRETE couvre', "(x.etat === undefined || x.etat === 'ON')", 'true'],
  ['duels-plan-app.js', 'DUELS_APP_MODULE', 'duels', 'regleDuels « true » en texte ouvre', 'j.regleur.regleDuels === true', '!!j.regleur.regleDuels'],
  ['duels-plan-app.js', 'DUELS_APP_MODULE', 'duels', 'actionsDuel ouvert par defaut', 'export function actionsDuel(d, moi, tete, maintenant, ouverts = false)', 'export function actionsDuel(d, moi, tete, maintenant, ouverts = true)'],
  ['duels-plan-app.js', 'DUELS_APP_MODULE', 'duels', 'JOIN sans garde', 'return ouverts === true && e.resteS >= MARGE_JOIN_S', 'return e.resteS >= MARGE_JOIN_S'],
  ['brain-jeu.js', 'BRAIN_JEU_MODULE', 'duels', 'brain : garde retiree', "if (D.open !== true) pourquoiPas.push('duels: new duels open once the automatic settler runs');\n    else if", 'if'],
  ['brain-jeu.js', 'BRAIN_JEU_MODULE', 'duels', 'brain : open absent = ouvert', 'if (D.open !== true) pourquoiPas.push(', 'if (D.open === false) pourquoiPas.push('],
  ['rolls-regles.js', 'ROLLS_REGLES_MODULE', 'regles', 'version non relue', 'if (v1 === null || r === null || v1 !== v2)', 'if (v1 === null || r === null)'],
  ['rolls-regles.js', 'ROLLS_REGLES_MODULE', 'regles', 'bornes de _rulesOk ignorees', 'return reglesValides(r) ? r : null;', 'return r;'],
  ['rolls-regles.js', 'ROLLS_REGLES_MODULE', 'regles', 'lecture jamais perimee', 'if (!st.val || maintenant() - st.luOk > perimeMs) return null;', 'if (!st.val) return null;'],
  ['rolls-regles.js', 'ROLLS_REGLES_MODULE', 'regles', 'echec : retombe sur la fiche', '() => { st.ok = false; })', "() => { st.ok = false; if (!st.val) { st.val = { prizes: ['5000000', '3000000', '1000000', '500000'], minScore: 2, version: 1 }; st.luOk = maintenant(); } })"],
  ['rolls-regles.js', 'ROLLS_REGLES_MODULE', 'regles', 'paliers sous minScore montres', '.filter((p) => p.score >= r.minScore);', ';'],
  ['rolls-regles.js', 'ROLLS_REGLES_MODULE', 'regles', 'non lues : un montant montre', "' ' + PHRASE_GAINS_NON_LUS + ' — no prize amount is shown;", "' ' + PHRASE_GAINS_NON_LUS + ' — up to 5.00 USDC;"],
  ['rolls-regles.js', 'ROLLS_REGLES_MODULE', 'regles', 'adresse nulle admise', 'if (v === null || v >> 160n !== 0n || v === 0n) return null;', 'if (v === null || v >> 160n !== 0n) return null;'],
  ['rolls-regles.js', 'ROLLS_REGLES_MODULE', 'regles', 'ttl ignore', 'if (st.essai && t - st.essai < (st.ok ? ttlMs : echecMs)) return Promise.resolve();', ''],
  ['rolls-regles.js', 'ROLLS_REGLES_MODULE', 'regles', 'MAX_PRIZE ignore', "if (maxPrize !== null && !reglesValides(r, maxPrize)) throw new Error('BlockRolls: the rules read are above MAX_PRIZE');", ''],
  ['frais-risques.js', 'FRAIS_RISQUES_MODULE', 'textes', 'retour de « no withdrawal »', 'it has no withdraw function: USDC leaves only through a winning settle or a day draw; who can change the prizes is under Risks', 'no owner, no withdrawal: USDC leaves only through a winning settle or a day draw'],
  ['frais-risques.js', 'FRAIS_RISQUES_MODULE', 'textes', 'createur jamais nomme', "(createurLu ? lienBase(createurLu) + ', read by our server' : 'not read just now')", "'not read just now'"],
  ['frais-risques.js', 'FRAIS_RISQUES_MODULE', 'textes', 'regles lues ignorees (fiche)', 'const ro = rgLu ? {', 'const ro = false ? {'],
  ['frais-risques.js', 'FRAIS_RISQUES_MODULE', 'textes', 'risque du re-armement retire', '<li><b>The day-pass draw can be re-armed.</b>', '<li><b>The day-pass draw.</b>'],
  ['frais-risques.js', 'FRAIS_RISQUES_MODULE', 'textes', 'MAX_PRIZE lu ignore', '(maxLu !== null ? usdc(maxLu) :', '(false ? usdc(maxLu) :'],
  ['frais-risques.js', 'FRAIS_RISQUES_MODULE', 'textes', 'phrase structurelle retiree', "'Nothing in the contract stops that wallet from raising the prizes and then rolling itself, so the roll pot is not out of its reach.</li>'", "'</li>'"],
  ['rolls-en-attente.js', 'ROLLS_ATTENTE_MODULE', 'textes', 'carte du pass muette', "if (!['FERMER', 'ATTENDRE', 'TIRER'].includes(action) || !fenetre) return '';", "return '';"],
  ['rolls-en-attente.js', 'ROLLS_ATTENTE_MODULE', 'textes', 'ligne aussi sans tirage', "if (!['FERMER', 'ATTENDRE', 'TIRER'].includes(action) || !fenetre) return '';", "if (!fenetre) return '';"],
  ['serveur-web.js', 'SERVEUR_MODULE', 'serveur', 'serveur : gains non lus -> fiche', 'prizes: rgR ? rgR.prizes : null,', 'prizes: rgR ? rgR.prizes : [rc.prize5, rc.prize4, rc.prize3, rc.prize2].map(String),'],
  ['serveur-web.js', 'SERVEUR_MODULE', 'serveur', 'serveur : minScore non lu -> fiche', 'minScore: rgR ? rgR.minScore : null,', 'minScore: rgR ? rgR.minScore : rc.minScore,'],
  ['serveur-web.js', 'SERVEUR_MODULE', 'serveur', 'serveur : toujours la fiche', 'const rgR = contratRolls ? reglesRollsSrv.servi() : null;', 'const rgR = contratRolls ? { prizes: [rc.prize5, rc.prize4, rc.prize3, rc.prize2].map(String), minScore: rc.minScore, version: 1 } : null;'],
  ['serveur-web.js', 'SERVEUR_MODULE', 'serveur', 'serveur : duels ouverts sans regleur', 'regleDuels: regleurCouvre(eReg, contrat) };', 'regleDuels: true };'],
  ['serveur-web.js', 'SERVEUR_MODULE', 'serveur', 'serveur : rolls-regles.js non servi', "  'rolls-regles.js',\n", ''],
];
let temoin = true;
for (const b of Object.values(BANC).flat()) { const v = vert(b); console.log((v ? 'vert ' : 'ROUGE ') + 'temoin ' + b); temoin = temoin && v; }
let tues = 0, survivants = 0, introuvables = 0;
if (temoin) for (const [mod, varEnv, banc, nom, de, vers] of M) {
  const src = fs.readFileSync(path.join(ICI, mod), 'utf8').replace(/\r\n/g, '\n');
  const i = src.indexOf(de);
  if (i < 0) { introuvables++; console.log('INTROUVABLE ' + nom); continue; }
  const copie = path.join(ICI, '.mutant-rdui-' + process.pid + '-' + mod);
  fs.writeFileSync(copie, src.slice(0, i) + vers + src.slice(i + de.length));
  let rouge;
  try { rouge = !BANC[banc].every((b) => vert(b, { [varEnv]: copie })); } finally { try { fs.unlinkSync(copie); } catch (_) {} }
  if (rouge) tues++; else survivants++;
  console.log((rouge ? 'tue      ' : 'SURVIT   ') + mod + ' : ' + nom);
}
console.log(JSON.stringify({ temoin, mutants: M.length, tues, survivants, introuvables }));
process.exitCode = temoin && survivants === 0 && introuvables === 0 ? 0 : 1;
