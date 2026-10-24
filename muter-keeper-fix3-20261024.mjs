/* muter-keeper-fix3-20261024.mjs — chaque correctif du round 3 de la revue fix2 (regleur : famine par egalites, temps de bloc injecte,
 *   course relue au bloc du recu ; porte des duels D1 : sante de la lecture) est RETIRE ou FAUSSE, un a la fois, dans une COPIE
 *   (.mutant-kf3-<pid>-<fichier>, a cote de l original pour que les imports relatifs marchent, effacee juste apres) ; test-keeper-fix3 est
 *   relance sur la copie (REGLEUR_MODULE / SERVEUR_WEB / DUELS_APP_MODULE / BANC_ANVIL) et DOIT rougir. Aucun fichier du depot n est ecrit.
 *   Un temoin d abord : le banc doit etre VERT sur les fichiers non mutes (sinon un rouge ne prouverait rien).
 *   Les mutants de regleurCouvre (duels-plan-app.js) vivent dans muter-duels-gate-fix2-20261024.mjs ; ceux des ancres reecrites du
 *   regleur dans muter-slots-regleur.mjs (qui relance aussi ce banc).
 * ⛔ PORTABLE : la source est lue puis CRLF -> LF ; aucune ancre ne porte de saut de ligne. process.exitCode, jamais process.exit.
 * Usage : node muter-keeper-fix3-20261024.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const BANC = 'test-keeper-fix3-20261024.mjs';
const vert = (env = {}) => {
  try { execFileSync(process.execPath, [path.join(ICI, BANC)], { cwd: ICI, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }); return true; }
  catch (_) { return false; }
};
const R = ['slots-regleur.js', 'REGLEUR_MODULE'], S = ['serveur-web.js', 'SERVEUR_WEB'], B = ['banc-slots-regleur-anvil-20261023.mjs', 'BANC_ANVIL'];
const M = [
  /* ---- defaut 1 : famine par egalites (chemins A et B) */
  [...R, '1 : une egalite / un final clos est re-suivi (duelsClos ignore)', ' || duelsClos.has(id)) return;', ') return;'],
  [...R, '1 : final connu du cache relu', "if (k && k.final === true) { closDuel(id); continue; }", ''],
  [...R, '1 : connu(id) ignore (guesses du cache non pris)', 'if (k) decouvrir(id, d.t, tete, k);', ''],
  [...R, '1 : budget de classement illimite', 'if (budgetClasse <= 0) continue;', ''],
  [...R, '1 : budget d en-tetes illimite', 'if (budgetEntetes <= 0) continue;', ''],
  [...R, '1 : classement par cible la plus RECENTE', '.sort((a, b) => a[1].t - b[1].t);', '.sort((a, b) => b[1].t - a[1].t);'],
  [...R, '1 : egalite non close (encore suivie)', "if (v === 'egalite') { closDuel(id); st.compteurs.duelsEgalites += 1; continue; }", "if (v === 'egalite') { st.compteurs.duelsEgalites += 1; continue; }"],
  [...R, '1 : eviction des plus anciens (84c848c : n importe quel duel)',
    "if (duelsSuivis.size > bornes.suivisMax) evincer(([, d]) => d.vainqueur === 'rejoignant' && !presse(d), bornes.suivisMax, true);",
    'while (duelsSuivis.size > bornes.suivisMax) duelsSuivis.delete(duelsSuivis.keys().next().value);'],
  [...R, '1 : eviction d un createur gagnant', "evincer(([, d]) => d.vainqueur === 'rejoignant', bornes.suivisMax, true);", 'evincer(() => true, bornes.suivisMax, true);'],
  [...R, '1 : statuts relus au-dela des candidats a envoyer', 'if (out.length >= bornes.simulationsParTour) break;', ''],
  /* ---- defaut 2 : temps de bloc injecte */
  [...R, '2 : msParBloc injecte ignore', 'const fixe = Number(msParBlocFixe) > 0 ? Number(msParBlocFixe) : null;', 'const fixe = null;'],
  [...R, '2 : la mesure ecrase le temps injecte', 'if (fixe !== null) return; /* temps de bloc INJECTE', '/* temps de bloc INJECTE'],
  [...B, '2 : banc anvil sans msParBloc', ", rolls: { contrat: rolls }, msParBloc: 200 });", ", rolls: { contrat: rolls } });"],
  /* ---- defaut 3 : course relue au bloc du recu */
  [...R, "3 : course relue a 'latest'", "const tag = blocRecu !== null && blocRecu > 0 ? '0x' + blocRecu.toString(16) : 'latest';", "const tag = 'latest';"],
  /* ---- defaut 4 : en-tete du banc anvil */
  [...B, '4 : en-tete « 1 a 11 »', 'SEULES des cles de TEST PUBLIQUES, les entiers 1 a 10 :', 'SEULES des cles de TEST PUBLIQUES, les entiers 1 a 11 :'],
  /* ---- porte D1 : la sante de la lecture des duels */
  [...R, 'D1 : erreurLecture jamais effacee apres un succes', "Object.assign(lectureDuels, { lu: new Date(maintenant()).toISOString(), erreur: null, ratees: r.ratees });", "Object.assign(lectureDuels, { lu: new Date(maintenant()).toISOString(), ratees: r.ratees });"],
  [...R, 'D1 : lecture ratee non dite', '} catch (e) { lectureDuels.erreur = msg(e); throw e; }', '} catch (e) { throw e; }'],
  [...R, 'D1 : toutes les lectures du tour ratees = succes', 'if (tentees > 0 && ratees === tentees) throw new Error(', 'if (false) throw new Error('],
  [...R, 'D1 : etat() publie une lecture toujours fraiche', 'lu: lectureDuels.lu, erreurLecture: lectureDuels.erreur,', 'lu: new Date(maintenant()).toISOString(), erreurLecture: null,'],
  [...R, 'D1 : liste de l etat qui jette = lue', '} catch (e) { parEtat = false; if (refusLogs)', '} catch (e) { parEtat = true; if (refusLogs)'],
  [...S, 'D1 : liste de l etat perimee servie au regleur', 'if (!duelsSrv.luOk || Date.now() - duelsSrv.luOk > DUELS_ETAT_FRAIS_MS) throw', 'if (false) throw'],
  [...S, 'D1 : luOk jamais ecrit (succes non date)', '    duelsSrv.luOk = Date.now();', ''],
  [...S, 'D1 : liste d un autre contrat servie', "if (!c || duelsSrv.contrat !== c) throw new Error('duels state list not read for this contract');", ''],
];
const temoin = vert();
console.log((temoin ? 'vert ' : 'ROUGE ') + 'temoin ' + BANC);
let tues = 0, survivants = 0, introuvables = 0;
if (temoin) for (const [mod, varEnv, nom, de, vers] of M) {
  const src = fs.readFileSync(path.join(ICI, mod), 'utf8').replace(/\r\n/g, '\n');
  const i = src.indexOf(de);
  if (i < 0 || src.indexOf(de, i + 1) >= 0) { introuvables++; console.log((i < 0 ? 'INTROUVABLE ' : 'ANCRE DOUBLE ') + mod + ' : ' + nom); continue; }
  const copie = path.join(ICI, '.mutant-kf3-' + process.pid + '-' + mod);
  fs.writeFileSync(copie, src.slice(0, i) + vers + src.slice(i + de.length));
  let rouge;
  try { rouge = !vert({ [varEnv]: copie }); } finally { try { fs.unlinkSync(copie); } catch (_) { /* deja efface */ } }
  if (rouge) tues++; else survivants++;
  console.log((rouge ? 'tue      ' : 'SURVIT   ') + mod + ' : ' + nom);
}
console.log(JSON.stringify({ temoin, mutants: M.length, tues, survivants, introuvables }));
process.exitCode = temoin && survivants === 0 && introuvables === 0 ? 0 : 1;
