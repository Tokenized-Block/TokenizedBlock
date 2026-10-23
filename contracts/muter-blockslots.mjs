/* muter-blockslots.mjs — chaque garde de BlockSlots est RETIREE ou FAUSSEE, une a la fois, dans une COPIE ; la suite forge doit rougir.
 * Un mutant qui reste vert = une garde que la suite ne tient pas. Ne touche jamais au depot : tout se passe dans un dossier temporaire.
 * Usage (depuis contracts/) : node muter-blockslots.mjs      [FORGE=chemin/vers/forge] */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const SRC = path.dirname(fileURLToPath(import.meta.url));
const ICI = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-blockslots-'));
fs.mkdirSync(path.join(ICI, 'src'), { recursive: true });
fs.mkdirSync(path.join(ICI, 'test'), { recursive: true });
fs.cpSync(path.join(SRC, 'lib/forge-std'), path.join(ICI, 'lib/forge-std'), { recursive: true, filter: (f) => !/[\\/]\.git([\\/]|$)/.test(f) });
fs.copyFileSync(path.join(SRC, 'foundry.toml'), path.join(ICI, 'foundry.toml'));
fs.copyFileSync(path.join(SRC, 'test/BlockSlots.t.sol'), path.join(ICI, 'test/BlockSlots.t.sol'));
const original = fs.readFileSync(path.join(SRC, 'src/BlockSlots.sol'), 'utf8').replace(/\r\n/g, '\n');
const FORGE = process.env.FORGE || (process.platform === 'win32' ? path.join(os.homedir(), '.foundry/bin/forge.exe') : 'forge');
const lancer = () => {
  try { const o = execFileSync(FORGE, ['test', '--root', ICI, '--match-contract', 'BlockSlotsTest'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { vert: true, sortie: o }; }
  catch (e) { return { vert: false, sortie: String(e.stdout || '') + String(e.stderr || '') }; }
};
const M = [
  /* l argent */
  ['gain non plafonne par le pot', '        if (payout > pot) payout = pot;\n', ''],
  ['part du pot : tout au pot', 'uint256 toPot = (SPIN_PRICE * POT_SHARE_BPS) / BPS;', 'uint256 toPot = SPIN_PRICE;'],
  ['part du dev non envoyee', '        if (toDev != 0) _pull(msg.sender, DEV_WALLET, toDev);\n', ''],
  ['fund : pot non credite', '        pot += amount;\n        _pull(msg.sender, address(this), amount);', '        _pull(msg.sender, address(this), amount);'],
  ['le gain va a l appelant', 'if (payout != 0) _push(player, payout);', 'if (payout != 0) _push(msg.sender, payout);'],
  /* l avantage de la maison et la table */
  ['esperance non verifiee', '        if (expectedNumerator(c.prizes) * BPS >= c.spinPrice * c.potShareBps * DIST_DENOM) revert BadConfig();\n', ''],
  ['esperance : > au lieu de >=', 'expectedNumerator(c.prizes) * BPS >= c.spinPrice', 'expectedNumerator(c.prizes) * BPS > c.spinPrice * 2'],
  ['esperance contre le prix, pas la part du pot', 'c.spinPrice * c.potShareBps * DIST_DENOM', 'c.spinPrice * BPS * DIST_DENOM'],
  ['table non ordonnee admise', '        for (uint256 k = 1; k <= MAX_POINTS; k++) if (c.prizes[k] < c.prizes[k - 1]) revert BadConfig();\n', ''],
  ['table au-dela du max admise', '        if (c.prizes[MAX_POINTS] > MAX_PRIZE) revert BadConfig();\n', ''],
  ['distribution : une case faussee', '            7648590723549578990455994844309854827315200,', '            7648590723549578990455994844309854827315201,'],
  /* les points */
  ['brelan compte 1', 'if (a == b && b == c) p += 3;', 'if (a == b && b == c) p += 1;'],
  ['paire (faces 0 et 2) ignoree', 'else if (a == b || b == c || a == c) p += 1;', 'else if (a == b || b == c) p += 1;'],
  ['paire compte 2', 'else if (a == b || b == c || a == c) p += 1;', 'else if (a == b || b == c || a == c) p += 2;'],
  ['points non cumules', '        pointsOf[player] = total;\n', ''],
  /* les faces */
  ['graine sans l id', 'return keccak256(abi.encode(blockHash, spinId, reel));', 'return keccak256(abi.encode(blockHash, reel));'],
  ['deux faces sur la meme graine', 'for (uint256 r = 0; r < REELS; r++) f[r] = faceOf(seedOf(blockHash, spinId, r));', 'for (uint256 r = 0; r < REELS; r++) f[r] = faceOf(seedOf(blockHash, spinId, r == 2 ? 1 : r));'],
  ['facette modulo 18', 'face[2] = uint8(k[7]) % FACETS;', 'face[2] = uint8(k[7]) % 18;'],
  ['bande sans le decalage de 30', 'face[0] = uint8(((teinte + 30) % 360) / 60);', 'face[0] = uint8((teinte % 360) / 60);'],
  /* la fenetre */
  ['settle avant la cible', '        if (block.number <= t) revert TooEarly();\n', ''],
  ['settle apres la fenetre', '        if (block.number > t + SETTLE_WINDOW) revert TooLate();\n', ''],
  ['fenetre 255', 'uint256 public constant SETTLE_WINDOW = 256;', 'uint256 public constant SETTLE_WINDOW = 255;'],
  ['cible + 1', 'uint256 public constant TARGET_DELAY = 2;', 'uint256 public constant TARGET_DELAY = 1;'],
  ['expire avant la fin', '        if (block.number <= uint256(s.targetBlock) + SETTLE_WINDOW) revert StillSettleable();\n', ''],
  ['hash nul admis', '        if (h == bytes32(0)) revert HashUnavailable();\n        return _settle(spinId, s, h);', '        return _settle(spinId, s, h);'],
  /* ⚠️ « borne haute ouverte » (> t + 257) est un mutant EQUIVALENT sous l EVM, mesure 2026-10-23 (il a survecu) : hors des 256 blocs
   *    blockhash() rend 0 et la garde du hash saute le spin. On mute donc les BORNES qui comptent : cible + 256 regle, cible + 1 regle. */
  ['settleMany : dernier bloc de la fenetre saute', 'if (block.number <= t || block.number > t + SETTLE_WINDOW) continue;', 'if (block.number <= t || block.number >= t + SETTLE_WINDOW) continue;'],
  ['settleMany : premier bloc apres la cible saute', 'if (block.number <= t || block.number > t + SETTLE_WINDOW) continue;', 'if (block.number <= t + 1 || block.number > t + SETTLE_WINDOW) continue;'],
  ['settleMany : deja regle non saute', '            if (s.status != Status.Pending) continue;\n', ''],
  ['settle deux fois', '        if (s.status != Status.Pending) revert NotPending();\n        uint256 t = s.targetBlock;', '        uint256 t = s.targetBlock;'],
  /* reentree, jetons */
  ['settle sans verrou', 'function settle(uint256 spinId) external nonReentrant returns', 'function settle(uint256 spinId) external returns'],
  ['settleMany sans verrou', 'function settleMany(uint256[] calldata ids) external nonReentrant returns', 'function settleMany(uint256[] calldata ids) external returns'],
  ['retour false accepte', "        (bool ok, bytes memory ret) = USDC.call(abi.encodeWithSelector(0xa9059cbb, to, amount));\n        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();", "        (bool ok, ) = USDC.call(abi.encodeWithSelector(0xa9059cbb, to, amount));\n        if (!ok) revert TransferFailed();"],
  /* la config */
  /* ⚠️ « prix nul admis » est un mutant EQUIVALENT, mesure 2026-10-23 (il a survecu, meme avec une table nulle) : la garde d esperance
   *    est STRICTE (esperance * BPS >= prix * part * 2^144 -> refus) et avec un prix nul le membre de droite vaut 0 : 0 >= 0 refuse deja.
   *    La garde spinPrice == 0 reste dans le code pour etre lisible ; c est la garde d esperance qui la tient (ses 3 mutants sont tues). */
  ['prix au-dela du max admis', 'if (c.spinPrice == 0 || c.spinPrice > MAX_PRIZE ||', 'if (c.spinPrice == 0 ||'],
  ['part > 100 % admise', '|| c.potShareBps > BPS) revert BadConfig();', ') revert BadConfig();'],
];
let survivants = 0, introuvables = 0;
try {
  fs.writeFileSync(path.join(ICI, 'src/BlockSlots.sol'), original);
  const t = lancer();
  console.log((t.vert ? 'ok  ' : 'KO  ') + 'temoin : la copie non mutee est verte');
  if (!t.vert) { console.log(t.sortie.slice(-1500)); process.exit(1); }
  for (const [nom, de, vers] of M) {
    const n = original.split(de).length - 1;
    if (n !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + n + ' fois (attendu 1)'); continue; }
    fs.writeFileSync(path.join(ICI, 'src/BlockSlots.sol'), original.replace(de, () => vers));
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
