/* muter-duels-plan.mjs — chaque garde de duels-plan.js est RETIREE ou FAUSSEE, une a la fois, dans une COPIE ; test-duels-plan doit rougir.
 * La copie s ecrit a cote de l original (duels-plan.mutant-<pid>.mjs : ses imports relatifs ./keccak.js, ./blockrolls-plan.js doivent
 * resoudre) et elle est EFFACEE a la fin, meme en cas d erreur. duels-plan.js n est jamais touche.
 * Usage : node muter-duels-plan.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const original = fs.readFileSync(path.join(ICI, 'duels-plan.js'), 'utf8');
const COPIE = path.join(ICI, 'duels-plan.mutant-' + process.pid + '.mjs');
const lancer = () => {
  try { execFileSync(process.execPath, ['test-duels-plan-20261018.mjs'], { cwd: ICI, env: { ...process.env, DUELS_PLAN: COPIE }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }); return { vert: true, sortie: '' }; }
  catch (e) { return { vert: false, sortie: String(e.stdout || '') + String(e.stderr || '') }; }
};
const M = [
  ['EXIGE approbation infinie', "approuver(jeton, contrat, m, 'approve exactly the stake", "approuver(jeton, contrat, (1n << 256n) - 1n, 'approve exactly the stake"],
  ['EXIGE join : approve au contrat au lieu du jeton du duel', 'approuver(duel.token, contrat, m,', 'approuver(contrat, contrat, m,'],
  ['EXIGE rejoindre son propre duel', "if (wallet && bas(wallet) === bas(duel.creator)) return refuse('you cannot join your own duel');", ''],
  ['EXIGE partage : poussiere hors du dev', 'return { pot, gagnant, pool, dev: pot - gagnant - pool };', 'return { pot, gagnant, pool, dev: (pot * 300n) / BPS };'],
  ['partage : pot commun 3 %', 'export const POOL_BPS = 700n;', 'export const POOL_BPS = 300n;'],
  ['mise minimum 99999', 'export const MIN_STAKE = 100000n;', 'export const MIN_STAKE = 99999n;'],
  ['mise sans plafond', "if (m > MAX_STAKE) return 'the stake is at most 2^96 - 1 raw units';", ''],
  ['expiration minimum retiree', 'if (!Number.isInteger(e) || e < MIN_EXPIRY || e > MAX_EXPIRY)', 'if (!Number.isInteger(e) || e > MAX_EXPIRY)'],
  ['expiration maximum exclusive', 'if (!Number.isInteger(e) || e < MIN_EXPIRY || e > MAX_EXPIRY)', 'if (!Number.isInteger(e) || e < MIN_EXPIRY || e >= MAX_EXPIRY)'],
  ['jeton non admis accepte (creer)', "if (admis === false) return refuse('this token is not admitted for duels');", ''],
  ['jeton retire accepte (rejoindre)', "if (admis === false) return refuse('this token is no longer admitted", "if (false) return refuse('this token is no longer admitted"],
  ['join a expiresAt', 'if (Number(maintenant) >= Number(duel.expiresAt)) return refuse', 'if (Number(maintenant) > Number(duel.expiresAt)) return refuse'],
  ['join d un duel pas ouvert', "if (Number(duel.status) !== OPEN) return refuse('this duel is not open');", ''],
  ['join sans duel lu', "if (!duel) return refuse('read the duel on chain first (token and stake)');", 'if (!duel) duel = { status: 1, expiresAt: 1e12, token: contrat, stake: MIN_STAKE };'],
  ['create : mise et guess inverses', "a(jeton) + u(m) + motsGuess(guess) + u(e)", "a(jeton) + motsGuess(guess) + u(m) + u(e)"],
  ['create : selecteur uint256 au lieu de uint64', "export const SIG_CREATE = 'create(address,uint256,uint8[5],uint64)';", "export const SIG_CREATE = 'create(address,uint256,uint8[5],uint256)';"],
  ['fenetre : dernier bloc non reglable', 'if (b <= t + BigInt(FENETRE)) return', 'if (b < t + BigInt(FENETRE)) return'],
  ['fenetre : reglable au bloc cible', 'if (b <= t) return { etat: \'TROP_TOT\'', 'if (b < t) return { etat: \'TROP_TOT\''],
  ['refund d un duel rejoint encore reglable', "if (etatReglement(duel.targetBlock, blocActuel).etat !== 'REMBOURSABLE') return refuse", "if (false) return refuse"],
  ['refund d un duel ouvert non expire', "if (Number(maintenant) < Number(duel.expiresAt)) return refuse('this duel is still open", "if (false) return refuse('this duel is still open"],
  ['cancel par un autre que le createur', "if (duel && wallet && bas(wallet) !== bas(duel.creator)) return refuse('only the creator can cancel');", ''],
  ['Settled : egalite rend l adresse zero', 'winner: egalite ? null : w,', 'winner: w,'],
  ['lireDuel : facette tronquee a 4 bits', '(v >> 7) & 0x1f', '(v >> 7) & 0x0f'],
  ['lireDuel : ordre joiner / token inverse', "['joiner', 'address'], ['targetBlock', 'uint40'], ['guessB', 'uint24'], ['token', 'address']", "['token', 'address'], ['targetBlock', 'uint40'], ['guessB', 'uint24'], ['joiner', 'address']"],
  ['Joined : longueur non verifiee (lit un Joined tronque)','if (m.length !== 6) return null;', ''],
];
let survivants = 0, introuvables = 0;
try {
  fs.writeFileSync(COPIE, original);
  const t = lancer();
  console.log((t.vert ? 'ok  ' : 'KO  ') + 'temoin : la copie non mutee est verte');
  if (!t.vert) { console.log(t.sortie.slice(-1500)); process.exit(1); }
  for (const [nom, de, vers] of M) {
    const n = original.split(de).length - 1;
    if (n !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + n + ' fois (attendu 1)'); continue; }
    fs.writeFileSync(COPIE, original.replace(de, () => vers));
    const r = lancer();
    const raison = (r.sortie.match(/AssertionError[^:]*: ([^\n]*)/) || r.sortie.match(/(SyntaxError[^\n]*)/) || ['', '?'])[1];
    if (r.vert) { survivants += 1; console.log('SURVIT  ' + nom); }
    else console.log('tue ' + nom + ' — ' + raison.slice(0, 110));
  }
} finally {
  fs.rmSync(COPIE, { force: true });
}
console.log('\n' + M.length + ' mutants, ' + survivants + ' survivant(s), ' + introuvables + ' ancre(s) introuvable(s) ; copie effacee : ' + !fs.existsSync(COPIE));
process.exit(survivants || introuvables ? 1 : 0);
