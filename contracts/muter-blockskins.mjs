/* muter-blockskins.mjs — chaque garde du contrat BlockSkins est RETIREE, une a la fois, dans une COPIE ; la suite doit rougir.
 * Un mutant qui reste vert = une garde que la suite ne tient pas. Ne touche jamais au depot : tout se passe dans un dossier temporaire.
 * Usage (depuis contracts/) : node muter-blockskins.mjs      [FORGE=chemin/vers/forge]
 * Mesure du 2026-10-04 : 27 mutants, 0 survivant, 0 ancre introuvable. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const SRC = path.dirname(fileURLToPath(import.meta.url));
const ICI = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-blockskins-'));
fs.mkdirSync(path.join(ICI, 'src'), { recursive: true });
fs.mkdirSync(path.join(ICI, 'test'), { recursive: true });
fs.cpSync(path.join(SRC, 'lib/forge-std'), path.join(ICI, 'lib/forge-std'), { recursive: true, filter: (f) => !/[\\/]\.git([\\/]|$)/.test(f) });
fs.copyFileSync(path.join(SRC, 'foundry.toml'), path.join(ICI, 'foundry.toml'));
fs.copyFileSync(path.join(SRC, 'test/BlockSkins.t.sol'), path.join(ICI, 'test/BlockSkins.t.sol'));
const original = fs.readFileSync(path.join(SRC, 'src/BlockSkins.sol'), 'utf8').replace(/\r\n/g, '\n');
const FORGE = process.env.FORGE || (process.platform === 'win32' ? path.join(os.homedir(), '.foundry/bin/forge.exe') : 'forge');
const lancer = () => {
  try { const o = execFileSync(FORGE, ['test', '--root', ICI], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { vert: true, sortie: o }; }
  catch (e) { return { vert: false, sortie: String(e.stdout || '') + String(e.stderr || '') }; }
};
const M = [
  ['frais de vente 10 % -> 1 %', 'SALE_FEE_BPS = 1000;', 'SALE_FEE_BPS = 100;'],
  ['validation non liee a la mise en vente', 'if (v.listing != l.id) revert ListingChanged();', ''],
  ['numero de mise en vente fige', 'uint64 id = ++_listingSeq;', 'uint64 id = 1;'],
  ['achat : jeton a taxe admis', '_pullIn(l.currency, msg.sender, l.price);', '_pull(l.currency, msg.sender, address(this), l.price);'],
  ['execution validee : jeton a taxe admis', '_pullIn(l.currency, buyer, l.price);', '_pull(l.currency, buyer, address(this), l.price);'],
  ['enchere : jeton a taxe admis', '_pullIn(currency, msg.sender, amount);', '_pull(currency, msg.sender, address(this), amount);'],
  ['vendeur blackliste bloque le reglement', '_pushOrCredit(currency, seller, rest);', '_push(currency, seller, rest);'],
  ['prolongation sans plafond', 'l.end = uint64(e > cap ? cap : e);', 'l.end = uint64(e);'],
  ['mint sans verrou', 'function mint(address blockToken, uint64 recipe) external nonReentrant returns', 'function mint(address blockToken, uint64 recipe) external returns'],
  ['surenchere minimale retiree', 'uint256 floor = l.bid == 0 ? l.price : l.bid + (l.bid * MIN_RAISE_BPS) / 10_000;', 'uint256 floor = l.price;'],
  ['retrait d une enchere qui a une offre', 'if (l.bidder != address(0)) revert HasBids();', ''],
  ['reglement avant la fin', 'if (block.timestamp < l.end) revert NotEnded();', ''],
  ['enchere apres la fin', 'if (block.timestamp >= l.end) revert Ended();', ''],
  ['ETH refuse = revert', 'if (!ok) pending[address(0)][to] += amount;', 'if (!ok) revert TransferFailed();'],
  ['mint gratuit', '_pull(USDC, msg.sender, FEE_WALLET, MINT_PRICE);', ''],
  ['enchere depassee non creditee', 'if (l.bidder != address(0)) pending[currency][l.bidder] += l.bid;', ''],
  ['2e validation ETH perd la 1re', 'if (old.ethHeld != 0) pending[address(0)][msg.sender] += old.ethHeld;', ''],
  ['n importe qui retire une vente', 'if (msg.sender != l.seller) revert NotAllowed();', ''],
  ['n importe qui met en vente', 'if (_ownerOf[tokenId] != msg.sender) revert NotAllowed();', ''],
  ['devise non admise acceptee', 'if (!currencyAllowed[currency]) revert NotAllowed();', ''],
  ['recette non controlee', '        _checkRecipe(recipe);\n', ''],
  ['skinsPage rend le contrat comme detenteur', 'v.holder = v.listed ? l.seller : _ownerOf[id];', 'v.holder = _ownerOf[id];'],
  ['execution sans validation', 'if (v.listing == 0) revert NotValidated();\n        if (v.listing != l.id)', 'if (v.listing != l.id)'],
  ['achat : mauvais montant ETH admis', 'if (msg.value != l.price) revert WrongValue();\n        } else {\n            if (msg.value != 0) revert WrongValue();\n            _pullIn(l.currency, msg.sender', 'if (msg.value > l.price) revert WrongValue();\n        } else {\n            if (msg.value != 0) revert WrongValue();\n            _pullIn(l.currency, msg.sender'],
  ['duree d enchere non bornee', 'if (duration == 0 || duration > MAX_AUCTION) revert BadDuration();', 'if (duration == 0) revert BadDuration();'],
  ['transfert sans approbation', 'if (msg.sender != o && getApproved[tokenId] != msg.sender && !isApprovedForAll[o][msg.sender]) revert NotAllowed();', ''],
  ['seul owner : retire', 'if (msg.sender != owner) revert NotOwner();\n        currencyAllowed', 'currencyAllowed'],
];
let survivants = 0, introuvables = 0;
try {
  /* TEMOIN : la copie NON mutee doit etre verte, sinon tout « rouge » plus bas ne prouve rien */
  fs.writeFileSync(path.join(ICI, 'src/BlockSkins.sol'), original);
  const t = lancer();
  console.log((t.vert ? 'ok  ' : 'KO  ') + 'temoin : la copie non mutee est verte');
  if (!t.vert) { console.log(t.sortie.slice(-1500)); process.exit(1); }
  for (const [nom, de, vers] of M) {
    const n = original.split(de).length - 1;
    if (n !== 1) { introuvables += 1; console.log('??  ' + nom + ' — ancre trouvee ' + n + ' fois (attendu 1)'); continue; }
    fs.writeFileSync(path.join(ICI, 'src/BlockSkins.sol'), original.replace(de, () => vers));
    const r = lancer();
    const compile = !/Compiler run failed/.test(r.sortie);
    const rouges = [...new Set((r.sortie.match(/^\[FAIL[^\n]*/gm) || []).map((l) => (l.match(/(test\w+)\(/) || ['', '?'])[1]))];
    if (r.vert) { survivants += 1; console.log('SURVIT  ' + nom); }
    else console.log('tue ' + nom + (compile ? ' — ' + rouges.length + ' rouge(s) : ' + rouges.slice(0, 3).join(', ') : ' — NE COMPILE PAS (ne prouve rien)'));
  }
} finally {
  fs.rmSync(ICI, { recursive: true, force: true });
}
console.log('\n' + M.length + ' mutants, ' + survivants + ' survivant(s), ' + introuvables + ' ancre(s) introuvable(s)');
process.exit(survivants || introuvables ? 1 : 0);
