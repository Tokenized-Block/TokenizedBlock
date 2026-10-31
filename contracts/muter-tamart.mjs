/* muter-tamart.mjs — chaque garde de TamArt est CASSEE, une a la fois, dans une COPIE ; la suite test/TamArt.t.sol doit rougir.
 * Un mutant qui reste vert = une garde que la suite ne tient pas. Ne touche jamais au depot : tout se passe dans un dossier temporaire
 * (lib/forge-std y est une JONCTION vers celle du depot, rien n est copie ni modifie dedans).
 * Usage (depuis contracts/) : node muter-tamart.mjs      [FORGE=chemin/vers/forge] */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const SRC = path.dirname(fileURLToPath(import.meta.url));
const ICI = fs.mkdtempSync(path.join(process.env.MUT_DIR || os.tmpdir(), 'mut-tamart-')); // MUT_DIR : ailleurs que C: si plein
for (const d of ['src', 'test', 'lib']) fs.mkdirSync(path.join(ICI, d), { recursive: true });
fs.symlinkSync(path.join(SRC, 'lib/forge-std'), path.join(ICI, 'lib/forge-std'), 'junction');
fs.copyFileSync(path.join(SRC, 'foundry.toml'), path.join(ICI, 'foundry.toml'));
for (const f of ['TamArt.t.sol', 'TamEchantillons.sol']) fs.copyFileSync(path.join(SRC, 'test', f), path.join(ICI, 'test', f));
const original = fs.readFileSync(path.join(SRC, 'src/TamArt.sol'), 'utf8').replace(/\r\n/g, '\n');
fs.writeFileSync(path.join(ICI, 'src/TamArt.sol'), original);
const FORGE = process.env.FORGE || (process.platform === 'win32' ? path.join(os.homedir(), '.foundry/bin/forge.exe') : 'forge');
const lancer = () => {
  try { const o = execFileSync(FORGE, ['test', '--offline', '--root', ICI, '--match-contract', 'TamArtTest'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { vert: true, sortie: o }; }
  catch (e) { return { vert: false, sortie: String(e.stdout || '') + String(e.stderr || '') }; }
};
const PAIE = 'abi.encodeWithSelector(0x23b872dd, msg.sender, beneficiaire, PRICE)';
const M = [
  /* les EXIGES (brief phase B) */
  ['EXIGE frais au minteur', PAIE, 'abi.encodeWithSelector(0x23b872dd, msg.sender, msg.sender, PRICE)'],
  ['EXIGE controle de doublon retire', 'if (deja != 0) revert Duplicate(deja);', ''],
  ['EXIGE mauvais prix (constante 4,999999)', 'PRICE = 5_000_000;', 'PRICE = 4_999_999;'],
  ['EXIGE mauvais prix (constante 5,000001)', 'PRICE = 5_000_000;', 'PRICE = 5_000_001;'],
  ['EXIGE mauvais prix (montant tire)', PAIE, 'abi.encodeWithSelector(0x23b872dd, msg.sender, beneficiaire, PRICE - 1)'],
  ['EXIGE donnees tronquees au stockage', 'abi.encodePacked(hex"00", data, params_)', 'abi.encodePacked(hex"00", data[:data.length - 1], params_)'],
  ['EXIGE donnees tronquees a la relecture', 'return _lire(o.pointeur, 0, o.octetsDonnees);', 'return _lire(o.pointeur, 0, o.octetsDonnees - 1);'],
  /* le reste */
  ['le contrat garde les fonds', PAIE, 'abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), PRICE)'],
  ['retour du transferFrom ignore', 'if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();\n    }\n\n    /// @dev SSTORE2', '    }\n\n    /// @dev SSTORE2'],
  ['en-tete TAM non verifie', 'if (data[0] != 0x54 || data[1] != 0x41 || data[2] != 0x4d || uint8(data[3]) != VERSION) revert BadData();', ''],
  ['taille max non verifiee', 'if (n < 7 || n > MAX_DATA || params_.length > MAX_PARAMS) revert BadData();', 'if (n < 7) revert BadData();'],
  ['empreinte stockee fausse', 'uint32(params_.length), graine_, h);', 'uint32(params_.length), graine_, bytes32(0));'],
  ['graine non stockee', 'uint32(params_.length), graine_, h);', 'uint32(params_.length), bytes32(0), h);'],
  ['params non relus', 'return _lire(o.pointeur, o.octetsDonnees, o.octetsParams);', 'return _lire(o.pointeur, 0, o.octetsParams);'],
  ['tokenOfHash non ecrit', '        tokenOfHash[h] = tokenId;\n', ''],
  ['Minted sans la graine', 'emit Minted(tokenId, msg.sender, h, graine_);', 'emit Minted(tokenId, msg.sender, h, bytes32(0));'],
  ['SVG : prediction ordre 1 comme ordre 0', '((!t.nuage && i >= 2) ? 2 * t.a[c] - t.b[c] : t.a[c])', '((i >= 2) ? 2 * t.a[c] - t.b[c] : t.a[c])'],
  ['SVG : y non retourne', 'j = _putU(out, j, t.m - _clamp(t.a[1], t.m));', 'j = _putU(out, j, _clamp(t.a[1], t.m));'],
  ['SVG : zigzag faux', '(int256(z >> 1) ^ -int256(z & 1))', '(int256(z >> 1))'],
  ['constructeur : 6 decimales non verifiees', 'abi.decode(ret, (uint256)) != 6) revert BadToken();', 'abi.decode(ret, (uint256)) == 0) revert BadToken();'],
  ['transferFrom sans controle d approbation', 'if (msg.sender != o && getApproved[tokenId] != msg.sender && !isApprovedForAll[o][msg.sender]) revert NotAllowed();\n        delete', 'delete'],
];
const base = lancer();
if (!base.vert) { console.log(base.sortie.slice(-3000)); throw new Error('la suite est ROUGE sur l original : aucun mutant ne prouve rien'); }
let tues = 0, survivants = [];
for (const [nom, de, vers] of M) {
  const n = original.split(de).length - 1;
  if (n !== 1) { survivants.push(nom + ' (motif trouve ' + n + ' fois : mutant NON applique)'); console.log('??', nom, 'motif x' + n); continue; }
  fs.writeFileSync(path.join(ICI, 'src/TamArt.sol'), original.replace(de, vers));
  const r = lancer();
  if (r.vert) { survivants.push(nom); console.log('SURVIT', nom); }
  else { tues++; const f = (r.sortie.match(/\[FAIL[^\n]*\] (test_\w+)/g) || []).map((x) => x.replace(/.*\] /, '')); console.log('tue   ', nom, '<-', f.slice(0, 3).join(', ') || (/Compiler run failed|Error \(/.test(r.sortie) ? 'NE COMPILE PAS' : '?')); }
}
fs.rmSync(path.join(ICI, 'lib/forge-std'), { force: true, recursive: false });
fs.rmSync(ICI, { recursive: true, force: true });
console.log('\nmutants : ' + tues + '/' + M.length + ' tues' + (survivants.length ? ' ; SURVIVANTS : ' + survivants.join(' | ') : ''));
process.exit(survivants.length ? 1 : 0);
