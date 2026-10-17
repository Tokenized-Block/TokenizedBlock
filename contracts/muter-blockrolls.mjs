/* muter-blockrolls.mjs — chaque garde de BlockRolls est RETIREE, une a la fois, dans une COPIE ; la suite doit rougir.
 * Un mutant qui reste vert = une garde que la suite ne tient pas. Ne touche jamais au depot : tout se passe dans un dossier temporaire.
 * Usage (depuis contracts/) : node muter-blockrolls.mjs      [FORGE=chemin/vers/forge]
 * Les 3 gardes exigees par le brief (2026-10-17) sont en tete : fenetre de 256 blocs, gain borne par le pot, bornes du guess. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const SRC = path.dirname(fileURLToPath(import.meta.url));
const ICI = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-blockrolls-'));
fs.mkdirSync(path.join(ICI, 'src'), { recursive: true });
fs.mkdirSync(path.join(ICI, 'test'), { recursive: true });
fs.cpSync(path.join(SRC, 'lib/forge-std'), path.join(ICI, 'lib/forge-std'), { recursive: true, filter: (f) => !/[\\/]\.git([\\/]|$)/.test(f) });
fs.copyFileSync(path.join(SRC, 'foundry.toml'), path.join(ICI, 'foundry.toml'));
fs.copyFileSync(path.join(SRC, 'test/BlockRolls.t.sol'), path.join(ICI, 'test/BlockRolls.t.sol'));
const original = fs.readFileSync(path.join(SRC, 'src/BlockRolls.sol'), 'utf8').replace(/\r\n/g, '\n');
const FORGE = process.env.FORGE || (process.platform === 'win32' ? path.join(os.homedir(), '.foundry/bin/forge.exe') : 'forge');
const lancer = () => {
  try { const o = execFileSync(FORGE, ['test', '--root', ICI], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { vert: true, sortie: o }; }
  catch (e) { return { vert: false, sortie: String(e.stdout || '') + String(e.stderr || '') }; }
};
const M = [
  /* economie du 20:30 : prix fixes plafonnes par le pot, regles du createur de UNIT, tirage du jour */
  ['EXIGE gain non plafonne par le pot', '        if (payout > pot) payout = pot;\n', ''],
  ['prix sous le score minimum', 'if (score < r.minScore) return 0;', ''],
  ['prix : 4/5 paie le prix du 5/5', 'return score == 5 ? r.prize5 : score == 4 ? r.prize4 : r.prize3;', 'return score == 5 ? r.prize5 : score == 4 ? r.prize5 : r.prize3;'],
  ['regles : prix > 1000 USDC admis', 'return p5 <= MAX_PRIZE && p4 <= MAX_PRIZE && p3 <= MAX_PRIZE && minScore >= MIN_SCORE_FLOOR && minScore <= 5;', 'return p4 <= MAX_PRIZE && p3 <= MAX_PRIZE && minScore >= MIN_SCORE_FLOOR && minScore <= 5;'],
  ['regles : minScore 2 admis', 'return p5 <= MAX_PRIZE && p4 <= MAX_PRIZE && p3 <= MAX_PRIZE && minScore >= MIN_SCORE_FLOOR && minScore <= 5;', 'return p5 <= MAX_PRIZE && p4 <= MAX_PRIZE && p3 <= MAX_PRIZE && minScore <= 5;'],
  ['setRules : n importe qui', 'if (c == address(0) || msg.sender != c) revert NotCreator();', ''],
  ['setRules : createur illisible (0) admis', 'if (c == address(0) || msg.sender != c) revert NotCreator();', 'if (msg.sender != c) revert NotCreator();'],
  ['regles : les COURANTES appliquees aux vieux rolls', 'payout = _prizeFor(rules[r.rulesVersion], score);', 'payout = _prizeFor(rules[rulesVersion], score);'],
  ['regles : version non gravee sur le roll', 'rulesVersion: rulesVersion\n', 'rulesVersion: 1\n'],
  ['regles : version non incrementee', 'uint16 v = ++rulesVersion;', 'uint16 v = rulesVersion;'],
  ['settleMany : un roll non en attente fait revert le lot', 'if (r.status != Status.Pending) continue;', 'if (r.status != Status.Pending) revert NotPending();'],
  /* ⚠️ « fenetre retiree » dans settleMany est un mutant EQUIVALENT sous la semantique EVM : hors des 256 blocs (et avant la cible)
   *    blockhash() rend 0 et le roll est saute par la garde du hash -- un saut pour un saut, aucun test ne peut le voir. On mute
   *    donc les BORNES : le dernier bloc de la fenetre doit regler, le premier bloc apres la cible aussi. */
  ['settleMany : dernier bloc de la fenetre refuse', 'if (block.number <= t || block.number > t + SETTLE_WINDOW) continue;', 'if (block.number <= t || block.number >= t + SETTLE_WINDOW) continue;'],
  ['settleMany : premier bloc apres la cible refuse', 'if (block.number <= t || block.number > t + SETTLE_WINDOW) continue;', 'if (block.number <= t + 1 || block.number > t + SETTLE_WINDOW) continue;'],
  ['settleMany : compte faux', '            done++;\n', ''],
  ['settleMany : sans verrou', 'function settleMany(uint256[] calldata ids) external nonReentrant returns', 'function settleMany(uint256[] calldata ids) external returns'],
  ['guess : facette tronquee a 4 bits', 'g[2] = uint8(p >> 7) & 0x1f;', 'g[2] = uint8(p >> 7) & 0x0f;'],
  ['jour : fermeture avant la fin du jour', 'if (today() <= day) revert DayNotOver();', 'if (today() < day) revert DayNotOver();'],
  ['jour : fermeture d un jour deja tire', 'if (d.state == DayState.Drawn) revert DayDone();', ''],
  ['jour : fermeture sans acheteur', 'if (_buyers[day].length == 0) revert NoBuyers();', ''],
  ['jour : re-armement pendant la fenetre', 'if (d.state == DayState.Armed && block.number <= uint256(d.targetBlock) + SETTLE_WINDOW) revert StillSettleable();', ''],
  ['jour : tirage sans fermeture', 'if (d.state != DayState.Armed) revert DayNotArmed();', ''],
  ['jour : tirage trop tot', 'if (block.number <= t) revert TooEarly();\n        if (block.number > t + SETTLE_WINDOW) revert TooLate();\n        bytes32 h = blockhash(t);\n        if (h == bytes32(0)) revert HashUnavailable();\n        address[] storage b', 'if (block.number > t + SETTLE_WINDOW) revert TooLate();\n        bytes32 h = blockhash(t);\n        if (h == bytes32(0)) revert HashUnavailable();\n        address[] storage b'],
  ['jour : tirage hors fenetre', 'if (block.number > t + SETTLE_WINDOW) revert TooLate();\n        bytes32 h = blockhash(t);\n        if (h == bytes32(0)) revert HashUnavailable();\n        address[] storage b', 'bytes32 h = blockhash(t);\n        if (h == bytes32(0)) revert HashUnavailable();\n        address[] storage b'],
  ['jour : hash nul admis', 'if (h == bytes32(0)) revert HashUnavailable();\n        address[] storage b', 'address[] storage b'],
  ['jour : gagnant = le premier acheteur', 'winner = b[uint256(h) % b.length];', 'winner = b[0];'],
  ['jour : paie la moitie du pot', 'amount = d.pot;\n        d.pot = 0;', 'amount = d.pot / 2;\n        d.pot = 0;'],
  ['jour : pot non remis a zero', 'amount = d.pot;\n        d.pot = 0;', 'amount = d.pot;'],
  ['jour : etat non marque tire', 'd.state = DayState.Drawn;', ''],
  ['jour : deux entrees pour un meme wallet', 'if (!entered[day][msg.sender]) {', 'if (true) {'],
  ['jour : la part du pass va au pot des ROLLS', 'd.pot += toPot;\n        if (toPot != 0) _pull(msg.sender, address(this), toPot);\n        if (toDev != 0) _pull(msg.sender, DEV_WALLET, toDev);\n        emit PassBought', 'pot += toPot;\n        if (toPot != 0) _pull(msg.sender, address(this), toPot);\n        if (toDev != 0) _pull(msg.sender, DEV_WALLET, toDev);\n        emit PassBought'],
  ['jour : le jour du pass = le lendemain', 'uint32 day = today();\n        Day storage d', 'uint32 day = today() + 1;\n        Day storage d'],
  /* les 3 du brief */
  ['EXIGE fenetre de 256 blocs retiree', 'if (block.number > t + SETTLE_WINDOW) revert TooLate();\n        bytes32 h = blockhash(t);\n        if (h == bytes32(0)) revert HashUnavailable();\n        return _settle(', 'bytes32 h = blockhash(t);\n        if (h == bytes32(0)) revert HashUnavailable();\n        return _settle('],
  ['EXIGE borne du guess (facette) retiree', 'g[2] >= FACETS || ', ''],
  /* les autres gardes */
  ['borne du guess (bande) relachee', 'g[0] >= BANDS ||', 'g[0] > BANDS ||'],
  ['settle avant que le hash existe', 'if (block.number <= t) revert TooEarly();\n        if (block.number > t + SETTLE_WINDOW) revert TooLate();\n        bytes32 h = blockhash(t);\n        if (h == bytes32(0)) revert HashUnavailable();\n        return _settle(', 'if (block.number > t + SETTLE_WINDOW) revert TooLate();\n        bytes32 h = blockhash(t);\n        if (h == bytes32(0)) revert HashUnavailable();\n        return _settle('],
  ['hash nul accepte', 'if (h == bytes32(0)) revert HashUnavailable();\n        return _settle(', 'return _settle('],
  ['double settle', 'r.status = Status.Settled;', ''],
  ['gain a l appelant', 'address player = r.player;', 'address player = msg.sender;'],
  ['pot non debite du gain', 'pot -= payout;', ''],
  ['settle sans verrou', 'function settle(uint256 rollId) external nonReentrant returns', 'function settle(uint256 rollId) external returns'],
  ['expire pendant la fenetre', 'if (block.number <= uint256(r.targetBlock) + SETTLE_WINDOW) revert StillSettleable();', ''],
  ['expire un roll deja regle', 'if (r.status != Status.Pending) revert NotPending();\n        if (block.number <= uint256(r.targetBlock)', 'if (block.number <= uint256(r.targetBlock)'],
  ['cible = bloc courant', 'uint256 public constant TARGET_DELAY = 2;', 'uint256 public constant TARGET_DELAY = 0;'],
  ['dev prend tout le prix du roll', 'uint256 toDev = ROLL_PRICE - toPot;', 'uint256 toDev = ROLL_PRICE;'],
  ['dev prend tout le prix du pass', 'uint256 toDev = PASS_PRICE - toPot;', 'uint256 toDev = PASS_PRICE;'],
  ['part du pot non comptee', 'pot += toPot;\n        if (toPot != 0) _pull(msg.sender, address(this), toPot);\n        if (toDev != 0) _pull(msg.sender, DEV_WALLET, toDev);\n        emit Rolled', 'if (toPot != 0) _pull(msg.sender, address(this), toPot);\n        if (toDev != 0) _pull(msg.sender, DEV_WALLET, toDev);\n        emit Rolled'],
  ['rachat de pass actif', 'if (p.rollsLeft != 0 && block.timestamp < p.expiresAt) revert PassActive();', ''],
  ['pass sans expiration', 'if (p.rollsLeft == 0 || block.timestamp >= p.expiresAt) revert NoPass();', 'if (p.rollsLeft == 0) revert NoPass();'],
  ['pass sans decompte', 'p.rollsLeft -= 1;', ''],
  ['transferFrom qui rend false accepte', 'if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();\n    }\n\n    function _push', 'ok; ret;\n    }\n\n    function _push'],
  ['fund de 0', 'if (amount == 0) revert ZeroAmount();', ''],
  ['face : teinte sans modulo 361', '* 256 + uint8(k[1])) % 361;\n        face[0]', '* 256 + uint8(k[1])) % 360;\n        face[0]'],
  ['face : hex MAJUSCULE (apparence.js passe en minuscules)', 'bytes16 hexd = "0123456789abcdef";', 'bytes16 hexd = "0123456789ABCDEF";'],
  ['face : orbite lue a l octet 5', 'face[1] = uint8(k[6]) % ORBITS;', 'face[1] = uint8(k[5]) % ORBITS;'],
];
let survivants = 0, introuvables = 0;
try {
  fs.writeFileSync(path.join(ICI, 'src/BlockRolls.sol'), original);
  const t = lancer();
  console.log((t.vert ? 'ok  ' : 'KO  ') + 'temoin : la copie non mutee est verte');
  if (!t.vert) { console.log(t.sortie.slice(-1500)); process.exit(1); }
  for (const [nom, de, vers] of M) {
    const n = original.split(de).length - 1;
    if (n !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + n + ' fois (attendu 1)'); continue; }
    fs.writeFileSync(path.join(ICI, 'src/BlockRolls.sol'), original.replace(de, () => vers));
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
