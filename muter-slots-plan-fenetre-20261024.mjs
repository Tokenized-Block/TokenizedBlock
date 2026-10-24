/* muter-slots-plan-fenetre-20261024.mjs — les correctifs de slots-plan.js (audit slots-app 2026-10-24 : la fenetre vue d une tx A SIGNER, la
 * marge d une tete en cache, le statut 0 = NON_LU, la phrase « closes within ») sont RETIRES un a la fois dans une COPIE
 * (.mutant-slots-plan-<pid>.js, a cote du module pour ses imports relatifs, effacee a la fin) ; test-slots-carte-20261024 (SLOTS_PLAN_MODULE)
 * doit rougir. Le module du depot n est jamais ecrit. Usage : node muter-slots-plan-fenetre-20261024.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const original = fs.readFileSync(path.join(ICI, 'slots-plan.js'), 'utf8');
const COPIE = path.join(ICI, '.mutant-slots-plan-' + process.pid + '.js');
const lancer = () => {
  try { execFileSync(process.execPath, [path.join(ICI, 'test-slots-carte-20261024.mjs')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SLOTS_PLAN_MODULE: COPIE, CARTE_SANS_MUTANTS: '' } }); return true; }
  catch (_) { return false; }
};
const M = [
  ['fenetre : la tete cible + 256 reglable (0f9d8ec)', "  if (b + m <= fin) return { etat: 'REGLABLE', blocsRestants: Number(fin - b - m + 1n) };", "  if (b <= fin) return { etat: 'REGLABLE', blocsRestants: Number(fin - b) };"],
  ['fenetre : la marge ignoree', 'const m = BigInt(Math.max(1, Math.floor(Number(marge)) || 1)), fin', 'const m = 1n, fin'],
  ['marge : le cache de 4 s oublie', 'export const margeEnvoi = (msParBloc, cacheMs = CACHE_TETE_MS) => 1 + Math.ceil(', 'export const margeEnvoi = (msParBloc, cacheMs = CACHE_TETE_MS) => 1 + 0 * Math.ceil('],
  ['planReglement : la marge non transmise', '...etatReglement(s.t, tete, marge), dernierBloc', '...etatReglement(s.t, tete), dernierBloc'],
  ['etatSpins : la marge non transmise', 'return { id, t: s.targetBlock, ...etatReglement(s.targetBlock, tete, marge) };', 'return { id, t: s.targetBlock, ...etatReglement(s.targetBlock, tete) };'],
  ['etatSpins : statut 0 = clos (0f9d8ec)', "if (st === null || st === undefined || st === 0) return { id, t: s.targetBlock, etat: 'NON_LU' };", "if (st === null || st === undefined) return { id, t: s.targetBlock, etat: 'NON_LU' };"],
  ['phrase : « closed » dit avant la fin de la fenetre', '    case \'PERDU\': return l.fermeDans > 0', '    case \'PERDU\': return false'],
];
let survivants = 0, introuvables = 0, temoin = true;
try {
  fs.writeFileSync(COPIE, original);
  temoin = lancer();
  console.log((temoin ? 'ok  ' : 'KO  ') + 'temoin : la copie non mutee est verte');
  if (temoin) for (const [nom, de, vers] of M) {
    const k = original.split(de).length - 1;
    if (k !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + k + ' fois (attendu 1)'); continue; }
    fs.writeFileSync(COPIE, original.replace(de, () => vers));
    if (lancer()) { survivants += 1; console.log('SURVIT  ' + nom); } else console.log('tue ' + nom);
  }
} finally {
  fs.rmSync(COPIE, { force: true });
}
if (!temoin) process.exit(1);
console.log('\n' + M.length + ' mutants, ' + survivants + ' survivant(s), ' + introuvables + ' ancre(s) introuvable(s)');
process.exit(survivants || introuvables ? 1 : 0);
