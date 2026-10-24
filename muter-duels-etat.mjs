/* muter-duels-etat.mjs — les MUTANTS de la lecture des duels par l etat (2026-10-24), chacun sur une COPIE (jamais le fichier du depot) :
 *   la copie est ecrite a cote (pour ses imports relatifs), test-duels-etat-20261024.mjs tourne contre elle (DUELS_ETAT_MODULE, SERVEUR_WEB,
 *   REGLEUR_MODULE, APP_HTML), elle est effacee. Chaque mutant doit faire ROUGIR le test (code de sortie != 0). Le texte est remplace tel
 *   quel (fins de ligne d origine conservees : les motifs tiennent sur une ligne).
 * Usage : node muter-duels-etat.mjs */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const MUTANTS = [
  ['etat-none-accepte', 'duels-etat.js', 'DUELS_ETAT_MODULE', "if (!statut || statut === 'None') return null;", 'if (!statut) return null;'],
  ['etat-cancelled-pas-final', 'duels-etat.js', 'DUELS_ETAT_MODULE', "export const STATUTS_FINAUX = Object.freeze(['Settled', 'Cancelled', 'Refunded']);", "export const STATUTS_FINAUX = Object.freeze(['Settled', 'Refunded']);"],
  ['etat-budget-sans-borne', 'duels-etat.js', 'DUELS_ETAT_MODULE', 'neufs.length < budget - nRelire; id--)', 'neufs.length < budget * 10; id--)'],
  ['etat-egalite-pas-remboursee', 'duels-etat.js', 'DUELS_ETAT_MODULE', 'payout: res.egalite ? 0n : res.auGagnant }, refunded: res.egalite };', 'payout: res.egalite ? 0n : res.auGagnant }, refunded: false };'],
  ['etat-joint-sans-joueur', 'duels-etat.js', 'DUELS_ETAT_MODULE', "if ((statut === 'Joined' || statut === 'Settled') && !pris) return null;", ''],
  ['etat-plus-ancien-dabord', 'duels-etat.js', 'DUELS_ETAT_MODULE', 'return { ids: [...neufs, ...relus], restants: jamaisLus - neufs.length };', 'return { ids: [...neufs.reverse(), ...relus], restants: jamaisLus - neufs.length };'],
  ['srv-regle-perime-garde', 'serveur-web.js', 'SERVEUR_WEB', 'if (!d) { duelsSrv.cache.delete(String(id)); rates += 1;', 'if (!d) { rates += 1;'],
  ['srv-tout-rate-sert-vide', 'serveur-web.js', 'SERVEUR_WEB', 'if (ids.length && rates === ids.length) throw', 'if (false) throw'],
  ['srv-echec-jamais-dit', 'serveur-web.js', 'SERVEUR_WEB', "echec: !!duelsSrv.erreur, pourquoi: duelsSrv.erreur || 'first read in progress'", "echec: false, pourquoi: duelsSrv.erreur || 'first read in progress'"],
  ['srv-finals-relus', 'serveur-web.js', 'SERVEUR_WEB', 'duelsSrv.cache.set(String(id), { duel: d, final: e.final, luA: Date.now() });', 'duelsSrv.cache.set(String(id), { duel: d, final: false, luA: Date.now() });'],
  ['regleur-logs-refuses-jettent', 'slots-regleur.js', 'REGLEUR_MODULE', 'if (refusLogs && !parEtat) throw refusLogs;', 'if (refusLogs) throw refusLogs;'],
  ['regleur-refus-tu', 'slots-regleur.js', 'REGLEUR_MODULE', "if (refusLogs) { info.sain = false; erreur('duels logs not read (state list used): ' + msg(refusLogs)); }", 'if (refusLogs) { info.sain = false; }'],
  ['app-promet-encore', 'app.html', 'APP_HTML', "etat.textContent = phraseDuelsNonLus(j);", "etat.textContent = j.etat === 'NON_LU' ? 'The duels are being read on chain — back in a few seconds.' : phraseDuelsNonLus(j);"],
  ['app-sans-echec-being-read', 'app.html', 'APP_HTML', "if (j && j.etat === 'NON_LU' && j.echec === false)", "if (j && j.etat === 'NON_LU' && j.echec !== true)"],
];
let rouges = 0;
for (const [nom, fichier, env, de, vers] of MUTANTS) {
  const src = readFileSync(path.join(ICI, fichier), 'utf8');
  if (src.split(de).length !== 2) { console.log('KO  ' + nom + ' : le motif n existe pas UNE fois dans ' + fichier); process.exitCode = 1; continue; }
  const copie = path.join(ICI, '_mutant-' + nom + '.tmp' + path.extname(fichier));
  writeFileSync(copie, src.replace(de, vers));
  try {
    const r = spawnSync(process.execPath, [path.join(ICI, 'test-duels-etat-20261024.mjs')], { cwd: ICI, env: { ...process.env, TOUT_COMPTER: '1', [env]: copie }, encoding: 'utf8' });
    const kos = (r.stdout.match(/^KO {2}.*$/gm) || []).map((l) => l.replace(/ — .*$/, '').slice(4));
    if (r.status !== 0) { rouges += 1; console.log('ok  ' + nom + ' : ROUGE (' + kos.join(' | ') + ')'); }
    else { console.log('KO  ' + nom + ' : le test reste VERT'); process.exitCode = 1; }
  } finally { unlinkSync(copie); }
}
console.log(rouges + '/' + MUTANTS.length + ' mutants rougissent test-duels-etat-20261024');
