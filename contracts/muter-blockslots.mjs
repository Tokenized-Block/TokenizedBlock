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
  ['acceptCapped : gain non plafonne par le pot', '        if (payout > pot) payout = pot;\n', ''],
  /* v2 (Phil 2026-10-23 + verdict adverse) : 5 USDC au plus, trois blocs */
  ['plafond 1000 au lieu de 5 USDC', 'uint64 public constant MAX_PRIZE = 5_000000;', 'uint64 public constant MAX_PRIZE = 1000_000000;'],
  ['trois faces sur le seul bloc cible (hashes)', 'h[r] = blockhash(t + r);', 'h[r] = blockhash(t);'],
  ['trois faces sur le premier hash (facesOf)', 'f[r] = faceOf(seedOf(blockHashes[r], spinId, r));', 'f[r] = faceOf(seedOf(blockHashes[0], spinId, r));'],
  ['settle des cible + 1 (sans attendre le 3e hash)', 'if (block.number <= t + (REELS - 1)) revert TooEarly();', 'if (block.number <= t) revert TooEarly();'],
  /* v3 (verdict adverse 2026-10-23, defaut 1 : un lot du joueur prenait des gains plafonnes sans le dire) */
  ['settle prend un gain plafonne (joueur ou tiers)', '        if (payout > pot) revert PotShort();\n', '        if (payout > pot) payout = pot;\n'],
  ['settleMany prend un gain plafonne (le defaut 1)', '            if (payout > pot) continue;\n', '            if (payout > pot) payout = pot;\n'],
  ['settleMany ne compte pas les regles', '            done++;\n', ''],
  ['acceptCapped par un tiers', '        if (msg.sender != s.player) revert NotPlayer();\n', ''],
  ['acceptCapped sans minimum', '        if (payout < minPayout) revert BelowMinimum();\n', ''],
  ['acceptCapped : minimum strict', 'if (payout < minPayout) revert BelowMinimum();', 'if (payout <= minPayout) revert BelowMinimum();'],
  /* v4 (option 3 de Phil, 2026-10-23) : le prix PARTAGE AU SPIN (pot + du au dev), AUCUN remboursement a l expiration */
  ['spin : seule la part du pot est tiree', '_pull(msg.sender, address(this), SPIN_PRICE);', '_pull(msg.sender, address(this), TO_POT);'],
  ['spin : part du dev non due', '        devOwed += DEV_SHARE;\n', ''],
  ['spin : tout le prix au pot', '        pot += TO_POT;\n', '        pot += SPIN_PRICE;\n'],
  ['settle : part du dev comptee une 2e fois', '        pot -= payout;\n        uint256 total', '        pot -= payout;\n        devOwed += DEV_SHARE;\n        uint256 total'],
  ['expire rend la part du dev au joueur (v3)', '        s.status = Status.Expired;\n', '        s.status = Status.Expired;\n        devOwed -= DEV_SHARE;\n        _push(s.player, DEV_SHARE);\n'],
  ['expire rend la part du pot au joueur', '        s.status = Status.Expired;\n', '        s.status = Status.Expired;\n        pot -= TO_POT;\n        _push(s.player, TO_POT);\n'],
  ['expire rend la part du dev a l appelant', '        s.status = Status.Expired;\n', '        s.status = Status.Expired;\n        devOwed -= DEV_SHARE;\n        _push(msg.sender, DEV_SHARE);\n'],
  ['expire ne marque pas le spin', '        s.status = Status.Expired;\n', ''],
  ['payDev ne remet pas a zero', '        devOwed = 0;\n', ''],
  ['payDev a l appelant', '_push(DEV_WALLET, amount);', '_push(msg.sender, amount);'],
  ['payDev sans verrou', 'function payDev() external nonReentrant returns', 'function payDev() external returns'],
  ['part du dev = la part du pot', 'DEV_SHARE = c.spinPrice - toPot;', 'DEV_SHARE = toPot;'],
  ['meilleure strategie avec la part du dev rendue (v3)', '        return expectedNumerator(_prizes);\n    }', '        uint256[16] memory d = distribution();\n        uint256 s;\n        for (uint256 k = 0; k <= MAX_POINTS; k++) s += d[k] * (_prizes[k] > DEV_SHARE ? _prizes[k] : DEV_SHARE);\n        return s;\n    }'],
  ['meilleure strategie = le prix', '        return expectedNumerator(_prizes);\n    }', '        return SPIN_PRICE * DIST_DENOM - 1;\n    }'],
  ['part du pot : tout au pot', 'uint256 toPot = (c.spinPrice * c.potShareBps) / BPS;', 'uint256 toPot = c.spinPrice;'],
  ['fund : pot non credite', '        pot += amount;\n        _pull(msg.sender, address(this), amount);', '        _pull(msg.sender, address(this), amount);'],
  ['le gain va a l appelant', 'if (payout != 0) _push(player, payout);', 'if (payout != 0) _push(msg.sender, payout);'],
  /* l avantage de la maison et la table */
  ['esperance non verifiee', '        if (expectedNumerator(c.prizes) >= toPot * DIST_DENOM) revert BadConfig();\n', ''],
  ['garde sur prix x part / BPS (sans l arrondi de TO_POT)', 'if (expectedNumerator(c.prizes) >= toPot * DIST_DENOM)', 'if (expectedNumerator(c.prizes) * BPS >= c.spinPrice * c.potShareBps * DIST_DENOM)'],
  ['esperance contre le prix, pas la part du pot', 'expectedNumerator(c.prizes) >= toPot * DIST_DENOM', 'expectedNumerator(c.prizes) >= c.spinPrice * DIST_DENOM'],
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
  ['deux faces sur la meme graine', 'f[r] = faceOf(seedOf(blockHashes[r], spinId, r));', 'f[r] = faceOf(seedOf(blockHashes[r], spinId, r == 2 ? 1 : r));'],
  ['facette modulo 18', 'face[2] = uint8(k[7]) % FACETS;', 'face[2] = uint8(k[7]) % 18;'],
  ['bande sans le decalage de 30', 'face[0] = uint8(((teinte + 30) % 360) / 60);', 'face[0] = uint8((teinte % 360) / 60);'],
  /* la fenetre */
  ['settle avant la cible', '        if (block.number <= t + (REELS - 1)) revert TooEarly();\n', ''],
  ['settle apres la fenetre', '        if (block.number > t + SETTLE_WINDOW) revert TooLate();\n', ''],
  ['fenetre 255', 'uint256 public constant SETTLE_WINDOW = 256;', 'uint256 public constant SETTLE_WINDOW = 255;'],
  ['cible + 1', 'uint256 public constant TARGET_DELAY = 2;', 'uint256 public constant TARGET_DELAY = 1;'],
  ['expire avant la fin', '        if (block.number <= uint256(s.targetBlock) + SETTLE_WINDOW) revert StillSettleable();\n', ''],
  ['hash nul admis', '            if (h[r] == bytes32(0)) return (false, h);\n', ''],
  /* ⚠️ « borne haute ouverte » (> t + 257) est un mutant EQUIVALENT sous l EVM, mesure 2026-10-23 (il a survecu) : hors des 256 blocs
   *    blockhash() rend 0 et la garde du hash saute le spin. On mute donc les BORNES qui comptent : cible + 256 regle, cible + 3 regle.
   *    ⚠️ v2 : « settleMany des cible + 1 » (<= t au lieu de <= t + 2) est AUSSI equivalent sous l EVM : blockhash(bloc courant ou futur)
   *    rend 0, la garde du hash saute le spin. La borne basse est tenue dans settle() par TooEarly (mutant « settle des cible + 1 »). */
  ['settleMany : dernier bloc de la fenetre saute', 'if (block.number <= t + (REELS - 1) || block.number > t + SETTLE_WINDOW) continue;', 'if (block.number <= t + (REELS - 1) || block.number >= t + SETTLE_WINDOW) continue;'],
  ['settleMany : premier bloc reglable (cible + 3) saute', 'if (block.number <= t + (REELS - 1) || block.number > t + SETTLE_WINDOW) continue;', 'if (block.number <= t + REELS || block.number > t + SETTLE_WINDOW) continue;'],
  ['settleMany : deja regle non saute', '            if (s.status != Status.Pending) continue;\n', ''],
  ['settle deux fois', '        if (s.status != Status.Pending) revert NotPending();\n        uint256 t = s.targetBlock;', '        uint256 t = s.targetBlock;'],
  /* reentree, jetons */
  ['settle sans verrou', 'function settle(uint256 spinId) external nonReentrant returns', 'function settle(uint256 spinId) external returns'],
  ['settleMany sans verrou', 'function settleMany(uint256[] calldata ids) external nonReentrant returns', 'function settleMany(uint256[] calldata ids) external returns'],
  /* ⚠️ « acceptCapped sans verrou » n est PAS mute : une re-entree vient du JETON (msg.sender = le jeton), que NotPlayer refuse avant tout
   *    effet ; le verrou y reste pour etre lisible. Ce n est pas une garde que la suite tient : c est dit ici, pas compte comme tue. */
  ['retour false accepte', "        (bool ok, bytes memory ret) = USDC.call(abi.encodeWithSelector(0xa9059cbb, to, amount));\n        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();", "        (bool ok, ) = USDC.call(abi.encodeWithSelector(0xa9059cbb, to, amount));\n        if (!ok) revert TransferFailed();"],
  /* la config */
  /* ⚠️ « prix nul admis » est un mutant EQUIVALENT, mesure 2026-10-23 (il a survecu, meme avec une table nulle) : la garde d esperance
   *    est STRICTE (esperance * BPS >= prix * part * 2^144 -> refus) et avec un prix nul le membre de droite vaut 0 : 0 >= 0 refuse deja.
   *    La garde spinPrice == 0 reste dans le code pour etre lisible ; c est la garde d esperance qui la tient (ses 3 mutants sont tues). */
  ['prix au-dela du max admis', 'if (c.spinPrice == 0 || c.spinPrice > MAX_SPIN_PRICE ||', 'if (c.spinPrice == 0 ||'],
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
