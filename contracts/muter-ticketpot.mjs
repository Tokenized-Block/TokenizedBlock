/* muter-ticketpot.mjs — chaque garde de TicketPot est RETIREE, une a la fois, dans une COPIE ; la suite doit rougir.
 * Un mutant qui reste vert = une garde que la suite ne tient pas. Ne touche jamais au depot : tout se passe dans un dossier temporaire.
 * Usage (depuis contracts/) : node muter-ticketpot.mjs      [FORGE=chemin/vers/forge]
 * Les mutants EXIGES (brief 2026-10-18 + lead « parts egales ») sont en tete : signature non verifiee, meme wallet deux fois, 3e claim
 * au-dela du reste, echeance ignoree, mauvais jour, rollover avant la grace, rollover de tout le pot (pas le reste), claim apres rollover,
 * claim avant close.
 * ⚠ MUTANTS EQUIVALENTS, mesures le 2026-10-18 sur la 1re version (ils survivaient) et RETIRES du contrat ou de la liste, pas caches :
 *   - « v hors de {27, 28} accepte » : ecrecover rend deja address(0) pour ces v -> la garde explicite a ete retiree du contrat ;
 *   - « readyAt == 0 admis » dans _accept : block.timestamp > 0 + PROPOSAL_TTL refuse deja ;
 *   - « ticket grave APRES le paiement » : sous le verrou, l ordre n a pas d effet observable (le verrou a son propre mutant). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const SRC = path.dirname(fileURLToPath(import.meta.url));
const ICI = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-ticketpot-'));
fs.mkdirSync(path.join(ICI, 'src'), { recursive: true });
fs.mkdirSync(path.join(ICI, 'test'), { recursive: true });
fs.cpSync(path.join(SRC, 'lib/forge-std'), path.join(ICI, 'lib/forge-std'), { recursive: true, filter: (f) => !/[\\/]\.git([\\/]|$)/.test(f) });
fs.copyFileSync(path.join(SRC, 'foundry.toml'), path.join(ICI, 'foundry.toml'));
fs.copyFileSync(path.join(SRC, 'test/TicketPot.t.sol'), path.join(ICI, 'test/TicketPot.t.sol'));
const original = fs.readFileSync(path.join(SRC, 'src/TicketPot.sol'), 'utf8').replace(/\r\n/g, '\n');
const FORGE = process.env.FORGE || (process.platform === 'win32' ? path.join(os.homedir(), '.foundry/bin/forge.exe') : 'forge');
const lancer = () => {
  try { const o = execFileSync(FORGE, ['test', '--root', ICI], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { vert: true, sortie: o }; }
  catch (e) { return { vert: false, sortie: String(e.stdout || '') + String(e.stderr || '') }; }
};
const DIGEST = 'keccak256(abi.encode(CLAIM_TYPEHASH, day, wallet, ticket, amount, deadline))';
const DOMAINE = 'keccak256("TicketPot"), keccak256("1"), block.chainid, address(this)';
const PARAMS = 'if (wallet == address(0) || ticket == bytes20(0) || amount == 0) revert BadParams();';
const ACCEPT = 'if (p.readyAt == 0 || block.timestamp < p.readyAt || block.timestamp > uint256(p.readyAt) + PROPOSAL_TTL) revert NotReady();';
const TOT = 'if (msg.sender != owner && block.timestamp < dayEnd(day) + FUNDING_DELAY) revert TooEarly();';
const M = [
  /* les EXIGES */
  ['EXIGE signature non verifiee', 'if (_recover(claimDigest(day, wallet, ticket, amount, deadline), sig) != verifier) revert BadProof();', ''],
  ['EXIGE meme wallet deux fois', 'if (ticketOf[day][wallet] != bytes20(0)) revert AlreadyClaimed();', ''],
  ['EXIGE 3e claim au-dela du reste (montant > pot)', 'if (amount > dayPot[day]) revert AmountOverPot();', ''],
  ['EXIGE echeance ignoree', 'if (block.timestamp > deadline) revert SignatureExpired();', ''],
  ['EXIGE mauvais jour : le jour hors du digest', DIGEST, 'keccak256(abi.encode(CLAIM_TYPEHASH, uint32(0), wallet, ticket, amount, deadline))'],
  ['EXIGE rollover avant la grace', 'if (block.timestamp <= claimableUntil(day)) revert GraceNotOver();', ''],
  ['EXIGE rollover de TOUT le pot fige (pas seulement le reste)', '        uint256 a = dayPot[day];\n        if (a == 0) revert NothingToRoll();', '        uint256 a = potAtClose[day] > dayPot[day] ? potAtClose[day] : dayPot[day];\n        if (a == 0) revert NothingToRoll();'],
  ['EXIGE claim apres rollover : echeance au-dela de la grace admise', 'if (deadline > claimableUntil(day)) revert DeadlineTooFar();', ''],
  ['EXIGE claim avant close (parts non finales)', 'if (!closed[day]) revert NotClosed();', ''],
  /* le digest : chaque champ signe compte */
  ['digest sans le wallet', DIGEST, 'keccak256(abi.encode(CLAIM_TYPEHASH, day, address(0), ticket, amount, deadline))'],
  ['digest sans le ticket', DIGEST, 'keccak256(abi.encode(CLAIM_TYPEHASH, day, wallet, bytes20(0), amount, deadline))'],
  ['digest sans le montant', DIGEST, 'keccak256(abi.encode(CLAIM_TYPEHASH, day, wallet, ticket, uint256(0), deadline))'],
  ['digest sans l echeance', DIGEST, 'keccak256(abi.encode(CLAIM_TYPEHASH, day, wallet, ticket, amount, uint64(0)))'],
  ['digest sans le domaine', 'abi.encodePacked("\\x19\\x01", domainSeparator(),', 'abi.encodePacked("\\x19\\x01", bytes32(0),'],
  ['domaine : chainid fige', DOMAINE, 'keccak256("TicketPot"), keccak256("1"), uint256(1), address(this)'],
  ['domaine : sans l adresse du contrat', DOMAINE, 'keccak256("TicketPot"), keccak256("1"), block.chainid, address(0)'],
  /* la signature */
  ['signature : longueur non verifiee', 'if (sig.length != 65) return address(0);', ''],
  ['signature : s haut accepte (malleabilite)', 'if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);', ''],
  /* claim */
  ['claim : echeance = derniere seconde refusee', 'if (block.timestamp > deadline) revert SignatureExpired();', 'if (block.timestamp >= deadline) revert SignatureExpired();'],
  ['claim : echeance = fin de grace refusee', 'if (deadline > claimableUntil(day)) revert DeadlineTooFar();', 'if (deadline >= claimableUntil(day)) revert DeadlineTooFar();'],
  ['claim : montant nul admis', PARAMS, 'if (wallet == address(0) || ticket == bytes20(0)) revert BadParams();'],
  ['claim : ticket nul admis', PARAMS, 'if (wallet == address(0) || amount == 0) revert BadParams();'],
  ['claim : wallet nul admis', PARAMS, 'if (ticket == bytes20(0) || amount == 0) revert BadParams();'],
  ['claim : montant = reste refuse', 'if (amount > dayPot[day]) revert AmountOverPot();', 'if (amount >= dayPot[day]) revert AmountOverPot();'],
  ['claim : compare au pot FIGE et non au reste', 'if (amount > dayPot[day]) revert AmountOverPot();', 'if (amount > potAtClose[day]) revert AmountOverPot();'],
  ['claim : ticket non grave', '        ticketOf[day][wallet] = ticket;\n', ''],
  ['claim : reste non debite', '        dayPot[day] -= amount;\n        paid[day] += amount;', '        paid[day] += amount;'],
  ['claim : paye non compte', '        dayPot[day] -= amount;\n        paid[day] += amount;', '        dayPot[day] -= amount;'],
  ['claim : total non debite', '        totalPots -= amount;\n        _push(wallet, amount);', '        _push(wallet, amount);'],
  ['claim : paie l appelant', '_push(wallet, amount);', '_push(msg.sender, amount);'],
  ['claim : paie le double', '_push(wallet, amount);', '_push(wallet, amount * 2);'],
  ['claim : en pause admis', '        if (paused) revert Paused();\n        if (!closed[day])', '        if (!closed[day])'],
  ['claim : sans verrou', 'bytes calldata sig) external nonReentrant {', 'bytes calldata sig) external {'],
  /* fund / close / absorb */
  ['fund : montant nul admis', 'if (amount == 0) revert ZeroAmount();', ''],
  ['fund : jour futur admis', 'if (day > today()) revert FutureDay();', ''],
  ['fund : jour FERME admis (les parts signees changeraient)', '        if (closed[day]) revert DayClosed();\n        dayPot[day] += amount;', '        dayPot[day] += amount;'],
  ['fund : le pot d un autre jour', '        dayPot[day] += amount;\n        totalPots += amount;\n        _pull(msg.sender, amount);', '        dayPot[day + 1] += amount;\n        totalPots += amount;\n        _pull(msg.sender, amount);'],
  ['fund : total non credite', '        dayPot[day] += amount;\n        totalPots += amount;\n        _pull(msg.sender, amount);', '        dayPot[day] += amount;\n        _pull(msg.sender, amount);'],
  ['fund : rien tire du payeur', '        _pull(msg.sender, amount);\n        emit Funded(day, msg.sender', '        emit Funded(day, msg.sender'],
  ['close : avant la fin du jour', '        if (block.timestamp < dayEnd(day)) revert DayNotOver();\n        if (closed[day]) revert DayClosed();\n        if (msg.sender', '        if (closed[day]) revert DayClosed();\n        if (msg.sender'],
  ['close : deux fois (le pot fige serait reecrit)', '        if (closed[day]) revert DayClosed();\n        if (msg.sender != owner', '        if (msg.sender != owner'],
  ['close : un tiers sans attendre FUNDING_DELAY', TOT, ''],
  ['close : seulement l owner (un jour que personne ne ferme ne paierait jamais)', TOT, 'if (msg.sender != owner) revert TooEarly();'],
  ['close : pot fige non enregistre', '        potAtClose[day] = dayPot[day];\n', ''],
  ['close : drapeau non pose', '        closed[day] = true;\n', ''],
  ['absorb : sans surplus admis', 'if (b <= totalPots) revert NothingToAbsorb();', ''],
  ['absorb : verse au lendemain', '        uint32 d = today();\n        dayPot[d] += a;\n        totalPots += a;', '        uint32 d = today() + 1;\n        dayPot[d] += a;\n        totalPots += a;'],
  /* rollover */
  ['rollover : a la derniere seconde de la grace admis', 'if (block.timestamp <= claimableUntil(day)) revert GraceNotOver();', 'if (block.timestamp < claimableUntil(day)) revert GraceNotOver();'],
  ['rollover : pot vide admis', 'if (a == 0) revert NothingToRoll();', ''],
  ['rollover : pot source non vide', '        dayPot[day] = 0;\n        dayPot[d] += a;', '        dayPot[d] += a;'],
  ['rollover : vers le lendemain du jour (un jour FERME) et non aujourd hui', '        uint32 d = today();\n        dayPot[day] = 0;', '        uint32 d = day + 1;\n        dayPot[day] = 0;'],
  ['grace : 6 jours', 'uint64 public constant GRACE = 7 days;', 'uint64 public constant GRACE = 6 days;'],
  ['delai de fund : 6 h', 'uint64 public constant FUNDING_DELAY = 12 hours;', 'uint64 public constant FUNDING_DELAY = 6 hours;'],
  /* admin */
  ['propose : n importe qui', 'function proposeVerifier(address v) external onlyOwner {', 'function proposeVerifier(address v) external {'],
  ['accept : n importe qui', 'function acceptVerifier() external onlyOwner {', 'function acceptVerifier() external {'],
  ['accept : sans attendre', ACCEPT, 'if (p.readyAt == 0 || block.timestamp > uint256(p.readyAt) + PROPOSAL_TTL) revert NotReady();'],
  ['accept : proposition perimee admise', ACCEPT, 'if (p.readyAt == 0 || block.timestamp < p.readyAt) revert NotReady();'],
  ['delai admin : 24 h', 'uint64 public constant ADMIN_DELAY = 48 hours;', 'uint64 public constant ADMIN_DELAY = 24 hours;'],
  ['pause : n importe qui', 'if (msg.sender != owner && !g) revert NotOwner();', ''],
  ['pause : le gardien leve la pause de l owner', 'if (g && guardianPausedAt == 0) revert NotOwner();', ''],
  ['pause : l owner leve la pause du gardien tout de suite', 'if (!g && guardianPausedAt != 0 && block.timestamp < guardianPausedAt + ADMIN_DELAY) revert NotReady();', ''],
  ['pause : re-pause silencieuse', 'if (paused) revert NotReady();', ''],
  ['pause : le gardien revoque (= adresse zero) pause encore', 'bool g = msg.sender == guardian && guardian != address(0);', 'bool g = msg.sender == guardian;'],
  ['revoke : n importe qui', 'function revokeGuardian() external onlyOwner {', 'function revokeGuardian() external {'],
  ['propriete : accept par n importe qui', 'if (msg.sender != pendingOwner) revert NotOwner();', ''],
  /* jetons, constructeur */
  ['transferFrom qui rend false accepte', 'if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();\n    }\n\n    function _push', 'ok; ret;\n    }\n\n    function _push'],
  ['transfer qui rend false accepte', '(bool ok, bytes memory ret) = USDC.call(abi.encodeWithSelector(0xa9059cbb, to, amount));\n        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();', '(bool ok, bytes memory ret) = USDC.call(abi.encodeWithSelector(0xa9059cbb, to, amount));\n        ok; ret;'],
  ['constructeur : verifier nul admis', 'if (usdc == address(0) || usdc.code.length == 0 || verifier_ == address(0)) revert BadAddress();', 'if (usdc == address(0) || usdc.code.length == 0) revert BadAddress();'],
  ['constructeur : usdc sans code admis', 'if (usdc == address(0) || usdc.code.length == 0 || verifier_ == address(0)) revert BadAddress();', 'if (usdc == address(0) || verifier_ == address(0)) revert BadAddress();'],
];
let survivants = 0, introuvables = 0;
try {
  fs.writeFileSync(path.join(ICI, 'src/TicketPot.sol'), original);
  const t = lancer();
  console.log((t.vert ? 'ok  ' : 'KO  ') + 'temoin : la copie non mutee est verte');
  if (!t.vert) { console.log(t.sortie.slice(-1500)); process.exit(1); }
  for (const [nom, de, vers] of M) {
    const n = original.split(de).length - 1;
    if (n !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + n + ' fois (attendu 1)'); continue; }
    fs.writeFileSync(path.join(ICI, 'src/TicketPot.sol'), original.replace(de, () => vers));
    const r = lancer();
    const compile = !/Compiler run failed/.test(r.sortie);
    const rouges = [...new Set((r.sortie.match(/^\[FAIL[^\n]*/gm) || []).map((l) => (l.match(/(test\w+)\(/) || ['', '?'])[1]))];
    if (r.vert) { survivants += 1; console.log('SURVIT  ' + nom); }
    else if (!compile) { survivants += 1; console.log('NE COMPILE PAS (ne prouve rien, compte comme survivant)  ' + nom); }
    else console.log('tue ' + nom + ' — ' + rouges.length + ' rouge(s) : ' + rouges.slice(0, 4).join(', '));
  }
} finally {
  fs.rmSync(ICI, { recursive: true, force: true });
}
console.log('\n' + M.length + ' mutants, ' + survivants + ' survivant(s), ' + introuvables + ' ancre(s) introuvable(s)');
process.exit(survivants || introuvables ? 1 : 0);
