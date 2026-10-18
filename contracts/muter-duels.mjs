/* muter-duels.mjs — chaque garde de BlockDuels est RETIREE ou FAUSSEE, une a la fois, dans une COPIE ; la suite doit rougir.
 * Un mutant qui reste vert = une garde que la suite ne tient pas. Ne touche jamais au depot : tout se passe dans un dossier temporaire.
 * Usage (depuis contracts/) : node muter-duels.mjs      [FORGE=chemin/vers/forge]
 * Les gardes du brief (Phil 2026-10-18) sont en tete : partage 90/7/3 exact, egalite remboursee, cancel, expiration, 256 blocs,
 * reentree, jeton sans bool, son propre duel, double settle, jeton retire. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const SRC = path.dirname(fileURLToPath(import.meta.url));
const ICI = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-duels-'));
fs.mkdirSync(path.join(ICI, 'src'), { recursive: true });
fs.mkdirSync(path.join(ICI, 'test'), { recursive: true });
fs.cpSync(path.join(SRC, 'lib/forge-std'), path.join(ICI, 'lib/forge-std'), { recursive: true, filter: (f) => !/[\\/]\.git([\\/]|$)/.test(f) });
fs.copyFileSync(path.join(SRC, 'foundry.toml'), path.join(ICI, 'foundry.toml'));
fs.copyFileSync(path.join(SRC, 'test/BlockDuels.t.sol'), path.join(ICI, 'test/BlockDuels.t.sol'));
/* la parite de la face compare a BlockRolls : la copie NON mutee de BlockRolls l accompagne */
fs.copyFileSync(path.join(SRC, 'src/BlockRolls.sol'), path.join(ICI, 'src/BlockRolls.sol'));
const original = fs.readFileSync(path.join(SRC, 'src/BlockDuels.sol'), 'utf8').replace(/\r\n/g, '\n');
const DEFAUT = path.join(os.homedir(), '.foundry/versions/base-v1.1.1/forge.exe');
const FORGE = process.env.FORGE || (process.platform === 'win32' ? (fs.existsSync(DEFAUT) ? DEFAUT : path.join(os.homedir(), '.foundry/bin/forge.exe')) : 'forge');
const lancer = () => {
  try { const o = execFileSync(FORGE, ['test', '--offline', '--root', ICI, '--match-contract', 'BlockDuelsTest'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { vert: true, sortie: o }; }
  catch (e) { return { vert: false, sortie: String(e.stdout || '') + String(e.stderr || '') }; }
};
const M = [
  /* le partage 90 / 7 / 3 et la somme exacte */
  ['EXIGE gagnant 100 % (pas de frais)', 'uint256 public constant WINNER_BPS = 9_000;', 'uint256 public constant WINNER_BPS = 9_700;'],
  ['EXIGE pot commun a 0', 'uint256 public constant POOL_BPS = 700;', 'uint256 public constant POOL_BPS = 0;'],
  ['EXIGE poussiere gardee dans le contrat (dev = 3 % arrondi)', 'toDev = pot - toWinner - toPool;', 'toDev = (pot * 300) / BPS;'],
  ['pot = une seule mise', 'uint256 pot = 2 * stake;', 'uint256 pot = stake;'],
  ['pot commun paye au dev', '_pay(token, REWARD_POOL, p);', '_pay(token, DEV_WALLET, p);'],
  ['part du dev non payee', '_pay(token, DEV_WALLET, dv);', ''],
  ['gain a l appelant', '_pay(token, winner, w);', '_pay(token, msg.sender, w);'],
  ['gagnant inverse', 'winner = sA > sB ? d.creator : d.joiner;', 'winner = sA < sB ? d.creator : d.joiner;'],
  /* egalite */
  ['EXIGE egalite : le joueur B gagne', 'if (sA == sB) {', 'if (false) {'],
  ['egalite : B non rembourse', '            _pay(d.token, d.creator, d.stake);\n            _pay(d.token, d.joiner, d.stake);\n            emit Settled', '            _pay(d.token, d.creator, d.stake);\n            emit Settled'],
  /* cancel */
  ['EXIGE cancel par n importe qui', 'if (msg.sender != d.creator) revert NotCreator();', ''],
  ['cancel apres join', 'if (d.status != Status.Open) revert NotOpen();\n        if (msg.sender != d.creator)', 'if (msg.sender != d.creator)'],
  ['cancel sans changer l etat (double remboursement)', 'd.status = Status.Cancelled;', ''],
  /* join */
  ['EXIGE rejoindre son propre duel', 'if (msg.sender == d.creator) revert OwnDuel();', ''],
  ['join apres expiration', 'if (block.timestamp >= d.expiresAt) revert Expired();', ''],
  ['join a la seconde d expiration', 'if (block.timestamp >= d.expiresAt) revert Expired();', 'if (block.timestamp > d.expiresAt) revert Expired();'],
  ['join sur un duel deja rejoint', 'if (d.status != Status.Open) revert NotOpen();\n        if (block.timestamp >= d.expiresAt)', 'if (block.timestamp >= d.expiresAt)'],
  ['join d un jeton retire', 'if (!tokenOk[d.token]) revert TokenNotAdmitted();', ''],
  ['join tire la moitie de la mise', '_pullExact(d.token, msg.sender, d.stake);', '_pullExact(d.token, msg.sender, d.stake / 2);'],
  ['cible = bloc courant', 'uint256 public constant TARGET_DELAY = 2;', 'uint256 public constant TARGET_DELAY = 0;'],
  /* settle */
  ['EXIGE double settle', 'if (d.status != Status.Joined) revert NotJoined();\n        uint256 t = d.targetBlock;', 'uint256 t = d.targetBlock;'],
  ['EXIGE settle sans changer l etat', '        d.status = Status.Settled;\n', ''],
  ['settle avant que le hash existe', 'if (block.number <= t) revert TooEarly();', ''],
  ['settle hors fenetre', 'if (block.number > t + SETTLE_WINDOW) revert TooLate();', ''],
  ['settle dernier bloc refuse', 'if (block.number > t + SETTLE_WINDOW) revert TooLate();', 'if (block.number >= t + SETTLE_WINDOW) revert TooLate();'],
  ['hash nul accepte', 'if (h == bytes32(0)) revert HashUnavailable();', ''],
  /* refundExpired */
  ['EXIGE remboursement pendant la fenetre de settle', 'if (block.number <= uint256(d.targetBlock) + SETTLE_WINDOW) revert NotRefundable();', ''],
  ['remboursement au dernier bloc reglable', 'if (block.number <= uint256(d.targetBlock) + SETTLE_WINDOW) revert NotRefundable();', 'if (block.number < uint256(d.targetBlock) + SETTLE_WINDOW) revert NotRefundable();'],
  ['EXIGE remboursement 256 blocs : B oublie', '            _pay(d.token, d.creator, stake);\n            _pay(d.token, d.joiner, stake);\n            emit Refunded(id, stake, stake);', '            _pay(d.token, d.creator, stake);\n            emit Refunded(id, stake, stake);'],
  ['remboursement d un duel ouvert avant expiration', 'if (block.timestamp < d.expiresAt) revert NotRefundable();', ''],
  ['remboursement rejoint sans changer l etat', '            d.status = Status.Refunded;\n            _pay(d.token, d.creator, stake);\n            _pay(d.token, d.joiner, stake);', '            _pay(d.token, d.creator, stake);\n            _pay(d.token, d.joiner, stake);'],
  ['remboursement ouvert sans changer l etat', '            d.status = Status.Refunded;\n            _pay(d.token, d.creator, stake);\n            emit Refunded(id, stake, 0);', '            _pay(d.token, d.creator, stake);\n            emit Refunded(id, stake, 0);'],
  /* reentree */
  ['EXIGE settle sans verrou', 'function settle(uint256 id) external nonReentrant returns', 'function settle(uint256 id) external returns'],
  ['refundExpired sans verrou', 'function refundExpired(uint256 id) external nonReentrant {', 'function refundExpired(uint256 id) external {'],
  ['cancel sans verrou', 'function cancel(uint256 id) external nonReentrant {', 'function cancel(uint256 id) external {'],
  /* jetons */
  ['EXIGE jeton sans bool refuse', 'if (ret.length == 0) return true;', 'if (ret.length == 0) return false;'],
  ['jeton qui rend false accepte', 'return abi.decode(ret, (uint256)) == 1;', 'return true;'],
  ['jeton a frais accepte', 'if (_balance(token) != b0 + amount) revert NotExact();', ''],
  ['un paiement refuse bloque tout', '        if (!_tryPush(token, to, amount)) {\n            owed[token][to] += amount;', '        if (!_tryPush(token, to, amount)) {\n            revert TransferFailed();'],
  ['claim sans remise a zero', 'owed[token][msg.sender] = 0;', ''],
  ['claim echoue en silence', 'if (!_tryPush(token, to, a)) revert TransferFailed();', '_tryPush(token, to, a);'],
  ['setToken par n importe qui', 'if (msg.sender != GUARDIAN) revert NotGuardian();', ''],
  ['setToken : USDC retirable', 'if (token == address(0) || token == USDC) revert BadToken();', 'if (token == address(0)) revert BadToken();'],
  ['setToken : jeton sans code admis', 'if (ok && token.code.length == 0) revert BadToken();', ''],
  ['USDC non admis a la construction', '        tokenOk[usdc] = true;\n', ''],
  ['create d un jeton non admis', 'if (!tokenOk[token]) revert TokenNotAdmitted();\n        if (stake < MIN_STAKE', 'if (stake < MIN_STAKE'],
  /* bornes */
  ['mise minimum relachee', 'if (stake < MIN_STAKE || stake > MAX_STAKE) revert BadStake();', 'if (stake == 0 || stake > MAX_STAKE) revert BadStake();'],
  ['mise sans plafond', 'if (stake < MIN_STAKE || stake > MAX_STAKE) revert BadStake();', 'if (stake < MIN_STAKE) revert BadStake();'],
  ['expiration minimum relachee', 'if (expiresIn < MIN_EXPIRY || expiresIn > MAX_EXPIRY) revert BadExpiry();', 'if (expiresIn > MAX_EXPIRY) revert BadExpiry();'],
  ['expiration maximum relachee', 'if (expiresIn < MIN_EXPIRY || expiresIn > MAX_EXPIRY) revert BadExpiry();', 'if (expiresIn < MIN_EXPIRY) revert BadExpiry();'],
  ['borne du guess (facette) retiree', 'g[2] >= FACETS || ', ''],
  ['borne du guess (bande) relachee', 'g[0] >= BANDS ||', 'g[0] > BANDS ||'],
  ['ids reutilises', 'id = nextId++;', 'id = nextId;'],
  ['guess B non grave', 'd.guessB = g;', ''],
  /* la face (copie de BlockRolls) */
  ['face : teinte sans modulo 361', '* 256 + uint8(k[1])) % 361;\n        face[0]', '* 256 + uint8(k[1])) % 360;\n        face[0]'],
  ['face : hex MAJUSCULE (apparence.js passe en minuscules)', 'bytes16 hexd = "0123456789abcdef";', 'bytes16 hexd = "0123456789ABCDEF";'],
  ['face : orbite lue a l octet 5', 'face[1] = uint8(k[6]) % ORBITS;', 'face[1] = uint8(k[5]) % ORBITS;'],
];
let survivants = 0, introuvables = 0;
try {
  fs.writeFileSync(path.join(ICI, 'src/BlockDuels.sol'), original);
  const t = lancer();
  console.log((t.vert ? 'ok  ' : 'KO  ') + 'temoin : la copie non mutee est verte');
  if (!t.vert) { console.log(t.sortie.slice(-1500)); process.exit(1); }
  for (const [nom, de, vers] of M) {
    const n = original.split(de).length - 1;
    if (n !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + n + ' fois (attendu 1)'); continue; }
    fs.writeFileSync(path.join(ICI, 'src/BlockDuels.sol'), original.replace(de, () => vers));
    const r = lancer();
    const compile = !/Compiler run failed/.test(r.sortie);
    const rouges = [...new Set((r.sortie.match(/^\[FAIL[^\n]*/gm) || []).map((l) => (l.match(/(test\w+)\(/) || ['', '?'])[1]))];
    if (r.vert) { survivants += 1; console.log('SURVIT  ' + nom); }
    else console.log('tue ' + nom + (compile ? ' — ' + rouges.length + ' rouge(s) : ' + rouges.slice(0, 4).join(', ') : ' — NE COMPILE PAS (ne prouve rien)'));
  }
} finally {
  fs.rmSync(ICI, { recursive: true, force: true });
}
console.log('\n' + M.length + ' mutants, ' + survivants + ' survivant(s), ' + introuvables + ' ancre(s) introuvable(s)');
process.exit(survivants || introuvables ? 1 : 0);
