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
  /* les 3 du brief */
  ['EXIGE fenetre de 256 blocs retiree', 'if (block.number > t + SETTLE_WINDOW) revert TooLate();', ''],
  ['EXIGE gain non borne par le pot (prix fixe)', 'payout = (pot * bps) / BPS;', 'payout = uint256(bps) * 1000;'],
  ['EXIGE borne du guess (facette) retiree', 'g[2] >= FACETS || ', ''],
  /* les autres gardes */
  ['borne du guess (bande) relachee', 'g[0] >= BANDS ||', 'g[0] > BANDS ||'],
  ['settle avant que le hash existe', 'if (block.number <= t) revert TooEarly();', ''],
  ['hash nul accepte', 'if (h == bytes32(0)) revert HashUnavailable();', ''],
  ['double settle', 'r.status = Status.Settled;', ''],
  ['gain a l appelant', 'address player = r.player;', 'address player = msg.sender;'],
  ['pot non debite du gain', 'pot -= payout;', ''],
  ['settle sans verrou', 'function settle(uint256 rollId) external nonReentrant returns', 'function settle(uint256 rollId) external returns'],
  ['expire pendant la fenetre', 'if (block.number <= uint256(r.targetBlock) + SETTLE_WINDOW) revert StillSettleable();', ''],
  ['expire un roll deja regle', 'if (r.status != Status.Pending) revert NotPending();\n        if (block.number <= uint256(r.targetBlock)', 'if (block.number <= uint256(r.targetBlock)'],
  ['cible = bloc courant', 'uint256 public constant TARGET_DELAY = 2;', 'uint256 public constant TARGET_DELAY = 0;'],
  ['dev prend tout le prix', 'toDev = price - toPot;', 'toDev = price;'],
  ['part du pot non comptee', 'pot += toPot;', ''],
  ['rachat de pass actif', 'if (p.rollsLeft != 0 && block.timestamp < p.expiresAt) revert PassActive();', ''],
  ['pass sans expiration', 'if (p.rollsLeft == 0 || block.timestamp >= p.expiresAt) revert NoPass();', 'if (p.rollsLeft == 0) revert NoPass();'],
  ['pass sans decompte', 'p.rollsLeft -= 1;', ''],
  ['transferFrom qui rend false accepte', 'if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();\n    }\n\n    function _push', 'ok; ret;\n    }\n\n    function _push'],
  ['fund de 0', 'if (amount == 0) revert ZeroAmount();', ''],
  ['P4 > P5 admis', 'p4Bps > p5Bps || ', ''],
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
